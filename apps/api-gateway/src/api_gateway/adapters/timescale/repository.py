"""Repositorio de SOLO lectura sobre TimescaleDB (asyncpg).

Defensa en profundidad (T9, A01): además del rol de mínimo privilegio del
despliegue, cada conexión del pool fija `default_transaction_read_only=on` —
un UPDATE/INSERT accidental o inyectado falla en el servidor. Todas las
queries son parametrizadas; los numeric se devuelven como texto exacto
(convención del contrato: decimales nunca float).
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta

import asyncpg

from api_gateway.application.ports import LecturaRepository

# asyncpg codifica timedelta como interval (un string no se castea en $1::interval).
_INTERVALOS = {
    "5m": timedelta(minutes=5),
    "1h": timedelta(hours=1),
    "1d": timedelta(days=1),
}


async def _init_conexion(conexion: asyncpg.Connection) -> None:
    await conexion.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )


class TimescaleLecturaRepository(LecturaRepository):
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    @classmethod
    async def connect(cls, dsn: str) -> "TimescaleLecturaRepository":
        pool = await asyncpg.create_pool(
            dsn,
            min_size=1,
            max_size=10,
            init=_init_conexion,
            server_settings={"default_transaction_read_only": "on"},
        )
        return cls(pool)

    async def close(self) -> None:
        await self._pool.close()

    # -- tasa oficial -------------------------------------------------------

    async def tasa_oficial_vigente(self, currency: str) -> dict | None:
        fila = await self._pool.fetchrow(
            """
            SELECT currency, rate::text AS rate, value_date, captured_at
            FROM official_rates
            WHERE currency = $1 AND status = 'valid'
            ORDER BY captured_at DESC
            LIMIT 1
            """,
            currency,
        )
        return dict(fila) if fila else None

    async def historial_tasa_oficial(
        self, currency: str, desde: date, hasta: date, offset: int, limite: int
    ) -> tuple[list[dict], int]:
        filas = await self._pool.fetch(
            """
            SELECT currency, rate, value_date, captured_at FROM (
                SELECT DISTINCT ON (value_date)
                       currency, rate::text AS rate, value_date, captured_at
                FROM official_rates
                WHERE currency = $1 AND status = 'valid'
                  AND value_date BETWEEN $2 AND $3
                ORDER BY value_date DESC, captured_at DESC
            ) ultima_por_dia
            ORDER BY value_date DESC
            OFFSET $4 LIMIT $5
            """,
            currency,
            desde,
            hasta,
            offset,
            limite,
        )
        total = await self._pool.fetchval(
            """
            SELECT COUNT(DISTINCT value_date)
            FROM official_rates
            WHERE currency = $1 AND status = 'valid'
              AND value_date BETWEEN $2 AND $3
            """,
            currency,
            desde,
            hasta,
        )
        return [dict(f) for f in filas], int(total)

    # -- indicadores --------------------------------------------------------

    async def indicadores_vigentes(
        self, nombres: list[str], currency: str
    ) -> dict[str, dict]:
        filas = await self._pool.fetch(
            """
            SELECT DISTINCT ON (indicator)
                   indicator, value::text AS value, as_of, calc_version
            FROM indicators
            WHERE indicator = ANY($1::text[]) AND currency = $2
            ORDER BY indicator, as_of DESC
            """,
            nombres,
            currency,
        )
        return {f["indicator"]: dict(f) for f in filas}

    async def historial_indicadores(
        self,
        desde: datetime,
        hasta: datetime,
        intervalo: str,
        offset: int,
        limite: int,
    ) -> tuple[list[dict], int]:
        intervalo_sql = _INTERVALOS[intervalo]
        filas = await self._pool.fetch(
            """
            SELECT time_bucket($1::interval, as_of) AS as_of,
                   indicator, currency,
                   last(value, as_of)::text AS value,
                   last(calc_version, as_of) AS calc_version
            FROM indicators
            WHERE as_of BETWEEN $2 AND $3
            GROUP BY 1, indicator, currency
            ORDER BY 1 DESC, indicator, currency
            OFFSET $4 LIMIT $5
            """,
            intervalo_sql,
            desde,
            hasta,
            offset,
            limite,
        )
        total = await self._pool.fetchval(
            """
            SELECT COUNT(*) FROM (
                SELECT 1
                FROM indicators
                WHERE as_of BETWEEN $2 AND $3
                GROUP BY time_bucket($1::interval, as_of), indicator, currency
            ) buckets
            """,
            intervalo_sql,
            desde,
            hasta,
        )
        return [dict(f) for f in filas], int(total)

    # -- P2P crudo ----------------------------------------------------------

    async def snapshot_p2p_reciente(self, side: str) -> dict | None:
        fila = await self._pool.fetchrow(
            """
            SELECT captured_at, raw
            FROM p2p_snapshots_raw
            WHERE side = $1
            ORDER BY captured_at DESC
            LIMIT 1
            """,
            side,
        )
        if fila is None:
            return None
        crudo = fila["raw"]
        items = crudo if isinstance(crudo, list) else crudo.get("ads", [])
        return {"captured_at": fila["captured_at"], "items": items}

    # -- señales ------------------------------------------------------------

    async def senales(
        self,
        desde: datetime,
        hasta: datetime,
        tipo: str | None,
        offset: int,
        limite: int,
    ) -> tuple[list[dict], int]:
        filas = await self._pool.fetch(
            """
            SELECT emitted_at, as_of, type, direction, currency,
                   calc_version, triggered_by::text AS triggered_by, evidence
            FROM signals
            WHERE emitted_at BETWEEN $1 AND $2
              AND ($3::text IS NULL OR type = $3)
            ORDER BY emitted_at DESC
            OFFSET $4 LIMIT $5
            """,
            desde,
            hasta,
            tipo,
            offset,
            limite,
        )
        total = await self._pool.fetchval(
            """
            SELECT COUNT(*)
            FROM signals
            WHERE emitted_at BETWEEN $1 AND $2
              AND ($3::text IS NULL OR type = $3)
            """,
            desde,
            hasta,
            tipo,
        )
        return [dict(f) for f in filas], int(total)

    # -- salud --------------------------------------------------------------

    async def ping(self) -> bool:
        try:
            return await self._pool.fetchval("SELECT 1") == 1
        except (asyncpg.PostgresError, OSError):
            return False
