"""Puertos del caso de uso (el dominio no conoce infraestructura)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Protocol, Sequence

from ingestor_historico.domain.brechas import BrechaDerivada
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


@dataclass(frozen=True, slots=True)
class PuntoDerivable:
    """Un snapshot histórico con la tasa oficial que regía en ese instante."""

    as_of: datetime
    precio_p2p: Decimal | None
    tasa_oficial: Decimal | None


class RepositorioBrechas(Protocol):
    """Lectura de los insumos y escritura de la serie derivada.

    `frontera_serie_viva` es la pieza de seguridad del diseño, no una comodidad:
    devuelve el `as_of` más antiguo que el MOTOR publicó para ese indicador. El
    backfill no puede escribir en ese instante ni después, porque las marcas de
    tiempo de las dos series no coinciden (10 min contra ~30 s) y el
    `ON CONFLICT` no las fusionaría: quedarían interleavadas dos series que
    difieren 0,08 pp, y `ultimo_indicador`/`indicador_asof` —que NO filtran por
    `calc_version`— devolverían una u otra al azar.
    """

    async def frontera_serie_viva(self, indicador: str, moneda: str) -> datetime | None: ...

    async def puntos_derivables(
        self, hasta_exclusive: datetime | None
    ) -> list[PuntoDerivable]: ...

    async def guardar_brechas(
        self, brechas: Sequence[BrechaDerivada], metadata: dict
    ) -> ResumenPersistencia: ...


class RepositorioTasasOficiales(Protocol):
    """Puerto aparte del de snapshots: son tablas distintas y casos de uso
    distintos. Fundirlos obligaría al adaptador en memoria del `--dry-run` a
    fingir métodos que ese comando nunca llama."""

    async def guardar_tasas(
        self, tasas: Sequence[TasaOficialHistorica]
    ) -> ResumenPersistencia: ...
