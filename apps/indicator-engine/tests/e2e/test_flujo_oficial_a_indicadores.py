"""E2E: dos eventos `official.rate.updated` consecutivos → indicadores con
variación calculada, persistidos y publicados, contra RabbitMQ/TimescaleDB reales.

El evento de entrada se construye conforme a `schemas/official-rate.v1.json`
(el mismo contrato que valida el contract test del ingestor-bcv), de modo que
esta prueba cubre el tramo bus → engine del flujo entre servicios.
"""

import json
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import aio_pika
import pytest
from jsonschema import Draft202012Validator

from indicator_engine.adapters.amqp.consumer import ConsumidorMarketEvents
from indicator_engine.adapters.amqp.publisher import AmqpEventPublisher
from indicator_engine.adapters.memory import LoggingAlertNotifier
from indicator_engine.adapters.timescale.repository import TimescaleIndicatorRepository
from indicator_engine.application.contracts import ValidadorDeContratos
from indicator_engine.application.process_official_rate import ProcesarTasaOficial

pytestmark = pytest.mark.e2e

SCHEMAS_DIR = Path(__file__).parents[4] / "schemas"


async def test_flujo_completo_de_tasa_oficial_a_indicadores(amqp_listo, pool, crear_evento):
    sufijo = uuid.uuid4().hex[:8]
    exchange_name = f"market.events.e2e-{sufijo}"

    repo = TimescaleIndicatorRepository(pool)
    publisher = AmqpEventPublisher(amqp_listo, exchange_name)
    consumidor = ConsumidorMarketEvents(
        amqp_url=amqp_listo,
        procesador_tasa_oficial=ProcesarTasaOficial(publisher, repo),
        validador=ValidadorDeContratos(SCHEMAS_DIR),
        notifier=LoggingAlertNotifier(),
        exchange_name=exchange_name,
        queue_name=f"engine.e2e-{sufijo}",
        dlx_name=f"dlx.e2e-{sufijo}",
        dlq_name=f"dlq.e2e-{sufijo}",
    )

    conexion = await aio_pika.connect(amqp_listo)
    canal = await conexion.channel()
    exchange = await canal.declare_exchange(
        exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
    )
    espia = await canal.declare_queue(exclusive=True, auto_delete=True)
    await espia.bind(exchange, routing_key="indicators.updated")

    try:
        await consumidor.procesar_disponibles()  # declara topología

        # Dos publicaciones del BCV con media hora de diferencia: 667.05 → 700.00.
        base = datetime.now(UTC) - timedelta(hours=1)
        evento_1 = crear_evento(rate="667.05000000", captured_at=base.isoformat())
        evento_2 = crear_evento(
            rate="700.00000000", captured_at=(base + timedelta(minutes=30)).isoformat()
        )
        for evento in (evento_1, evento_2):
            await exchange.publish(
                aio_pika.Message(
                    body=json.dumps(evento).encode(), content_type="application/json"
                ),
                routing_key="official.rate.updated",
            )

        assert await consumidor.procesar_disponibles() == 2

        # Persistencia: 2 tasas + variación abs/pct del segundo evento.
        filas = await pool.fetch(
            "SELECT indicator, value FROM indicators ORDER BY as_of, indicator"
        )
        por_nombre = [(f["indicator"], f["value"]) for f in filas]
        assert por_nombre[0] == ("official_rate", Decimal("667.05"))
        assert ("official_rate_change_abs", Decimal("32.95")) in por_nombre
        assert len(filas) == 4  # 2×official_rate + change_abs + change_pct

        # Publicación: dos indicators.updated; el segundo con variación y
        # trazabilidad al evento origen, y conforme a su schema.
        primero = json.loads((await espia.get(timeout=5)).body)
        segundo = json.loads((await espia.get(timeout=5)).body)
        assert len(primero["payload"]["indicators"]) == 1
        assert len(segundo["payload"]["indicators"]) == 3
        assert segundo["payload"]["triggered_by"] == evento_2["event_id"]
        assert segundo["payload"]["official_stale"] is False

        schema = json.loads((SCHEMAS_DIR / "indicators.v1.json").read_text(encoding="utf-8"))
        Draft202012Validator(schema).validate(segundo)

        valores = {i["indicator"]: i["value"] for i in segundo["payload"]["indicators"]}
        assert Decimal(valores["official_rate_change_abs"]) == Decimal("32.95")
        assert Decimal(valores["official_rate_change_pct"]) == (
            Decimal("32.95") / Decimal("667.05") * 100
        )
    finally:
        await consumidor.close()
        await publisher.close()
        await canal.queue_delete(f"engine.e2e-{sufijo}")
        await canal.queue_delete(f"dlq.e2e-{sufijo}")
        await canal.exchange_delete(exchange_name)
        await canal.exchange_delete(f"dlx.e2e-{sufijo}")
        await conexion.close()
