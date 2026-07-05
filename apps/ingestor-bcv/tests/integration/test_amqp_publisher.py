"""Integración: `AmqpEventPublisher` contra RabbitMQ real (docker compose)."""

import json
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import aio_pika
import pytest

from ingestor_bcv.adapters.amqp.publisher import ROUTING_KEY, AmqpEventPublisher
from ingestor_bcv.domain.models import TasaOficial

pytestmark = pytest.mark.integration


def _tasa() -> TasaOficial:
    return TasaOficial(
        moneda="USD",
        valor=Decimal("667.05000000"),
        fecha_valor=date(2026, 7, 6),
        capturada_en=datetime(2026, 7, 5, 21, 30, tzinfo=UTC),
    )


@pytest.fixture
async def infra_amqp(amqp_listo):
    """Publisher bajo prueba + cola consumidora ligada a un exchange único."""
    nombre_exchange = f"market.events.itest-{uuid.uuid4().hex[:8]}"
    publisher = AmqpEventPublisher(amqp_listo, nombre_exchange)

    conexion = await aio_pika.connect(amqp_listo)
    canal = await conexion.channel()
    exchange = await canal.declare_exchange(
        nombre_exchange, aio_pika.ExchangeType.TOPIC, durable=True
    )
    cola = await canal.declare_queue(exclusive=True, auto_delete=True)
    await cola.bind(exchange, routing_key=ROUTING_KEY)

    yield publisher, cola

    await publisher.close()
    await canal.exchange_delete(nombre_exchange)
    await conexion.close()


async def test_publica_con_confirmacion_y_el_mensaje_llega_integro(infra_amqp):
    publisher, cola = infra_amqp

    # Con publisher confirms, al retornar ya está en el broker: se puede leer de inmediato.
    await publisher.publish_rate_updated(_tasa())

    mensaje = await cola.get(timeout=5)
    await mensaje.ack()

    assert mensaje.routing_key == "official.rate.updated"
    assert mensaje.content_type == "application/json"
    assert mensaje.delivery_mode == aio_pika.DeliveryMode.PERSISTENT

    evento = json.loads(mensaje.body)
    assert evento["event_type"] == "official.rate.updated"
    assert evento["schema_version"] == 1
    assert evento["producer"] == "ingestor-bcv"
    assert mensaje.message_id == evento["event_id"]
    assert evento["payload"] == {
        "source": "BCV",
        "currency": "USD",
        "rate": "667.05000000",
        "value_date": "2026-07-06",
        "captured_at": "2026-07-05T21:30:00+00:00",
        "status": "valid",
    }


async def test_close_es_idempotente_y_la_conexion_reabre_perezosamente(infra_amqp):
    publisher, cola = infra_amqp

    await publisher.publish_rate_updated(_tasa())
    await publisher.close()
    await publisher.close()  # segundo close: no-op

    await publisher.publish_rate_updated(_tasa())  # reconecta solo

    primero = await cola.get(timeout=5)
    await primero.ack()
    segundo = await cola.get(timeout=5)
    await segundo.ack()
    # Dos publicaciones independientes: ids de evento distintos.
    assert primero.message_id != segundo.message_id
