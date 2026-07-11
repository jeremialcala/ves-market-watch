"""Fixtures del ingestor-historico.

Mismo patrón que los demás servicios: probe corto + skip si no hay
`docker compose up -d --wait`.
"""

from __future__ import annotations

import asyncio
import os
from datetime import timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pytest

FIXTURES = Path(__file__).parent / "fixtures"
MIGRACIONES = Path(__file__).parents[1] / "db" / "migrations"

TZ_CARACAS = timezone(timedelta(hours=-4))

DSN_TEST_POR_DEFECTO = "postgresql://postgres:postgres@127.0.0.1:5433/ves_market_test"

_SUGERENCIA = "levantar la infraestructura con: docker compose up -d --wait (raíz del repo)"


def _con_base_de_datos(dsn: str, nombre: str) -> str:
    partes = urlsplit(dsn)
    return urlunsplit(partes._replace(path=f"/{nombre}"))


def _tiene_comando_sql(sentencia: str) -> bool:
    return any(
        linea.strip() and not linea.strip().startswith("--")
        for linea in sentencia.splitlines()
    )


@pytest.fixture(scope="session")
def timescale_listo() -> str:
    import asyncpg

    dsn = os.environ.get("TEST_DATABASE_URL", DSN_TEST_POR_DEFECTO)
    nombre_db = urlsplit(dsn).path.lstrip("/")

    async def _preparar() -> None:
        admin = await asyncpg.connect(_con_base_de_datos(dsn, "postgres"), timeout=3)
        try:
            existe = await admin.fetchval(
                "SELECT 1 FROM pg_database WHERE datname = $1", nombre_db
            )
            if not existe:
                await admin.execute(f'CREATE DATABASE "{nombre_db}"')
        finally:
            await admin.close()

        conexion = await asyncpg.connect(dsn, timeout=3)
        try:
            extension = await conexion.fetchval(
                "SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'"
            )
            if not extension:
                raise RuntimeError(
                    "la base de test no tiene la extensión timescaledb; recrear la "
                    "infraestructura: docker compose down && docker compose up -d --wait"
                )
            for migracion in sorted(MIGRACIONES.glob("*.sql")):
                for sentencia in migracion.read_text(encoding="utf-8").split(";"):
                    if (
                        _tiene_comando_sql(sentencia)
                        and "CREATE EXTENSION" not in sentencia.upper()
                    ):
                        await conexion.execute(sentencia)
        finally:
            await conexion.close()

    try:
        asyncio.run(asyncio.wait_for(_preparar(), timeout=30))
    except Exception as exc:
        pytest.skip(f"TimescaleDB no disponible ({exc}); {_SUGERENCIA}")
    return dsn


@pytest.fixture
async def pool(timescale_listo: str):
    import asyncpg

    pool = await asyncpg.create_pool(timescale_listo, min_size=1, max_size=4)
    await pool.execute("TRUNCATE historical_market_snapshots")
    yield pool
    await pool.close()
