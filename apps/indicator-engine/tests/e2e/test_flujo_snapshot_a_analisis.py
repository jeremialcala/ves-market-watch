"""E2E: `p2p.snapshot` → indicadores + `analysis.updated`, contra RabbitMQ y
TimescaleDB reales (RF-6, ADR-0019).

Cierra el tramo bus → engine → bus del análisis: el evento entra por el
contrato de entrada, sale por el de salida validado contra
`schemas/analysis.v1.json`, y el documento que se publicó es exactamente el que
queda en `indicator_analysis` — que es lo que después sirve el gateway.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import aio_pika
import pytest
import yaml
from jsonschema import Draft202012Validator

from indicator_engine.adapters.amqp.consumer import ConsumidorMarketEvents
from indicator_engine.adapters.amqp.publisher import AmqpEventPublisher
from indicator_engine.adapters.memory import LoggingAlertNotifier
from indicator_engine.adapters.timescale.distribuciones import DistribucionesConTTL
from indicator_engine.adapters.timescale.repository import (
    TimescaleDistribucionRepository,
    TimescaleIndicatorRepository,
)
from indicator_engine.application.analizar_revision import AnalizarRevision
from indicator_engine.application.contracts import ValidadorDeContratos
from indicator_engine.application.process_official_rate import ProcesarTasaOficial
from indicator_engine.application.process_p2p_snapshot import ProcesarSnapshotP2P
from indicator_engine.domain.analisis import cargar_config_analisis
from indicator_engine.domain.reglas import cargar_ruleset

from tests.conftest import anuncio_p2p, evento_snapshot_p2p

pytestmark = pytest.mark.e2e

SCHEMAS_DIR = Path(__file__).parents[4] / "schemas"
CONFIG_DIR = Path(__file__).parents[2] / "config"

# Mínimo de muestras a 1 para ejercitar el camino de PERCENTILES sin esperar los
# ~100 min de captura del arranque en frío (ADR-0019 D.4). Con la config del
# repo (200) este test vería el respaldo, que ya cubre el test unitario.
MUESTRAS_MINIMAS_E2E = 1


async def test_flujo_de_snapshot_a_analisis(amqp_listo, pool):
    sufijo = uuid.uuid4().hex[:8]
    exchange_name = f"market.events.e2e-{sufijo}"

    config = cargar_config_analisis(
        {
            **yaml.safe_load((CONFIG_DIR / "analisis.v1.yaml").read_text(encoding="utf-8")),
            "muestras_minimas": MUESTRAS_MINIMAS_E2E,
        }
    )
    ruleset = cargar_ruleset(
        yaml.safe_load((CONFIG_DIR / "senales.v1.yaml").read_text(encoding="utf-8"))
    )

    repo = TimescaleIndicatorRepository(pool)
    publisher = AmqpEventPublisher(amqp_listo, exchange_name)
    analisis = AnalizarRevision(
        config=config,
        ruleset=ruleset,
        distribuciones=DistribucionesConTTL(TimescaleDistribucionRepository(pool)),
        repository=repo,
        publisher=publisher,
    )
    consumidor = ConsumidorMarketEvents(
        amqp_url=amqp_listo,
        procesador_tasa_oficial=ProcesarTasaOficial(publisher, repo),
        validador=ValidadorDeContratos(SCHEMAS_DIR),
        notifier=LoggingAlertNotifier(),
        exchange_name=exchange_name,
        queue_name=f"engine.e2e-{sufijo}",
        dlx_name=f"dlx.e2e-{sufijo}",
        dlq_name=f"dlq.e2e-{sufijo}",
        procesador_snapshot_p2p=ProcesarSnapshotP2P(
            publisher, repo, ruleset=ruleset, analisis=analisis
        ),
    )

    conexion = await aio_pika.connect(amqp_listo)
    canal = await conexion.channel()
    exchange = await canal.declare_exchange(
        exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
    )
    espia = await canal.declare_queue(exclusive=True, auto_delete=True)
    await espia.bind(exchange, routing_key="analysis.updated")

    try:
        await consumidor.procesar_disponibles()  # declara topología

        # Historia previa del medidor de outliers para que su escala salga por
        # percentiles reales y no por respaldo.
        ahora = datetime.now(UTC)
        await pool.executemany(
            """
            INSERT INTO indicators (as_of, indicator, currency, value, calc_version)
            VALUES ($1, 'p2p_outliers_pct_buy', 'VES', $2, 1)
            ON CONFLICT DO NOTHING
            """,
            [
                (ahora - timedelta(hours=i + 1), Decimal(str(i)))
                for i in range(1, 21)
            ],
        )

        evento = evento_snapshot_p2p(
            side="BUY",
            ads=[anuncio_p2p(price=p) for p in ("858.00", "860.00", "862.00")],
            captured_at=ahora.isoformat(),
        )
        await exchange.publish(
            aio_pika.Message(
                body=json.dumps(evento).encode(), content_type="application/json"
            ),
            routing_key="p2p.snapshot",
        )
        assert await consumidor.procesar_disponibles() == 1

        # 1) El evento sale al bus y cumple su contrato publicado.
        publicado = json.loads((await espia.get(timeout=5)).body)
        schema = json.loads(
            (SCHEMAS_DIR / "analysis.v1.json").read_text(encoding="utf-8")
        )
        Draft202012Validator(schema).validate(publicado)

        payload = publicado["payload"]
        assert payload["currency"] == "VES"
        assert payload["triggered_by"] == evento["event_id"]
        assert payload["confidence"] == "normal"
        assert payload["analysis_version"] == config.version
        assert payload["ruleset_version"] == ruleset.version

        # 2) El medidor con historia sale por percentiles REALES de la tabla.
        outliers = next(
            i for i in payload["indicators"] if i["indicator"] == "p2p_outliers_pct_buy"
        )
        assert outliers["scale"]["source"] == "percentiles"
        assert [c["key"] for c in outliers["scale"]["cuts"]] == ["p10", "p50", "p90"]
        assert outliers["scale"]["samples"] >= 20

        # 3) Lo persistido es EXACTAMENTE lo publicado: es lo que sirve el GET.
        fila = await pool.fetchrow(
            "SELECT currency, scale_source, payload FROM indicator_analysis"
        )
        assert json.loads(fila["payload"]) == payload
        assert fila["currency"] == "VES"
        assert fila["scale_source"] in {"percentiles", "ruleset"}
    finally:
        await consumidor.close()
        await publisher.close()
        await canal.queue_delete(f"engine.e2e-{sufijo}")
        await canal.queue_delete(f"dlq.e2e-{sufijo}")
        await canal.exchange_delete(exchange_name)
        await canal.exchange_delete(f"dlx.e2e-{sufijo}")
        await conexion.close()
