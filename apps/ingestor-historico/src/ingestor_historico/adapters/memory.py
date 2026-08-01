"""Adaptadores en memoria para --dry-run y tests unitarios."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Sequence

from ingestor_historico.application.ports import PuntoDerivable, ResumenPersistencia
from ingestor_historico.domain.brechas import (
    INDICADOR_ABS,
    INDICADOR_PCT,
    BrechaDerivada,
)
from ingestor_historico.domain.estadisticas import PuntoSerie
from ingestor_historico.domain.models import SnapshotHistorico
from ingestor_historico.domain.tasas_oficiales import TasaOficialHistorica


class InMemoryRepositorioHistorico:
    def __init__(self) -> None:
        self.snapshots: dict[tuple[datetime, str], SnapshotHistorico] = {}

    async def guardar_lote(
        self,
        snapshots: Sequence[SnapshotHistorico],
        archivo_origen: str,
        rellenar_vacios: bool = False,
    ) -> ResumenPersistencia:
        insertados = duplicados = actualizados = 0
        for snapshot in snapshots:
            clave = (snapshot.capturado_en, snapshot.source_id)
            existente = self.snapshots.get(clave)
            if existente is None:
                self.snapshots[clave] = snapshot
                insertados += 1
            elif rellenar_vacios and _rellena_volumenes(existente, snapshot):
                self.snapshots[clave] = snapshot
                actualizados += 1
            else:
                duplicados += 1
        return ResumenPersistencia(
            insertados=insertados, duplicados=duplicados, actualizados=actualizados
        )

    async def leer_puntos(
        self, desde: datetime | None, hasta: datetime | None
    ) -> list[PuntoSerie]:
        puntos = [
            PuntoSerie(
                capturado_en=s.capturado_en,
                precio=s.precio_promedio,
                tasas_por_banco={
                    banco: dato.tasa
                    for banco, dato in s.bancos.items()
                    if dato.tasa is not None
                },
            )
            for s in self.snapshots.values()
            if (desde is None or s.capturado_en >= desde)
            and (hasta is None or s.capturado_en <= hasta)
        ]
        return sorted(puntos, key=lambda p: p.capturado_en)


def _rellena_volumenes(
    existente: SnapshotHistorico, nuevo: SnapshotHistorico
) -> bool:
    """Espeja la guarda del SQL: solo cuenta si el guardado NO tiene volúmenes y
    el nuevo SÍ. Nunca sobrescribe un volumen ya presente."""
    guardado_vacio = all(d.volumen is None for d in existente.bancos.values())
    nuevo_aporta = any(d.volumen is not None for d in nuevo.bancos.values())
    return guardado_vacio and nuevo_aporta


class InMemoryRepositorioTasasOficiales:
    """Espeja la PK real (captured_at, currency) para que el `--dry-run` cuente
    los duplicados igual que contaría la base."""

    def __init__(self) -> None:
        self.tasas: dict[tuple[datetime, str], TasaOficialHistorica] = {}

    async def guardar_tasas(
        self, tasas: Sequence[TasaOficialHistorica]
    ) -> ResumenPersistencia:
        insertados = duplicados = 0
        for tasa in tasas:
            clave = (tasa.publicado_en, tasa.moneda)
            if clave in self.tasas:
                duplicados += 1
            else:
                self.tasas[clave] = tasa
                insertados += 1
        return ResumenPersistencia(insertados=insertados, duplicados=duplicados)


class InMemoryRepositorioBrechas:
    """Doble del repositorio de brechas para `--dry-run` y tests.

    `frontera` se inyecta porque es la guarda del diseño: los tests tienen que
    poder comprobar que el backfill NO escribe en el tramo del motor.
    """

    def __init__(
        self,
        puntos: Sequence[PuntoDerivable] = (),
        frontera: datetime | None = None,
    ) -> None:
        self._puntos = list(puntos)
        self._frontera = frontera
        self.brechas: dict[tuple[datetime, str], Decimal] = {}
        self.metadata: dict | None = None

    async def frontera_serie_viva(
        self, indicador: str, moneda: str
    ) -> datetime | None:
        return self._frontera

    async def puntos_derivables(
        self, hasta_exclusive: datetime | None
    ) -> list[PuntoDerivable]:
        return [
            p
            for p in self._puntos
            if hasta_exclusive is None or p.as_of < hasta_exclusive
        ]

    async def guardar_brechas(
        self, brechas: Sequence[BrechaDerivada], metadata: dict
    ) -> ResumenPersistencia:
        self.metadata = metadata
        insertados = duplicados = 0
        for brecha in brechas:
            for nombre, valor in (
                (INDICADOR_PCT, brecha.pct),
                (INDICADOR_ABS, brecha.abs),
            ):
                clave = (brecha.as_of, nombre)
                if clave in self.brechas:
                    duplicados += 1
                else:
                    self.brechas[clave] = valor
                    insertados += 1
        return ResumenPersistencia(insertados=insertados, duplicados=duplicados)
