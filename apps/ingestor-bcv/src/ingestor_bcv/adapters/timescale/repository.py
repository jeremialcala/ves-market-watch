"""Repositorio en PostgreSQL + TimescaleDB (ADR-0002).

Esquema en `db/migrations/`. Todas las consultas son parametrizadas (A05/T9).
El rol de base de datos del servicio solo necesita INSERT/SELECT/UPDATE sobre
`official_rates` (UPDATE únicamente para la resolución HITL de ADR-0007) y
UPSERT sobre `official_rate_source_health`.
"""

from __future__ import annotations

from datetime import datetime

import asyncpg

from ingestor_bcv.domain.models import EstadoTasa, TasaOficial

_FUENTE = "BCV"


class TimescaleRateRepository:
    """Adaptador del puerto `RateRepository` sobre asyncpg."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    @classmethod
    async def connect(cls, dsn: str) -> "TimescaleRateRepository":
        return cls(await asyncpg.create_pool(dsn, min_size=1, max_size=4))

    async def close(self) -> None:
        await self._pool.close()

    async def ultima_tasa_valida(self, moneda: str) -> TasaOficial | None:
        fila = await self._pool.fetchrow(
            """
            SELECT currency, rate, value_date, captured_at, status, source
            FROM official_rates
            WHERE currency = $1 AND status = 'valid'
            ORDER BY captured_at DESC
            LIMIT 1
            """,
            moneda,
        )
        if fila is None:
            return None
        return self._a_tasa(fila)

    async def guardar(self, tasa: TasaOficial) -> None:
        await self._pool.execute(
            """
            INSERT INTO official_rates (captured_at, currency, rate, value_date, status, source)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (captured_at, currency) DO NOTHING
            """,
            tasa.capturada_en,
            tasa.moneda,
            tasa.valor,
            tasa.fecha_valor,
            tasa.estado.value,
            tasa.fuente,
        )

    async def sospechosas_pendientes(self, moneda: str | None = None) -> list[TasaOficial]:
        filas = await self._pool.fetch(
            """
            SELECT currency, rate, value_date, captured_at, status, source
            FROM official_rates
            WHERE status = 'suspect' AND ($1::text IS NULL OR currency = $1)
            ORDER BY currency, captured_at
            """,
            moneda,
        )
        return [self._a_tasa(fila) for fila in filas]

    async def resolver_sospechosa(
        self, tasa: TasaOficial, nuevo_estado: EstadoTasa, usuario: str, nota: str
    ) -> None:
        await self._pool.execute(
            """
            UPDATE official_rates
            SET status = $1, resolved_at = now(), resolved_by = $2, resolution_note = $3
            WHERE captured_at = $4 AND currency = $5 AND status = 'suspect'
            """,
            nuevo_estado.value,
            usuario,
            nota,
            tasa.capturada_en,
            tasa.moneda,
        )

    async def expirar_sospechosas_antes_de(self, limite: datetime) -> list[TasaOficial]:
        filas = await self._pool.fetch(
            """
            UPDATE official_rates
            SET status = 'rejected', resolved_at = now(),
                resolved_by = 'system:timeout',
                resolution_note = 'expirada sin revisión humana'
            WHERE status = 'suspect' AND captured_at < $1
            RETURNING currency, rate, value_date, captured_at, status, source
            """,
            limite,
        )
        return [self._a_tasa(fila) for fila in filas]

    @staticmethod
    def _a_tasa(fila: asyncpg.Record) -> TasaOficial:
        return TasaOficial(
            moneda=fila["currency"],
            valor=fila["rate"],
            fecha_valor=fila["value_date"],
            capturada_en=fila["captured_at"],
            estado=EstadoTasa(fila["status"]),
            fuente=fila["source"],
        )

    async def registrar_exito(self) -> None:
        await self._pool.execute(
            """
            INSERT INTO official_rate_source_health
                (source, consecutive_failures, last_success_at, stale_since)
            VALUES ($1, 0, now(), NULL)
            ON CONFLICT (source) DO UPDATE SET
                consecutive_failures = 0,
                last_success_at = now(),
                stale_since = NULL
            """,
            _FUENTE,
        )

    async def registrar_fallo(self, error: str) -> int:
        fila = await self._pool.fetchrow(
            """
            INSERT INTO official_rate_source_health
                (source, consecutive_failures, last_failure_at, last_error)
            VALUES ($1, 1, now(), $2)
            ON CONFLICT (source) DO UPDATE SET
                consecutive_failures = official_rate_source_health.consecutive_failures + 1,
                last_failure_at = now(),
                last_error = EXCLUDED.last_error
            RETURNING consecutive_failures
            """,
            _FUENTE,
            error,
        )
        return int(fila["consecutive_failures"])

    async def marcar_stale(self) -> None:
        await self._pool.execute(
            """
            UPDATE official_rate_source_health
            SET stale_since = COALESCE(stale_since, now())
            WHERE source = $1
            """,
            _FUENTE,
        )
