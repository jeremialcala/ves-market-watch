"""Consumidor de `market.events` para el push WSS (aio-pika).

Cola EFÍMERA (exclusiva, auto-delete, con nombre generado) — decisión de
ADR-0016: el push WSS es fan-out en tiempo real; si el gateway está caído no
hay nadie a quien empujar, y el estado consultable vive en REST/DB. Una cola
durable solo acumularía backlog sin destinatario.

Todo evento consumido se valida contra su JSON Schema (`schemas/`, A05/A08)
antes de difundirse; un evento inválido se descarta con log — la DLQ del
pipeline es responsabilidad del consumidor durable (indicator-engine).

Disponibilidad (el push WSS no debe morir por una caída del bus):
- `start()` nunca lanza. Si el broker no está al arrancar, deja un supervisor
  reintentando con backoff exponencial + jitter hasta conectar; el REST sirve
  mientras tanto y `/health` reporta `broker: down` (ADR-0016).
- Una vez establecida, la reconexión la hace la propia `RobustConnection`:
  re-declara la cola efímera (nombre generado en cliente, `amq_<hex>`, no
  reservado), sus bindings y el consumidor. Aquí solo se observan las
  transiciones para alertar (caída y restablecimiento, una vez por episodio).
- `conectado()` (lo que ve `/health`) responde «hay consumo», no «hay socket»:
  antes miraba `is_closed`, que en una RobustConnection solo es cierto tras un
  `close()` explícito — reportaba «broker ok» durante toda la caída.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import random
from pathlib import Path

import aio_pika
import jsonschema

from api_gateway.adapters.alertas import LoggingAlertNotifier
from api_gateway.application.ports import AlertNotifier
from api_gateway.application.suscripciones import EVENTO_A_TOPICO, GestorSuscripciones

logger = logging.getLogger(__name__)

_SCHEMA_POR_EVENTO = {
    "official.rate.updated": "official-rate.v1.json",
    "p2p.snapshot": "p2p-snapshot.v1.json",
    "indicators.updated": "indicators.v1.json",
    "signals.emitted": "signal.v1.json",
    "analysis.updated": "analysis.v1.json",
}


class ConsumidorPushWss:
    def __init__(
        self,
        amqp_url: str,
        exchange_name: str,
        gestor: GestorSuscripciones,
        schemas_dir: str,
        notifier: AlertNotifier | None = None,
        *,
        timeout_conexion_s: float = 5.0,
        reconexion_s: float = 5.0,
        espera_min_s: float = 1.0,
        espera_max_s: float = 30.0,
    ) -> None:
        self._amqp_url = amqp_url
        self._exchange_name = exchange_name
        self._gestor = gestor
        self._schemas_dir = Path(schemas_dir)
        self._schemas: dict[str, dict] = {}
        self._notifier = notifier or LoggingAlertNotifier()
        self._timeout_conexion_s = timeout_conexion_s
        self._reconexion_s = reconexion_s
        self._espera_min_s = espera_min_s
        self._espera_max_s = espera_max_s
        self._conexion: aio_pika.abc.AbstractRobustConnection | None = None
        self._supervisor: asyncio.Task | None = None
        self._cerrando = False
        self._alertado = False
        self._activo = False

    async def start(self) -> None:
        """Conecta al bus; si no está, reintenta en segundo plano. Nunca lanza."""
        self._cerrando = False
        try:
            await self._conectar()
        except Exception as exc:  # noqa: BLE001 — REST sirve aunque el bus falte
            logger.warning(
                "broker no disponible al arrancar (%s); push WSS deshabilitado "
                "hasta reconectar — /health lo reporta degraded",
                exc,
            )
            await self._alertar_caida(f"broker no disponible al arrancar ({exc})")
            self._supervisor = asyncio.create_task(
                self._reintentar_hasta_conectar(), name="push-wss-reconexion"
            )

    def conectado(self) -> bool:
        # «Consumiendo», no «hay socket»: aio-pika marca `connected` antes de
        # restaurar canal/cola/consumidor, y esa restauración puede fallar y
        # volver a caer. /health no debe cantar victoria hasta que el consumo
        # esté de vuelta.
        conexion = self._conexion
        return conexion is not None and self._activo and conexion.connected.is_set()

    async def close(self) -> None:
        self._cerrando = True
        if self._supervisor is not None:
            self._supervisor.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._supervisor
            self._supervisor = None
        if self._conexion is not None:
            await self._conexion.close()
            self._conexion = None

    # -- conexión y recuperación --------------------------------------------

    async def _conectar(self) -> None:
        # La conexión se instancia y se conecta por separado (en vez de
        # `connect_robust`, que hace ambas cosas): un intento fallido deja
        # dentro de la RobustConnection una tarea de reconexión propia que
        # reintenta para siempre y sobrevive a la cancelación — sin el objeto
        # en la mano no hay a quién cerrarle. Con cada reintento del supervisor
        # eso sería un zombi más.
        conexion = aio_pika.RobustConnection(
            self._amqp_url,  # Connection.__init__ normaliza el str a URL
            reconnect_interval=self._reconexion_s,
        )
        try:
            # La topología también se acota: un canal colgado bloquearía el
            # arranque del gateway entero (start() corre en el lifespan).
            async with asyncio.timeout(self._timeout_conexion_s):
                await conexion.connect(timeout=self._timeout_conexion_s)
                canal = await conexion.channel()
                exchange = await canal.declare_exchange(
                    self._exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
                )
                cola = await canal.declare_queue("", exclusive=True, auto_delete=True)
                for routing_key in EVENTO_A_TOPICO:
                    await cola.bind(exchange, routing_key)
                await cola.consume(self._on_message)
        except BaseException:
            await conexion.close()
            raise
        conexion.close_callbacks.add(self._al_perder_conexion)
        conexion.reconnect_callbacks.add(self._al_reconectar)
        self._conexion = conexion
        self._activo = True
        logger.info("consumidor de push WSS conectado (cola efímera %s)", cola.name)

    async def _reintentar_hasta_conectar(self) -> None:
        """Backoff exponencial con jitter hasta que el broker vuelva."""
        espera = self._espera_min_s
        while True:
            await asyncio.sleep(espera * (0.5 + random.random()))
            try:
                await self._conectar()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 — se reintenta indefinidamente
                logger.warning("reintento de conexión al bus falló: %s", exc)
                espera = min(espera * 2, self._espera_max_s)
            else:
                await self._alertar_restablecido()
                return

    async def _al_perder_conexion(
        self, _conexion: aio_pika.abc.AbstractConnection, exc: BaseException | None
    ) -> None:
        self._activo = False
        if self._cerrando:
            return
        await self._alertar_caida(
            f"conexión con el bus perdida ({exc or 'sin detalle'}); "
            f"aio-pika reintenta cada {self._reconexion_s:g} s"
        )

    async def _al_reconectar(
        self, _conexion: aio_pika.abc.AbstractRobustConnection
    ) -> None:
        # Solo llega aquí si la restauración de canal, cola, bindings y
        # consumidor salió bien: recién ahí hay push de nuevo.
        await self._alertar_restablecido()
        self._activo = True

    async def _alertar_caida(self, motivo: str) -> None:
        # Una alerta por episodio: reintentar cada pocos segundos no debe
        # convertirse en una tormenta de alertas.
        if self._alertado:
            return
        self._alertado = True
        await self._notifier.alertar(f"push WSS sin bus: {motivo}")

    async def _alertar_restablecido(self) -> None:
        if not self._alertado:
            return
        self._alertado = False
        logger.info("consumidor de push WSS restablecido")
        await self._notifier.alertar(
            "push WSS restablecido: consumo de market.events reanudado"
        )

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
