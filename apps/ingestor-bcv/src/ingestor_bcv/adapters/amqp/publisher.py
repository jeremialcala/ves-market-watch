"""Publicador de eventos en RabbitMQ (ADR-0004).

Topic exchange `market.events`, routing key `official.rate.updated`,
mensajes persistentes con publisher confirms. Todos los eventos llevan el
sobre estándar: `event_id`, `event_type`, `schema_version`, `occurred_at`.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

import aio_pika

from ingestor_bcv.domain.models import TasaOficial

ROUTING_KEY = "official.rate.updated"
SCHEMA_VERSION = 1


def construir_evento(tasa: TasaOficial) -> dict:
    """Sobre + payload del evento `official.rate.updated` (contrato del bus)."""
    return {
        "event_id": str(uuid.uuid4()),
        "event_type": ROUTING_KEY,
        "schema_version": SCHEMA_VERSION,
        "occurred_at": datetime.now(UTC).isoformat(),
        "producer": "ingestor-bcv",
        "payload": {
            "source": tasa.fuente,
            "currency": tasa.moneda,
            "rate": str(tasa.valor),
            "value_date": tasa.fecha_valor.isoformat(),
            "captured_at": tasa.capturada_en.isoformat(),
            "status": tasa.estado.value,
        },
    }


class AmqpEventPublisher:
    """Adaptador del puerto `EventPublisher` sobre aio-pika.

    La conexión es perezosa y robusta (reconexión automática de aio-pika).
    El canal se abre con publisher confirms: `publish` no retorna hasta que
    el broker confirma la entrega al exchange.
    """

    def __init__(self, amqp_url: str, exchange_name: str = "market.events") -> None:
        self._amqp_url = amqp_url
        self._exchange_name = exchange_name
        self._connection: aio_pika.abc.AbstractRobustConnection | None = None
        self._exchange: aio_pika.abc.AbstractExchange | None = None

    async def _asegurar_canal(self) -> aio_pika.abc.AbstractExchange:
        if self._exchange is None:
            self._connection = await aio_pika.connect_robust(self._amqp_url)
            canal = await self._connection.channel(publisher_confirms=True)
            self._exchange = await canal.declare_exchange(
                self._exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
            )
        return self._exchange

    async def publish_rate_updated(self, tasa: TasaOficial) -> None:
        exchange = await self._asegurar_canal()
        evento = construir_evento(tasa)
        mensaje = aio_pika.Message(
            body=json.dumps(evento, ensure_ascii=False).encode("utf-8"),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            message_id=evento["event_id"],
            timestamp=datetime.now(UTC),
        )
        await exchange.publish(mensaje, routing_key=ROUTING_KEY)

    async def close(self) -> None:
        if self._connection is not None:
            await self._connection.close()
            self._connection = None
            self._exchange = None
