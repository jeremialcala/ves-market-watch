"""Adaptadores en memoria para --dry-run y tests unitarios."""

from __future__ import annotations

from datetime import datetime
from typing import Sequence

from ingestor_historico.application.ports import ResumenPersistencia
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
