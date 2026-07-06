"""Puertos (interfaces) de la aplicación — ver docs/design.md."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Protocol

from indicator_engine.domain.models import Indicador


@dataclass(frozen=True, slots=True)
class TasaOficialRecibida:
    """DTO de un evento `official.rate.updated` ya validado contra su schema."""

    event_id: str
    moneda: str
    valor: Decimal
    fecha_valor: date
    capturada_en: datetime


class IndicatorRepository(Protocol):
    async def ya_procesado(self, event_id: str) -> bool:
        """True si el evento ya fue procesado (idempotencia, escenario negativo 2)."""
        ...

    async def marcar_procesado(self, event_id: str, event_type: str) -> None: ...

    async def ultimo_indicador(self, nombre: str, moneda: str) -> Indicador | None:
        """Último valor conocido de un indicador — el estado del motor es su histórico."""
        ...

    async def guardar(self, indicadores: list[Indicador]) -> None:
        """Persiste el lote de indicadores; reintentos no duplican filas."""
        ...


class EventPublisher(Protocol):
    async def publish_indicators_updated(
        self,
        indicadores: list[Indicador],
        official_stale: bool,
        triggered_by: str,
        as_of: datetime,
    ) -> None:
        """Publica `indicators.updated` (ADR-0004); `triggered_by` = event_id origen."""
        ...


class AlertNotifier(Protocol):
    async def alertar(self, mensaje: str) -> None: ...
