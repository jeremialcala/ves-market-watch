"""Integración: consumidor completo contra RabbitMQ y TimescaleDB reales.

Cada test arma su propia topología con nombres únicos (exchange, cola, DLX,
DLQ) para no interferir con la de desarrollo ni entre tests.
"""

import json
import uuid
from decimal import Decimal

import aio_pika
import pytest

from indicator_engine.adapters.amqp.consumer import ConsumidorMarketEvents
from indicator_engine.adapters.amqp.publisher import AmqpEventPublisher
from indicator_engine.adapters.memory import LoggingAlertNotifier
from indicator_engine.adapters.timescale.repository import TimescaleIndicatorRepository
from indicator_engine.application.contracts import ValidadorDeContratos
from indicator_engine.application.process_official_rate import ProcesarTasaOficial

pytestmark = pytest.mark.integration


@pytest.fixture
async def entorno(amqp_listo, pool):
    """Topología aislada + consumidor bajo prueba + productor y cola espía."""
    from pathlib import Path

    schemas_dir = Path(__file__).parents[4] / "schemas"
    sufijo = uuid.uuid4().hex[:8]
    nombres = {
        "exchange": f"market.events.itest-{sufijo}",
        "queue": f"engine.itest-{sufijo}",
        "dlx": f"market.events.dlx.itest-{sufijo}",
        "dlq": f"market.events.dlq.itest-{sufijo}",
    }

    repo = TimescaleIndicatorRepository(pool)
    publisher = AmqpEventPublisher(amqp_listo, nombres["exchange"])
    notifier = LoggingAlertNotifier()
    consumidor = ConsumidorMarketEvents(
        amqp_url=amqp_listo,
        procesador_tasa_oficial=ProcesarTasaOficial(publisher, repo),
        validador=ValidadorDeContratos(schemas_dir),
        notifier=notifier,
        exchange_name=nombres["exchange"],
        queue_name=nombres["queue"],
        dlx_name=nombres["dlx"],
        dlq_name=nombres["dlq"],
    )

    conexion = await aio_pika.connect(amqp_listo)
    canal = await conexion.channel()
    exchange = await canal.declare_exchange(
        nombres["exchange"], aio_pika.ExchangeType.TOPIC, durable=True
    )
    espia = await canal.declare_queue(exclusive=True, auto_delete=True)
    await espia.bind(exchange, routing_key="indicators.updated")

    async def publicar(cuerpo: bytes, routing_key: str = "official.rate.updated"):
        await exchange.publish(
            aio_pika.Message(body=cuerpo, content_type="application/json"),
            routing_key=routing_key,
        )

    yield consumidor, publicar, espia, canal, nombres, notifier

    await consumidor.close()
    await publisher.close()
    await canal.queue_delete(nombres["queue"])
    await canal.queue_delete(nombres["dlq"])
    await canal.exchange_delete(nombres["exchange"])
    await canal.exchange_delete(nombres["dlx"])
    await conexion.close()


async def test_evento_valido_produce_indicador_y_evento(entorno, pool, crear_evento):
    consumidor, publicar, espia, _, _, _ = entorno
    await consumidor.procesar_disponibles()  # declara topología antes de publicar

    evento = crear_evento(rate="667.05000000")
    await publicar(json.dumps(evento).encode())

    assert await consumidor.procesar_disponibles() == 1

    fila = await pool.fetchrow(
        "SELECT value, calc_version FROM indicators WHERE indicator = 'official_rate'"
    )
    assert fila["value"] == Decimal("667.05")
    assert fila["calc_version"] == 1

    mensaje = await espia.get(timeout=5)
    await mensaje.ack()
    emitido = json.loads(mensaje.body)
    assert emitido["event_type"] == "indicators.updated"
    assert emitido["payload"]["triggered_by"] == evento["event_id"]


async def test_evento_duplicado_se_ignora(entorno, pool, crear_evento):
    consumidor, publicar, espia, _, _, _ = entorno
    await consumidor.procesar_disponibles()

    evento = crear_evento()
    await publicar(json.dumps(evento).encode())
    await publicar(json.dumps(evento).encode())  # reentrega simulada

    assert await consumidor.procesar_disponibles() == 2

    total = await pool.fetchval(
        "SELECT count(*) FROM indicators WHERE indicator = 'official_rate'"
    )
    assert total == 1
    mensaje = await espia.get(timeout=5)
    await mensaje.ack()
    with pytest.raises(aio_pika.exceptions.QueueEmpty):
        await espia.get(timeout=1)


async def test_eventos_invalidos_van_a_la_dlq(entorno, pool, crear_evento):
    consumidor, publicar, _, canal, nombres, notifier = entorno
    await consumidor.procesar_disponibles()

    roto = crear_evento()
    del roto["payload"]["rate"]
    await publicar(b"esto no es json")
    await publicar(json.dumps(roto).encode())

    assert await consumidor.procesar_disponibles() == 2

    dlq = await canal.declare_queue(nombres["dlq"], durable=True)
    estado = await dlq.declare()  # redeclara y trae message_count
    assert estado.message_count == 2
    assert await pool.fetchval("SELECT count(*) FROM indicators") == 0
    assert len(notifier.alertas) == 2
