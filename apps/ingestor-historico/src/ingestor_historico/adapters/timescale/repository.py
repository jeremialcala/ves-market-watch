"""Repositorio de snapshots históricos en TimescaleDB (ADR-0002, ADR-0013).

Esquema en `db/migrations/001_historical_snapshots.sql`. Idempotencia por
PK (captured_at, source_id) con ON CONFLICT DO NOTHING: recargar el mismo
export no duplica filas. Consultas parametrizadas (A05).
"""

from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal
from typing import Sequence

import asyncpg

from ingestor_historico.application.ports import ResumenPersistencia
from ingestor_historico.domain.estadisticas import PuntoSerie
from ingestor_historico.domain.models import SnapshotHistorico

_INSERT = """
    INSERT INTO historical_market_snapshots
        (captured_at, source_id, base_weighted_avg, total_order_size,
         banks, extra, source_file)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
    ON CONFLICT (captured_at, source_id) DO NOTHING
"""


def _banks_json(snapshot: SnapshotHistorico) -> str:
    return json.dumps(
        {
            banco: {
                "rate": float(dato.tasa) if dato.tasa is not None else None,
                "volume": float(dato.volumen) if dato.volumen is not None else None,
                "low_liquidity": dato.liquidez_baja,
                "available": (
                    float(dato.disponible) if dato.disponible is not None else None
                ),
            }
            for banco, dato in snapshot.bancos.items()
        },
        ensure_ascii=False,
    )


class TimescaleRepositorioHistorico:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    @classmethod
    async def connect(cls, dsn: str) -> "TimescaleRepositorioHistorico":
        return cls(await asyncpg.create_pool(dsn, min_size=1, max_size=4))

    async def close(self) -> None:
        await self._pool.close()

    async def guardar_lote(
        self, snapshots: Sequence[SnapshotHistorico], archivo_origen: str
    ) -> ResumenPersistencia:
        insertados = 0
        async with self._pool.acquire() as conexion:
            async with conexion.transaction():
                for snapshot in snapshots:
                    estado = await conexion.execute(
                        _INSERT,
                        snapshot.capturado_en,
                        snapshot.source_id,
                        snapshot.precio_promedio,
                        snapshot.volumen_total,
                        _banks_json(snapshot),
                        json.dumps(dict(snapshot.extra), ensure_ascii=False),
                        archivo_origen,
                    )
                    # asyncpg devuelve el command tag: "INSERT 0 1" | "INSERT 0 0"
                    insertados += int(estado.rsplit(" ", 1)[-1])
        return ResumenPersistencia(
            insertados=insertados, duplicados=len(snapshots) - insertados
        )

    async def leer_puntos(
        self, desde: datetime | None, hasta: datetime | None
    ) -> list[PuntoSerie]:
        filas = await self._pool.fetch(
            """
            SELECT captured_at, base_weighted_avg, banks
            FROM historical_market_snapshots
            WHERE ($1::timestamptz IS NULL OR captured_at >= $1)
              AND ($2::timestamptz IS NULL OR captured_at <= $2)
            ORDER BY captured_at
            """,
            desde,
            hasta,
        )
        return [
            PuntoSerie(
                capturado_en=fila["captured_at"],
                precio=Decimal(str(fila["base_weighted_avg"])),
                tasas_por_banco={
                    banco: Decimal(str(dato["rate"]))
                    for banco, dato in json.loads(fila["banks"]).items()
                    if dato.get("rate") is not None
                },
            )
            for fila in filas
        ]
