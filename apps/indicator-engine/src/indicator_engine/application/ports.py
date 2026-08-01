"""Puertos (interfaces) de la aplicación — ver docs/design.md."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Protocol, Sequence

from indicator_engine.domain.analisis import Analisis, Distribucion
from indicator_engine.domain.models import AnuncioP2P, Indicador
from indicator_engine.domain.reglas import Senal


@dataclass(frozen=True, slots=True)
class TasaOficialRecibida:
    """DTO de un evento `official.rate.updated` ya validado contra su schema."""

    event_id: str
    moneda: str
    valor: Decimal
    fecha_valor: date
    capturada_en: datetime


@dataclass(frozen=True, slots=True)
class SnapshotP2PRecibido:
    """DTO de un evento `p2p.snapshot` ya validado contra su schema."""

    event_id: str
    side: str  # "BUY" | "SELL" (perspectiva del taker)
    asset: str
    fiat: str
    capturado_en: datetime
    partial: bool
    anuncios: tuple[AnuncioP2P, ...]


class IndicatorRepository(Protocol):
    async def ya_procesado(self, event_id: str) -> bool:
        """True si el evento ya fue procesado (idempotencia, escenario negativo 2)."""
        ...

    async def marcar_procesado(self, event_id: str, event_type: str) -> None: ...

    async def ultimo_indicador(self, nombre: str, moneda: str) -> Indicador | None:
        """Último valor conocido de un indicador — el estado del motor es su histórico."""
        ...

    async def indicador_asof(
        self, nombre: str, moneda: str, momento: datetime
    ) -> Indicador | None:
        """Último valor con `as_of <= momento` — base de las ventanas móviles
        (momentum/drenaje) sin cargar series completas en memoria."""
        ...

    async def guardar(self, indicadores: list[Indicador]) -> None:
        """Persiste el lote de indicadores; reintentos no duplican filas."""
        ...

    async def senal_reciente(self, tipo: str, moneda: str, desde: datetime) -> bool:
        """True si ya hay una señal de ese tipo/moneda con `as_of >= desde`
        (dedup por cooldown, RF-4/A08)."""
        ...

    async def guardar_senales(self, senales: list[Senal]) -> None:
        """Persiste las señales emitidas con su evidencia (RF-5, tabla `signals`)."""
        ...

    async def guardar_analisis(self, analisis: Analisis, payload: dict) -> None:
        """Persiste el análisis de la revisión (RF-6, tabla `indicator_analysis`).

        `payload` es el `payload` del evento publicado TAL CUAL: se guarda
        verbatim para que el GET del gateway devuelva exactamente lo que salió al
        bus (ADR-0019). Reentregas no duplican: la PK (as_of, currency,
        triggered_by) es determinista.
        """
        ...


class DistribucionRepository(Protocol):
    """Puerto separado de `IndicatorRepository` a propósito: la distribución es
    una consulta agregada y cara, con su propia política de cache y su propio
    doble en memoria para los tests del análisis."""

    async def distribuciones(
        self,
        nombres: Sequence[str],
        moneda: str,
        desde: datetime,
        percentiles: Sequence[Decimal],
    ) -> dict[str, Distribucion]:
        """Distribución de cada indicador en la ventana `[desde, ∞)`.

        Un indicador sin filas en la ventana NO aparece en el dict (no se
        fabrica una distribución vacía). Un fallo devuelve `{}`, que degrada al
        respaldo del ruleset de forma visible en el payload.
        """
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

    async def publish_signal_emitted(self, senal: Senal) -> None:
        """Publica `signals.emitted` (schemas/signal.v1.json)."""
        ...

    async def publish_analysis_updated(self, evento: dict) -> None:
        """Publica `analysis.updated` (schemas/analysis.v1.json): el sobre
        completo, cuyo `payload` es el mismo documento que se persistió."""
        ...


class AlertNotifier(Protocol):
    async def alertar(self, mensaje: str) -> None: ...
