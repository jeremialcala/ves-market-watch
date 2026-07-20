"""Consumidor de `market.events` con DLQ (ADR-0004, PRD RF-1).

Topología declarada al conectar:
- exchange topic `market.events` (durable) — el mismo que usan los ingestores.
- exchange fanout `market.events.dlx` (durable) + cola `market.events.dlq` ligada.
- cola durable `indicator-engine.market.events` con `x-dead-letter-exchange`
  apuntando a la DLX, ligada a las routing keys que el motor procesa.

Manejo de mensajes:
- Schema inválido o JSON corrupto → `reject(requeue=False)` → DLQ + alerta (A05/A08).
- Error de procesamiento → también DLQ + alerta (nunca poison-loop de reentregas).
- Procesado (incluido duplicado idempotente) → ack.
"""

from __future__ import annotations

import json
import logging

import aio_pika

from indicator_engine.application.contracts import EventoInvalido, ValidadorDeContratos
from indicator_engine.application.ports import AlertNotifier
from indicator_engine.application.process_official_rate import ProcesarTasaOficial
from indicator_engine.application.process_p2p_snapshot import ProcesarSnapshotP2P

logger = logging.getLogger("indicator_engine")

ROUTING_KEYS = ("official.rate.updated", "p2p.snapshot")


class ConsumidorMarketEvents:
    def __init__(
        self,
        amqp_url: str,
        procesador_tasa_oficial: ProcesarTasaOficial,
        validador: ValidadorDeContratos,
        notifier: AlertNotifier,
        exchange_name: str = "market.events",
        queue_name: str = "indicator-engine.market.events",
        dlx_name: str = "market.events.dlx",
        dlq_name: str = "market.events.dlq",
        prefetch: int = 10,
        procesador_snapshot_p2p: ProcesarSnapshotP2P | None = None,
    ) -> None:
        self._amqp_url = amqp_url
        self._procesador = procesador_tasa_oficial
        self._procesador_p2p = procesador_snapshot_p2p
        self._validador = validador
        self._notifier = notifier
        self._exchange_name = exchange_name
        self._queue_name = queue_name
        self._dlx_name = dlx_name
        self._dlq_name = dlq_name
        self._prefetch = prefetch
        self._connection: aio_pika.abc.AbstractRobustConnection | None = None
        self._cola: aio_pika.abc.AbstractQueue | None = None

    async def _asegurar_topologia(self) -> aio_pika.abc.AbstractQueue:
        if self._cola is None:
            self._connection = await aio_pika.connect_robust(self._amqp_url)
            canal = await self._connection.channel()
            await canal.set_qos(prefetch_count=self._prefetch)

            exchange = await canal.declare_exchange(
                self._exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
            )
            dlx = await canal.declare_exchange(
                self._dlx_name, aio_pika.ExchangeType.FANOUT, durable=True
            )
            dlq = await canal.declare_queue(self._dlq_name, durable=True)
            await dlq.bind(dlx)

            self._cola = await canal.declare_queue(
                self._queue_name,
                durable=True,
                arguments={"x-dead-letter-exchange": self._dlx_name},
            )
            for routing_key in ROUTING_KEYS:
                await self._cola.bind(exchange, routing_key=routing_key)
        return self._cola

    async def _manejar(self, mensaje: aio_pika.abc.AbstractIncomingMessage) -> None:
        try:
            evento = json.loads(mensaje.body)
            tipo = evento.get("event_type") if isinstance(evento, dict) else None
            if tipo == "official.rate.updated":
                dto = self._validador.validar_tasa_oficial(evento)
                procesador, etiqueta = self._procesador, f"{dto.moneda} {dto.valor}"
            elif tipo == "p2p.snapshot" and self._procesador_p2p is not None:
                dto = self._validador.validar_snapshot_p2p(evento)
                procesador = self._procesador_p2p
                etiqueta = f"{dto.side} {dto.asset}/{dto.fiat} ({len(dto.anuncios)} anuncios)"
            else:
                raise EventoInvalido(f"event_type no manejado: {tipo!r}")
        except (json.JSONDecodeError, EventoInvalido, KeyError, ValueError) as exc:
            await self._notifier.alertar(f"Evento inválido enviado a DLQ: {exc}")
            await mensaje.reject(requeue=False)
            return

        try:
            resultado = await procesador.ejecutar(dto)
        except Exception as exc:
            await self._notifier.alertar(
                f"Error procesando {dto.event_id} ({etiqueta}); a DLQ: {exc}"
            )
            await mensaje.reject(requeue=False)
            return

        await mensaje.ack()
        if resultado.duplicado:
            logger.info("evento %s duplicado — ignorado (idempotencia)", dto.event_id)
        else:
            logger.info(
                "procesado %s: %s → %d indicador(es)%s",
                dto.event_id,
                etiqueta,
                len(resultado.indicadores),
                " [official_stale]" if resultado.official_stale else "",
            )

    async def procesar_disponibles(self) -> int:
        """Drena los mensajes ya encolados y retorna cuántos manejó.

        Determinista: útil para tests y para procesar por lotes; `run_forever`
        es el modo daemon.
        """
        cola = await self._asegurar_topologia()
        manejados = 0
        while True:
            try:
                mensaje = await cola.get(timeout=1)
            except aio_pika.exceptions.QueueEmpty:
                return manejados
            await self._manejar(mensaje)
            manejados += 1

    async def run_forever(self) -> None:
        cola = await self._asegurar_topologia()
        logger.info(
            "consumiendo %s (bindings: %s)", self._queue_name, ", ".join(ROUTING_KEYS)
        )
        async with cola.iterator() as iterador:
            async for mensaje in iterador:
                await self._manejar(mensaje)

    async def close(self) -> None:
        if self._connection is not None:
            await self._connection.close()
            self._connection = None
            self._cola = None
