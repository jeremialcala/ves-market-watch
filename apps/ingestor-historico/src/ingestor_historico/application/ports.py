"""Puertos del caso de uso (el dominio no conoce infraestructura)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol, Sequence

from ingestor_historico.domain.estadisticas import PuntoSerie
from ingestor_historico.domain.models import SnapshotHistorico


@dataclass(frozen=True, slots=True)
class ResumenPersistencia:
    insertados: int
    duplicados: int  # ya existían (misma captured_at + source_id)


class RepositorioHistorico(Protocol):
    async def guardar_lote(
        self, snapshots: Sequence[SnapshotHistorico], archivo_origen: str
    ) -> ResumenPersistencia: ...

    async def leer_puntos(
        self, desde: datetime | None, hasta: datetime | None
    ) -> list[PuntoSerie]: ...
