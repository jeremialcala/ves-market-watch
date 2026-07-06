"""Publicador de `indicators.updated` en RabbitMQ (ADR-0004).

Mismo patrón que el publisher del ingestor-bcv: topic exchange `market.events`,
publisher confirms, mensajes persistentes, sobre estándar.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

import aio_pika

from indicator_engine.domain.models import Indicador

ROUTING_KEY = "indicators.updated"
SCHEMA_VERSION = 1


def construir_evento_indicadores(
    indicadores: list[Indicador],
    official_stale: bool,
    triggered_by: str,
    as_of: datetime,
) -> dict:
    """Sobre + payload del evento `indicators.updated` (schemas/indicators.v1.json)."""
    calc_version = indicadores[0].calc_version if indicadores else 1
    return {
        "event_id": str(uuid.uuid4()),
        "event_type": ROUTING_KEY,
        "schema_version": SCHEMA_VERSION,
        "occurred_at": datetime.now(UTC).isoformat(),
        "producer": "indicator-engine",
        "payload": {
            "as_of": as_of.isoformat(),
            "calc_version": calc_version,
            "official_stale": official_stale,
            "triggered_by": triggered_by,
            "indicators": [
                {
                    "indicator": indicador.nombre,
                    "currency": indicador.moneda,
                    "value": str(indicador.valor),
                }
                for indicador in indicadores
            ],
        },
    }


class AmqpEventPublisher:
    """Adaptador del puerto `EventPublisher` sobre aio-pika (confirms + persistente)."""

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

    async def publish_indicators_updated(
        self,
        indicadores: list[Indicador],
        official_stale: bool,
        triggered_by: str,
        as_of: datetime,
    ) -> None:
        exchange = await self._asegurar_canal()
        evento = construir_evento_indicadores(indicadores, official_stale, triggered_by, as_of)
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
