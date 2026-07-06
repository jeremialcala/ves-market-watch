"""Caso de uso: procesar una tasa oficial recibida del bus (PRD RF-1/RF-2).

Recalcula solo los indicadores afectados por el evento: `official_rate` y,
si hay valor previo de esa moneda, su variación abs/%. La brecha BCV↔P2P se
suma en fase 2 cuando exista referencia P2P (ingestor-binance).

Semántica at-least-once: el evento se marca procesado al FINAL. Si el proceso
muere a mitad, la reentrega reprocesa — la persistencia es idempotente por PK,
y una re-publicación de `indicators.updated` es preferible a perderla.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Callable

from indicator_engine.application.ports import (
    EventPublisher,
    IndicatorRepository,
    TasaOficialRecibida,
)
from indicator_engine.domain.calculos import calcular_variacion
from indicator_engine.domain.models import (
    OFFICIAL_RATE,
    OFFICIAL_RATE_CHANGE_ABS,
    OFFICIAL_RATE_CHANGE_PCT,
    Indicador,
)


@dataclass(slots=True)
class ResultadoProcesamiento:
    duplicado: bool = False
    indicadores: list[Indicador] = field(default_factory=list)
    official_stale: bool = False


class ProcesarTasaOficial:
    def __init__(
        self,
        publisher: EventPublisher,
        repository: IndicatorRepository,
        calc_version: int = 1,
        umbral_stale: timedelta = timedelta(hours=6),
        reloj: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._publisher = publisher
        self._repository = repository
        self._calc_version = calc_version
        self._umbral_stale = umbral_stale
        self._reloj = reloj

    async def ejecutar(self, tasa: TasaOficialRecibida) -> ResultadoProcesamiento:
        if await self._repository.ya_procesado(tasa.event_id):
            return ResultadoProcesamiento(duplicado=True)

        anterior = await self._repository.ultimo_indicador(OFFICIAL_RATE, tasa.moneda)

        indicadores = [self._indicador(OFFICIAL_RATE, tasa, tasa.valor)]
        if anterior is not None:
            variacion = calcular_variacion(tasa.valor, anterior.valor)
            indicadores.append(
                self._indicador(OFFICIAL_RATE_CHANGE_ABS, tasa, variacion.delta_abs)
            )
            indicadores.append(
                self._indicador(OFFICIAL_RATE_CHANGE_PCT, tasa, variacion.delta_pct)
            )

        await self._repository.guardar(indicadores)

        # ADR-0007: la referencia es stale si la captura supera el umbral (6 h).
        official_stale = self._reloj() - tasa.capturada_en > self._umbral_stale
        await self._publisher.publish_indicators_updated(
            indicadores,
            official_stale=official_stale,
            triggered_by=tasa.event_id,
            as_of=tasa.capturada_en,
        )

        await self._repository.marcar_procesado(tasa.event_id, "official.rate.updated")
        return ResultadoProcesamiento(indicadores=indicadores, official_stale=official_stale)

    def _indicador(self, nombre: str, tasa: TasaOficialRecibida, valor) -> Indicador:
        return Indicador(
            nombre=nombre,
            moneda=tasa.moneda,
            valor=valor,
            as_of=tasa.capturada_en,
            calc_version=self._calc_version,
        )
