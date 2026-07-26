"""Consumidor de `market.events` para el push WSS (aio-pika).

Cola EFÍMERA (exclusiva, auto-delete, nombrada por el servidor) — decisión de
ADR-0016: el push WSS es fan-out en tiempo real; si el gateway está caído no
hay nadie a quien empujar, y el estado consultable vive en REST/DB. Una cola
durable solo acumularía backlog sin destinatario.

Todo evento consumido se valida contra su JSON Schema (`schemas/`, A05/A08)
antes de difundirse; un evento inválido se descarta con log — la DLQ del
pipeline es responsabilidad del consumidor durable (indicator-engine).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import aio_pika
import jsonschema

from api_gateway.application.suscripciones import EVENTO_A_TOPICO, GestorSuscripciones

logger = logging.getLogger(__name__)

_SCHEMA_POR_EVENTO = {
    "official.rate.updated": "official-rate.v1.json",
    "p2p.snapshot": "p2p-snapshot.v1.json",
    "indicators.updated": "indicators.v1.json",
    "signals.emitted": "signal.v1.json",
}


class ConsumidorPushWss:
    def __init__(
        self,
        amqp_url: str,
        exchange_name: str,
        gestor: GestorSuscripciones,
        schemas_dir: str,
    ) -> None:
        self._amqp_url = amqp_url
        self._exchange_name = exchange_name
        self._gestor = gestor
        self._schemas_dir = Path(schemas_dir)
        self._schemas: dict[str, dict] = {}
        self._conexion: aio_pika.abc.AbstractRobustConnection | None = None

    async def start(self) -> None:
        self._conexion = await aio_pika.connect_robust(self._amqp_url)
        canal = await self._conexion.channel()
        exchange = await canal.declare_exchange(
            self._exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
        )
        cola = await canal.declare_queue("", exclusive=True, auto_delete=True)
        for routing_key in EVENTO_A_TOPICO:
            await cola.bind(exchange, routing_key)
        await cola.consume(self._on_message)
        logger.info(
            "consumidor de push WSS conectado (cola efímera %s)", cola.name
        )

    def conectado(self) -> bool:
        return self._conexion is not None and not self._conexion.is_closed

    async def close(self) -> None:
        if self._conexion is not None:
            await self._conexion.close()
            self._conexion = None

    # -- consumo ------------------------------------------------------------

    async def _on_message(self, mensaje: aio_pika.abc.AbstractIncomingMessage) -> None:
        # Ack siempre: el push es best-effort; reintentar un push viejo no aporta.
        async with mensaje.process(ignore_processed=True):
            try:
                evento = json.loads(mensaje.body)
            except (ValueError, UnicodeDecodeError):
                logger.warning("evento ilegible en el bus; descartado")
                return
            event_type = evento.get("event_type") if isinstance(evento, dict) else None
            topico = EVENTO_A_TOPICO.get(event_type or "")
            if topico is None:
                return
            try:
                jsonschema.validate(evento, self._schema(event_type))
            except jsonschema.ValidationError as exc:
                logger.warning(
                    "evento %s inválido contra su schema; descartado: %s",
                    event_type,
                    exc.message,
                )
                return
            entregados = await self._gestor.difundir(
                topico,
                {
                    "topic": topico,
                    "event_id": evento["event_id"],
                    "occurred_at": evento["occurred_at"],
                    "data": evento["payload"],
                },
            )
            logger.debug("%s → %d cliente(s) WSS", event_type, entregados)

    def _schema(self, event_type: str) -> dict:
        if event_type not in self._schemas:
            ruta = self._schemas_dir / _SCHEMA_POR_EVENTO[event_type]
            self._schemas[event_type] = json.loads(ruta.read_text(encoding="utf-8"))
        return self._schemas[event_type]
