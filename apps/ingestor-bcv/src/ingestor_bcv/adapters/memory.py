"""Adaptadores en memoria para `--dry-run` y tests unitarios.

Permiten ejercitar el flujo completo contra el sitio real del BCV sin
RabbitMQ ni TimescaleDB: los eventos se registran por log y el histórico
vive en el proceso.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from ingestor_bcv.adapters.amqp.publisher import construir_evento
from ingestor_bcv.domain.models import EstadoTasa, TasaOficial

logger = logging.getLogger("ingestor_bcv")


class InMemoryRateRepository:
    def __init__(self) -> None:
        self.capturas: list[TasaOficial] = []
        self.fallos_consecutivos = 0
        self.ultimo_error: str | None = None
        self.stale_since: datetime | None = None

    async def ultima_tasa_valida(self, moneda: str) -> TasaOficial | None:
        for tasa in reversed(self.capturas):
            if tasa.moneda == moneda and tasa.estado is EstadoTasa.VALID:
                return tasa
        return None

    async def guardar(self, tasa: TasaOficial) -> None:
        self.capturas.append(tasa)

    async def registrar_exito(self) -> None:
        self.fallos_consecutivos = 0
        self.stale_since = None

    async def registrar_fallo(self, error: str) -> int:
        self.fallos_consecutivos += 1
        self.ultimo_error = error
        return self.fallos_consecutivos

    async def marcar_stale(self) -> None:
        if self.stale_since is None:
            self.stale_since = datetime.now(UTC)


class LoggingEventPublisher:
    def __init__(self) -> None:
        self.eventos: list[dict] = []

    async def publish_rate_updated(self, tasa: TasaOficial) -> None:
        evento = construir_evento(tasa)
        self.eventos.append(evento)
        logger.info("[dry-run] official.rate.updated %s", evento["payload"])


class LoggingAlertNotifier:
    def __init__(self) -> None:
        self.alertas: list[str] = []

    async def alertar(self, mensaje: str) -> None:
        self.alertas.append(mensaje)
        logger.critical("ALERTA: %s", mensaje)
