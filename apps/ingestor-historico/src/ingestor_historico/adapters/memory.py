"""Adaptadores en memoria para --dry-run y tests unitarios."""

from __future__ import annotations

from datetime import datetime
from typing import Sequence

from ingestor_historico.application.ports import ResumenPersistencia
from ingestor_historico.domain.estadisticas import PuntoSerie
from ingestor_historico.domain.models import SnapshotHistorico


class InMemoryRepositorioHistorico:
    def __init__(self) -> None:
        self.snapshots: dict[tuple[datetime, str], SnapshotHistorico] = {}

    async def guardar_lote(
        self, snapshots: Sequence[SnapshotHistorico], archivo_origen: str
    ) -> ResumenPersistencia:
        insertados = duplicados = 0
        for snapshot in snapshots:
            clave = (snapshot.capturado_en, snapshot.source_id)
            if clave in self.snapshots:
                duplicados += 1
            else:
                self.snapshots[clave] = snapshot
                insertados += 1
        return ResumenPersistencia(insertados=insertados, duplicados=duplicados)

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
