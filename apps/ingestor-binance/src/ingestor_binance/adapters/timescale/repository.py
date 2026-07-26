"""Repositorio de snapshots crudos en TimescaleDB (RF-5, ADR-0002).

Esquema en `db/migrations/001_p2p_snapshots.sql` (retención 90 días nativa).
Consultas parametrizadas (A05); el rol del servicio solo necesita INSERT.
"""

from __future__ import annotations

import json

import asyncpg

from ingestor_binance.domain.models import SnapshotP2P


class TimescaleSnapshotRepository:
    """Adaptador del puerto `SnapshotRepository` sobre asyncpg."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    @classmethod
    async def connect(cls, dsn: str) -> "TimescaleSnapshotRepository":
        return cls(await asyncpg.create_pool(dsn, min_size=1, max_size=4))

    async def close(self) -> None:
        await self._pool.close()

    async def guardar_crudo(self, snapshot: SnapshotP2P, crudo: list[dict]) -> None:
        await self._pool.execute(
            """
            INSERT INTO p2p_snapshots_raw
                (captured_at, side, asset, fiat, partial, ad_count, raw)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
            ON CONFLICT (captured_at, side) DO NOTHING
            """,
            snapshot.capturado_en,
            snapshot.lado.value,
            snapshot.asset,
            snapshot.fiat,
            snapshot.parcial,
            len(snapshot.anuncios),
            json.dumps(crudo, ensure_ascii=False),
        )
