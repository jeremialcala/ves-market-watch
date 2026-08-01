"""Puertos del caso de uso (el dominio no conoce infraestructura)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol, Sequence

from ingestor_historico.domain.estadisticas import PuntoSerie
from ingestor_historico.domain.models import SnapshotHistorico
from ingestor_historico.domain.tasas_oficiales import TasaOficialHistorica


@dataclass(frozen=True, slots=True)
class ResumenPersistencia:
    insertados: int
    duplicados: int  # ya existían (misma captured_at + source_id)
    # Filas preexistentes a las que se les RELLENÓ un campo vacío (solo con
    # `rellenar_vacios`). Se cuenta aparte porque tocar una fila ya cargada es
    # la excepción a la inmutabilidad de la tabla, no la operación normal.
    actualizados: int = 0


class RepositorioHistorico(Protocol):
    async def guardar_lote(
        self,
        snapshots: Sequence[SnapshotHistorico],
        archivo_origen: str,
        rellenar_vacios: bool = False,
    ) -> ResumenPersistencia: ...

    async def leer_puntos(
        self, desde: datetime | None, hasta: datetime | None
    ) -> list[PuntoSerie]: ...


class RepositorioTasasOficiales(Protocol):
    """Puerto aparte del de snapshots: son tablas distintas y casos de uso
    distintos. Fundirlos obligaría al adaptador en memoria del `--dry-run` a
    fingir métodos que ese comando nunca llama."""

    async def guardar_tasas(
        self, tasas: Sequence[TasaOficialHistorica]
    ) -> ResumenPersistencia: ...
