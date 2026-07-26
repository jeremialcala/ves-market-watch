"""Adaptadores en memoria para tests unitarios."""

from __future__ import annotations

import logging
from datetime import datetime

from indicator_engine.adapters.amqp.publisher import (
    construir_evento_indicadores,
    construir_evento_senal,
)
from indicator_engine.domain.models import Indicador
from indicator_engine.domain.reglas import Senal

logger = logging.getLogger("indicator_engine")


class InMemoryIndicatorRepository:
    def __init__(self) -> None:
        self.indicadores: list[Indicador] = []
        self.procesados: dict[str, str] = {}  # event_id → event_type
        self.senales: list[Senal] = []

    async def ya_procesado(self, event_id: str) -> bool:
        return event_id in self.procesados

    async def marcar_procesado(self, event_id: str, event_type: str) -> None:
        self.procesados[event_id] = event_type

    async def ultimo_indicador(self, nombre: str, moneda: str) -> Indicador | None:
        for indicador in reversed(self.indicadores):
            if indicador.nombre == nombre and indicador.moneda == moneda:
                return indicador
        return None

    async def indicador_asof(
        self, nombre: str, moneda: str, momento: datetime
    ) -> Indicador | None:
        candidatos = [
            i
            for i in self.indicadores
            if i.nombre == nombre and i.moneda == moneda and i.as_of <= momento
        ]
        return max(candidatos, key=lambda i: i.as_of, default=None)

    async def guardar(self, indicadores: list[Indicador]) -> None:
        self.indicadores.extend(indicadores)

    async def senal_reciente(self, tipo: str, moneda: str, desde: datetime) -> bool:
        return any(
            s.tipo == tipo and s.moneda == moneda and s.as_of >= desde
            for s in self.senales
        )

    async def guardar_senales(self, senales: list[Senal]) -> None:
        self.senales.extend(senales)


class CollectingEventPublisher:
    def __init__(self) -> None:
        self.eventos: list[dict] = []
        self.senales: list[dict] = []

    async def publish_indicators_updated(
        self,
        indicadores: list[Indicador],
        official_stale: bool,
        triggered_by: str,
        as_of: datetime,
    ) -> None:
        evento = construir_evento_indicadores(indicadores, official_stale, triggered_by, as_of)
        self.eventos.append(evento)
        logger.info("[memoria] indicators.updated %s", evento["payload"])

    async def publish_signal_emitted(self, senal: Senal) -> None:
        evento = construir_evento_senal(senal)
        self.senales.append(evento)
        logger.info("[memoria] signals.emitted %s", evento["payload"])


class LoggingAlertNotifier:
    def __init__(self) -> None:
        self.alertas: list[str] = []

    async def alertar(self, mensaje: str) -> None:
        self.alertas.append(mensaje)
        logger.critical("ALERTA: %s", mensaje)
