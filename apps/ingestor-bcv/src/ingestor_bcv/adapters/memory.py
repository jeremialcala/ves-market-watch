"""Adaptadores en memoria para `--dry-run` y tests unitarios.

Permiten ejercitar el flujo completo contra el sitio real del BCV sin
RabbitMQ ni TimescaleDB: los eventos se registran por log y el histórico
vive en el proceso.
"""

from __future__ import annotations

import logging
from dataclasses import replace
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
        # Auditoría de resoluciones HITL: (moneda, capturada_en, estado, usuario, nota)
        self.resoluciones: list[tuple[str, datetime, EstadoTasa, str, str]] = []

    async def ultima_tasa_valida(self, moneda: str) -> TasaOficial | None:
        for tasa in reversed(self.capturas):
            if tasa.moneda == moneda and tasa.estado is EstadoTasa.VALID:
                return tasa
        return None

    async def guardar(self, tasa: TasaOficial) -> None:
        self.capturas.append(tasa)

    async def sospechosas_pendientes(self, moneda: str | None = None) -> list[TasaOficial]:
        return [
            tasa
            for tasa in self.capturas
            if tasa.estado is EstadoTasa.SUSPECT and (moneda is None or tasa.moneda == moneda)
        ]

    async def resolver_sospechosa(
        self, tasa: TasaOficial, nuevo_estado: EstadoTasa, usuario: str, nota: str
    ) -> None:
        for i, captura in enumerate(self.capturas):
            if (
                captura.moneda == tasa.moneda
                and captura.capturada_en == tasa.capturada_en
                and captura.estado is EstadoTasa.SUSPECT
            ):
                self.capturas[i] = replace(captura, estado=nuevo_estado)
                self.resoluciones.append(
                    (tasa.moneda, tasa.capturada_en, nuevo_estado, usuario, nota)
                )
                return

    async def expirar_sospechosas_antes_de(self, limite: datetime) -> list[TasaOficial]:
        vencidas = [
            tasa
            for tasa in self.capturas
            if tasa.estado is EstadoTasa.SUSPECT and tasa.capturada_en < limite
        ]
        for tasa in vencidas:
            await self.resolver_sospechosa(
                tasa, EstadoTasa.REJECTED, "system:timeout", "expirada sin revisión humana"
            )
        return [replace(tasa, estado=EstadoTasa.REJECTED) for tasa in vencidas]

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
