"""Caso de uso: derivar la brecha histórica del lado venta (ADR-0013 RF-7).

Cruza cada snapshot histórico con la tasa oficial que regía en ese instante y
publica `p2p_brecha_pct_sell` / `p2p_brecha_abs_sell` en `indicators`, la MISMA
tabla y los MISMOS nombres que usa el motor — para que `/indicators/history` las
sirva como una serie sola.

La guarda que hace esto seguro no está en el `ON CONFLICT`, y ese fue el hallazgo
que cambió el diseño: las marcas de tiempo del histórico (cada 10 min) y las del
motor (~cada 30 s) **no coinciden**, así que el conflicto casi nunca dispara y
las dos series quedarían interleavadas. Como `ultimo_indicador` e
`indicador_asof` NO filtran por `calc_version`, el motor leería su propio estado
de una serie derivada. Por eso el backfill se corta ESTRICTAMENTE antes del
primer punto que el motor publicó.
"""

from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass
from datetime import datetime

from ingestor_historico.application.ports import RepositorioBrechas
from ingestor_historico.domain.brechas import (
    INDICADOR_PCT,
    MONEDA,
    BrechaDerivada,
    BrechaNoDerivable,
    derivar,
    metadata_procedencia,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class ResumenDerivacion:
    puntos: int
    insertadas: int  # filas (2 indicadores por punto)
    duplicadas: int
    omitidas: dict[str, int]  # motivo → cantidad
    desde: datetime | None
    hasta: datetime | None
    frontera: datetime | None  # primer punto del motor; el corte del backfill


class DerivarBrechas:
    def __init__(self, repositorio: RepositorioBrechas) -> None:
        self._repositorio = repositorio

    async def ejecutar(
        self, *, sesgo_medido_pp: str, horas_solape: int
    ) -> ResumenDerivacion:
        frontera = await self._repositorio.frontera_serie_viva(INDICADOR_PCT, MONEDA)
        if frontera is not None:
            logger.info(
                "corte del backfill: el motor publica %s desde %s",
                INDICADOR_PCT,
                frontera.isoformat(),
            )
        puntos = await self._repositorio.puntos_derivables(frontera)

        brechas: list[BrechaDerivada] = []
        omitidas: Counter[str] = Counter()
        for punto in puntos:
            try:
                brechas.append(
                    derivar(punto.as_of, punto.precio_p2p, punto.tasa_oficial)
                )
            except BrechaNoDerivable as exc:
                omitidas[exc.motivo] += 1

        brechas.sort(key=lambda b: b.as_of)
        persistencia = await self._repositorio.guardar_brechas(
            brechas, metadata_procedencia(sesgo_medido_pp, horas_solape)
        )
        return ResumenDerivacion(
            puntos=len(puntos),
            insertadas=persistencia.insertados,
            duplicadas=persistencia.duplicados,
            omitidas=dict(omitidas),
            desde=brechas[0].as_of if brechas else None,
            hasta=brechas[-1].as_of if brechas else None,
            frontera=frontera,
        )
