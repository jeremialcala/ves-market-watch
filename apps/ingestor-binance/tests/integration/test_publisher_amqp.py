"""Integración: `AmqpEventPublisher` de p2p.snapshot contra RabbitMQ real."""

import json
import uuid
from datetime import UTC, datetime
from decimal import Decimal

import aio_pika
import pytest

from ingestor_binance.adapters.amqp.publisher import ROUTING_KEY, AmqpEventPublisher
from ingestor_binance.domain.models import Anuncio, Lado, SnapshotP2P

pytestmark = pytest.mark.integration


def _snapshot() -> SnapshotP2P:
    return SnapshotP2P(
        lado=Lado.SELL,
        asset="USDT",
        fiat="VES",
        capturado_en=datetime(2026, 7, 6, 12, 0, tzinfo=UTC),
        parcial=False,
        anuncios=(
            Anuncio(
                adv_no="1",
                precio=Decimal("744.000"),
                cantidad_disponible=Decimal("50"),
                limite_min=Decimal("5000"),
                limite_max=Decimal("90000"),
                metodos_pago=("PagoMovil",),
                es_merchant=False,
            ),
        ),
    )


async def test_publica_y_el_mensaje_llega_integro(amqp_listo):
    nombre_exchange = f"market.events.itest-{uuid.uuid4().hex[:8]}"
    publisher = AmqpEventPublisher(amqp_listo, nombre_exchange)

    conexion = await aio_pika.connect(amqp_listo)
    canal = await conexion.channel()
    exchange = await canal.declare_exchange(
        nombre_exchange, aio_pika.ExchangeType.TOPIC, durable=True
    )
    cola = await canal.declare_queue(exclusive=True, auto_delete=True)
    await cola.bind(exchange, routing_key=ROUTING_KEY)

    try:
        await publisher.publish_p2p_snapshot(_snapshot())

        mensaje = await cola.get(timeout=5)
        await mensaje.ack()

        assert mensaje.routing_key == "p2p.snapshot"
        assert mensaje.delivery_mode == aio_pika.DeliveryMode.PERSISTENT
        evento = json.loads(mensaje.body)
        assert evento["event_type"] == "p2p.snapshot"
        assert evento["payload"]["side"] == "SELL"
        assert evento["payload"]["ads"][0]["price"] == "744.000"
        assert mensaje.message_id == evento["event_id"]
    finally:
        await publisher.close()
        await canal.exchange_delete(nombre_exchange)
        await conexion.close()
