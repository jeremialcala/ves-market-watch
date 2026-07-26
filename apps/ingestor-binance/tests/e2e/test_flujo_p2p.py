"""E2E: endpoint Binance fake local → CapturarSnapshot → RabbitMQ y TimescaleDB
reales → eventos `p2p.snapshot` válidos contra el schema compartido.

El fake sirve los fixtures REALES del spike (2026-07-05) con un outlier
sembrado en BUY para verificar el etiquetado de punta a punta.
"""

import json
import uuid
from pathlib import Path

import aio_pika
import pytest
from jsonschema import Draft202012Validator

from ingestor_binance.adapters.amqp.publisher import ROUTING_KEY, AmqpEventPublisher
from ingestor_binance.adapters.binance.client import FuenteBinanceP2P
from ingestor_binance.adapters.binance.resilience import (
    CircuitBreaker,
    PresupuestoDeRequests,
)
from ingestor_binance.adapters.memory import LoggingAlertNotifier
from ingestor_binance.adapters.timescale.repository import TimescaleSnapshotRepository
from ingestor_binance.application.capture_snapshot import CapturarSnapshot
from ingestor_binance.domain.models import Lado
from ingestor_binance.domain.normalizacion import Pseudonimizador

from conftest import SCHEMA_FUENTE, cargar_fixture  # type: ignore[import-not-found]

pytestmark = pytest.mark.e2e

SCHEMA_EVENTO = Path(__file__).parents[4] / "schemas" / "p2p-snapshot.v1.json"


async def test_flujo_completo_p2p(servidor_http, amqp_listo, pool):
    buy = cargar_fixture("buy")
    sell = cargar_fixture("sell")
    buy["data"][3]["adv"]["price"] = "7450.000"  # anuncio manipulado sembrado

    def manejador(peticion: dict):
        datos = buy if peticion["tradeType"] == "BUY" else sell
        if peticion["page"] == 1:
            return 200, datos
        return 200, {**datos, "data": []}  # una sola página por lado

    url = await servidor_http(manejador)

    nombre_exchange = f"market.events.e2e-{uuid.uuid4().hex[:8]}"
    publisher = AmqpEventPublisher(amqp_listo, nombre_exchange)
    conexion = await aio_pika.connect(amqp_listo)
    canal = await conexion.channel()
    exchange = await canal.declare_exchange(
        nombre_exchange, aio_pika.ExchangeType.TOPIC, durable=True
    )
    espia = await canal.declare_queue(exclusive=True, auto_delete=True)
    await espia.bind(exchange, routing_key=ROUTING_KEY)

    caso = CapturarSnapshot(
        source=FuenteBinanceP2P(
            url=url,
            asset="USDT",
            fiat="VES",
            schema_fuente=SCHEMA_FUENTE,
            presupuesto=PresupuestoDeRequests(1000),
            top_k=40,
            rows_per_page=20,
        ),
        publisher=publisher,
        repository=TimescaleSnapshotRepository(pool),
        notifier=LoggingAlertNotifier(),
        breaker=CircuitBreaker(),
        pseudonimizador=Pseudonimizador("clave-e2e-suficientemente-larga"),
    )

    try:
        for lado in (Lado.BUY, Lado.SELL):
            resumen = await caso.ejecutar(lado)
            assert resumen.publicado, resumen.error

        # Bus: dos eventos válidos contra el contrato compartido.
        schema = json.loads(SCHEMA_EVENTO.read_text(encoding="utf-8"))
        validador = Draft202012Validator(schema)
        eventos = []
        for _ in range(2):
            mensaje = await espia.get(timeout=5)
            await mensaje.ack()
            evento = json.loads(mensaje.body)
            validador.validate(evento)
            eventos.append(evento)

        por_lado = {e["payload"]["side"]: e["payload"] for e in eventos}
        assert set(por_lado) == {"BUY", "SELL"}
        assert len(por_lado["BUY"]["ads"]) == 20
        # El anuncio manipulado viaja etiquetado, no filtrado.
        assert sum(a["outlier"] for a in por_lado["BUY"]["ads"]) == 1
        assert por_lado["BUY"]["ads"][3]["outlier"] is True
        assert sum(a["outlier"] for a in por_lado["SELL"]["ads"]) == 0

        # DB: crudos persistidos para reproceso (RF-5).
        filas = await pool.fetch(
            "SELECT side, ad_count, partial FROM p2p_snapshots_raw ORDER BY side"
        )
        assert [(f["side"], f["ad_count"], f["partial"]) for f in filas] == [
            ("BUY", 20, False),
            ("SELL", 20, False),
        ]
        # Minimización + pseudonimización (ADR-0011): el alias jamás toca el
        # disco; la identidad sobrevive solo como merchant_ref de 32 hex.
        crudo = json.loads(
            await pool.fetchval("SELECT raw FROM p2p_snapshots_raw WHERE side = 'BUY'")
        )
        assert all("nickName" not in item["advertiser"] for item in crudo)
        assert all("userType" in item["advertiser"] for item in crudo)
        assert all(
            len(item["advertiser"]["merchant_ref"]) == 32
            and int(item["advertiser"]["merchant_ref"], 16) >= 0
            for item in crudo
        )
        assert all(len(a["merchant_ref"]) == 32 for a in por_lado["BUY"]["ads"])
    finally:
        await publisher.close()
        await canal.exchange_delete(nombre_exchange)
        await conexion.close()
