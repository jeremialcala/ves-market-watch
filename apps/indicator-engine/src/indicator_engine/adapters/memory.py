"""Adaptadores en memoria para tests unitarios."""

from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal
from typing import Sequence

from indicator_engine.adapters.amqp.publisher import (
    construir_evento_indicadores,
    construir_evento_senal,
)
from indicator_engine.domain.analisis import Analisis, Distribucion
from indicator_engine.domain.comparativas import Agregado
from indicator_engine.domain.models import Indicador
from indicator_engine.domain.reglas import Senal

logger = logging.getLogger("indicator_engine")


class InMemoryIndicatorRepository:
    def __init__(self) -> None:
        self.indicadores: list[Indicador] = []
        self.procesados: dict[str, str] = {}  # event_id → event_type
        self.senales: list[Senal] = []
        self.analisis: list[tuple[Analisis, dict]] = []

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

    async def guardar_analisis(self, analisis: Analisis, payload: dict) -> None:
        # Idempotencia por la misma PK que la tabla: (as_of, moneda, triggered_by).
        clave = (analisis.as_of, analisis.moneda, analisis.triggered_by)
        if any(
            (a.as_of, a.moneda, a.triggered_by) == clave for a, _ in self.analisis
        ):
            return
        self.analisis.append((analisis, payload))


class InMemoryDistribucionRepository:
    """Doble del puerto `DistribucionRepository`, independiente del de indicadores.

    `precargadas` se indexa por nombre; lo que no esté ahí simplemente no
    aparece en el resultado — igual que un indicador sin filas en la ventana.
    """

    def __init__(
        self,
        precargadas: dict[str, Distribucion] | None = None,
        agregados_precargados: dict[str, dict[int, Agregado]] | None = None,
    ) -> None:
        self.precargadas: dict[str, Distribucion] = dict(precargadas or {})
        self.agregados_precargados: dict[str, dict[int, Agregado]] = dict(
            agregados_precargados or {}
        )
        self.llamadas: list[tuple[tuple[str, ...], str, datetime]] = []

    async def distribuciones(
        self,
        nombres: Sequence[str],
        moneda: str,
        desde: datetime,
        percentiles: Sequence[Decimal],
    ) -> dict[str, Distribucion]:
        self.llamadas.append((tuple(nombres), moneda, desde))
        return {n: self.precargadas[n] for n in nombres if n in self.precargadas}

    async def agregados(
        self,
        nombres: Sequence[str],
        moneda: str,
        ventanas_dias: Sequence[int],
        ahora: datetime,
    ) -> dict[str, dict[int, Agregado]]:
        return {
            n: self.agregados_precargados[n]
            for n in nombres
            if n in self.agregados_precargados
        }


class CollectingEventPublisher:
    def __init__(self) -> None:
        self.eventos: list[dict] = []
        self.senales: list[dict] = []
        self.analisis: list[dict] = []

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

    async def publish_analysis_updated(self, evento: dict) -> None:
        self.analisis.append(evento)
        logger.info("[memoria] analysis.updated %s", evento["payload"]["as_of"])


class LoggingAlertNotifier:
    def __init__(self) -> None:
        self.alertas: list[str] = []

    async def alertar(self, mensaje: str) -> None:
        self.alertas.append(mensaje)
        logger.critical("ALERTA: %s", mensaje)
