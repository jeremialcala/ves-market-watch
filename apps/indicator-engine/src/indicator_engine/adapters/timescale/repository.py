"""Repositorio de indicadores en PostgreSQL + TimescaleDB (ADR-0002).

Esquema en `db/migrations/001_indicators.sql`. Consultas parametrizadas (A05).
El rol del servicio solo necesita INSERT/SELECT sobre `indicators` y
`processed_events` (mínimo privilegio, A01).
"""

from __future__ import annotations

import asyncpg

from indicator_engine.domain.models import Indicador


class TimescaleIndicatorRepository:
    """Adaptador del puerto `IndicatorRepository` sobre asyncpg."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    @classmethod
    async def connect(cls, dsn: str) -> "TimescaleIndicatorRepository":
        return cls(await asyncpg.create_pool(dsn, min_size=1, max_size=4))

    async def close(self) -> None:
        await self._pool.close()

    async def ya_procesado(self, event_id: str) -> bool:
        fila = await self._pool.fetchrow(
            "SELECT 1 FROM processed_events WHERE event_id = $1::uuid", event_id
        )
        return fila is not None

    async def marcar_procesado(self, event_id: str, event_type: str) -> None:
        await self._pool.execute(
            """
            INSERT INTO processed_events (event_id, event_type)
            VALUES ($1::uuid, $2)
            ON CONFLICT (event_id) DO NOTHING
            """,
            event_id,
            event_type,
        )

    async def ultimo_indicador(self, nombre: str, moneda: str) -> Indicador | None:
        fila = await self._pool.fetchrow(
            """
            SELECT as_of, indicator, currency, value, calc_version
            FROM indicators
            WHERE indicator = $1 AND currency = $2
            ORDER BY as_of DESC
            LIMIT 1
            """,
            nombre,
            moneda,
        )
        if fila is None:
            return None
        return Indicador(
            nombre=fila["indicator"],
            moneda=fila["currency"],
            valor=fila["value"],
            as_of=fila["as_of"],
            calc_version=fila["calc_version"],
        )

    async def indicador_asof(
        self, nombre: str, moneda: str, momento
    ) -> Indicador | None:
        fila = await self._pool.fetchrow(
            """
            SELECT as_of, indicator, currency, value, calc_version
            FROM indicators
            WHERE indicator = $1 AND currency = $2 AND as_of <= $3
            ORDER BY as_of DESC
            LIMIT 1
            """,
            nombre,
            moneda,
            momento,
        )
        if fila is None:
            return None
        return Indicador(
            nombre=fila["indicator"],
            moneda=fila["currency"],
            valor=fila["value"],
            as_of=fila["as_of"],
            calc_version=fila["calc_version"],
        )

    async def guardar(self, indicadores: list[Indicador]) -> None:
        # ON CONFLICT DO NOTHING: la reentrega de un evento (at-least-once)
        # no duplica filas — la PK (as_of, indicator, currency) es determinista.
        await self._pool.executemany(
            """
            INSERT INTO indicators (as_of, indicator, currency, value, calc_version)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (as_of, indicator, currency) DO NOTHING
            """,
            [
                (i.as_of, i.nombre, i.moneda, i.valor, i.calc_version)
                for i in indicadores
            ],
        )
