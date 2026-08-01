"""Caso de uso: cargar el histórico de tasas oficiales del BCV.

Mismo flujo que `CargarHistoricos` —normalizar, descartar lo ilegible con
motivo, deduplicar dentro del archivo, persistir idempotente— sobre otra tabla
y otro dominio.

Lo que NO hace, a propósito: no publica al bus. El histórico se consulta, no se
reproduce (ADR-0013). Reemitir seis años de `official.rate.updated` dispararía
el motor de indicadores como si fueran cambios de hoy.
"""

from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, tzinfo
from typing import Sequence

from ingestor_historico.application.ports import RepositorioTasasOficiales
from ingestor_historico.domain.tasas_oficiales import (
    FilaOficialInvalida,
    TasaOficialHistorica,
    parsear_fila,
    verificar_columnas,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class ResumenCargaOficiales:
    archivo: str
    total_filas: int
    insertadas: int
    duplicadas: int  # dentro del archivo + ya presentes en la base
    descartadas: dict[str, int]  # motivo → cantidad
    sin_hora: int  # jornadas sin hora de publicación en el XLS de origen
    monedas: tuple[str, ...]
    desde: date | None
    hasta: date | None


class CargarTasasOficiales:
    def __init__(self, repositorio: RepositorioTasasOficiales) -> None:
        self._repositorio = repositorio

    async def ejecutar(
        self,
        cabeceras: list[str],
        filas: Sequence[dict[str, str]],
        archivo: str,
        tz: tzinfo,
        monedas: frozenset[str] | None = None,
    ) -> ResumenCargaOficiales:
        verificar_columnas(cabeceras)

        tasas: list[TasaOficialHistorica] = []
        descartes: Counter[str] = Counter()
        # La PK de `official_rates` es (captured_at, currency): dos filas del
        # mismo archivo que colisionen ahí son la misma observación.
        vistas: set[tuple[datetime, str]] = set()
        duplicadas_archivo = 0

        for fila in filas:
            try:
                tasa = parsear_fila(fila, tz)
            except FilaOficialInvalida as exc:
                descartes[exc.motivo] += 1
                continue
            if monedas is not None and tasa.moneda not in monedas:
                descartes[f"moneda fuera del filtro ({tasa.moneda})"] += 1
                continue
            clave = (tasa.publicado_en, tasa.moneda)
            if clave in vistas:
                duplicadas_archivo += 1
                continue
            vistas.add(clave)
            tasas.append(tasa)

        tasas.sort(key=lambda t: (t.publicado_en, t.moneda))
        persistencia = await self._repositorio.guardar_tasas(tasas)

        return ResumenCargaOficiales(
            archivo=archivo,
            total_filas=len(filas),
            insertadas=persistencia.insertados,
            duplicadas=duplicadas_archivo + persistencia.duplicados,
            descartadas=dict(descartes),
            sin_hora=sum(1 for t in tasas if not t.hora_conocida),
            monedas=tuple(sorted({t.moneda for t in tasas})),
            desde=tasas[0].fecha_valor if tasas else None,
            hasta=tasas[-1].fecha_valor if tasas else None,
        )
