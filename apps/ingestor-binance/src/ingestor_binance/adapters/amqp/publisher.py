"""Publicador de `p2p.snapshot` en RabbitMQ (ADR-0004).

Mismo patrón que los demás servicios: topic exchange `market.events`,
publisher confirms, mensajes persistentes, sobre estándar con `occurred_at`.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

import aio_pika

from ingestor_binance.domain.models import SnapshotP2P

ROUTING_KEY = "p2p.snapshot"
SCHEMA_VERSION = 1


def construir_evento_snapshot(snapshot: SnapshotP2P) -> dict:
    """Sobre + payload del evento `p2p.snapshot` (schemas/p2p-snapshot.v1.json).
    El `event_id` actúa como snapshot_id de idempotencia para el consumidor."""
    return {
        "event_id": str(uuid.uuid4()),
        "event_type": ROUTING_KEY,
        "schema_version": SCHEMA_VERSION,
        "occurred_at": datetime.now(UTC).isoformat(),
        "producer": "ingestor-binance",
        "payload": {
            "side": snapshot.lado.value,
            "asset": snapshot.asset,
            "fiat": snapshot.fiat,
            "captured_at": snapshot.capturado_en.isoformat(),
            "partial": snapshot.parcial,
            "ads": [
                {
                    "adv_no": anuncio.adv_no,
                    "price": str(anuncio.precio),
                    "available_amount": str(anuncio.cantidad_disponible),
                    "min_limit": str(anuncio.limite_min),
                    "max_limit": str(anuncio.limite_max),
                    "trade_methods": list(anuncio.metodos_pago),
                    "merchant": anuncio.es_merchant,
                    "merchant_ref": anuncio.merchant_ref,
                    "outlier": anuncio.outlier,
                }
                for anuncio in snapshot.anuncios
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

    async def publish_p2p_snapshot(self, snapshot: SnapshotP2P) -> None:
        exchange = await self._asegurar_canal()
        evento = construir_evento_snapshot(snapshot)
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
