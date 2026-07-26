"""Caso de uso: cargar un export histórico de mercado (PRD RF-1..RF-3).

Flujo: detectar el mapeo de columnas sobre la primera fila → normalizar cada
fila (las ilegibles se descartan con motivo, sin abortar) → deduplicar dentro
del archivo → persistir idempotente (re-ejecutar la misma carga no duplica).
"""

from __future__ import annotations

import hashlib
import logging
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, tzinfo
from typing import Sequence

from ingestor_historico.application.ports import RepositorioHistorico
from ingestor_historico.domain.models import SnapshotHistorico
from ingestor_historico.domain.parser import (
    FilaInvalida,
    FormatoNoSoportado,
    MapeoColumnas,
    detectar_columnas,
    parsear_fila,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class ResumenCarga:
    archivo: str
    total_filas: int
    insertadas: int
    duplicadas: int  # en el archivo + ya presentes en el repositorio
    descartadas: dict[str, int]  # motivo → cantidad
    desde: datetime | None
    hasta: datetime | None
    bancos: tuple[str, ...]
    mapeo: MapeoColumnas


def _id_determinista(fila: dict[str, str]) -> str:
    """Sin columna ID: hash del contenido — recargas siguen siendo idempotentes."""
    crudo = "|".join(f"{k}={v}" for k, v in sorted(fila.items()))
    return "sha256:" + hashlib.sha256(crudo.encode("utf-8")).hexdigest()[:24]


class CargarHistoricos:
    def __init__(self, repositorio: RepositorioHistorico) -> None:
        self._repositorio = repositorio

    async def ejecutar(
        self,
        cabeceras: list[str],
        filas: Sequence[dict[str, str]],
        archivo: str,
        tz: tzinfo,
    ) -> ResumenCarga:
        if not filas:
            raise FormatoNoSoportado("el archivo no tiene filas de datos")
        mapeo = detectar_columnas(cabeceras, filas[0])
        logger.info("mapeo detectado: %s", mapeo)

        snapshots: list[SnapshotHistorico] = []
        descartes: Counter[str] = Counter()
        vistos: set[str] = set()
        duplicadas_archivo = 0

        for fila in filas:
            try:
                snapshot = parsear_fila(fila, mapeo, tz, _id_determinista(fila))
            except FilaInvalida as exc:
                descartes[exc.motivo] += 1
                continue
            if snapshot.source_id in vistos:
                duplicadas_archivo += 1
                continue
            vistos.add(snapshot.source_id)
            snapshots.append(snapshot)

        snapshots.sort(key=lambda s: s.capturado_en)
        persistencia = await self._repositorio.guardar_lote(snapshots, archivo)

        bancos = sorted({banco for s in snapshots for banco in s.bancos})
        return ResumenCarga(
            archivo=archivo,
            total_filas=len(filas),
            insertadas=persistencia.insertados,
            duplicadas=duplicadas_archivo + persistencia.duplicados,
            descartadas=dict(descartes),
            desde=snapshots[0].capturado_en if snapshots else None,
            hasta=snapshots[-1].capturado_en if snapshots else None,
            bancos=tuple(bancos),
            mapeo=mapeo,
        )
