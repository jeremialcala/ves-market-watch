"""Fixtures compartidos.

Los de infraestructura (TimescaleDB/RabbitMQ) hacen un probe corto y, si no hay
infraestructura levantada, hacen skip con instrucciones — la suite unit/contract
nunca depende de ellos. Levantar la infra desde la raíz del repo:

    docker compose up -d --wait
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pytest

FIXTURES = Path(__file__).parent / "fixtures"
MIGRACION = Path(__file__).parents[1] / "db" / "migrations" / "001_official_rates.sql"

DSN_TEST_POR_DEFECTO = "postgresql://postgres:postgres@localhost:5432/ves_market_test"
AMQP_TEST_POR_DEFECTO = "amqp://guest:guest@localhost:5672/"

_SUGERENCIA = "levantar la infraestructura con: docker compose up -d --wait (raíz del repo)"


@pytest.fixture(scope="session")
def bcv_html() -> str:
    """Página real de bcv.org.ve capturada el 2026-07-05 (fecha-valor 2026-07-06)."""
    return (FIXTURES / "bcv_home.html").read_text(encoding="utf-8")


def _con_base_de_datos(dsn: str, nombre: str) -> str:
    partes = urlsplit(dsn)
    return urlunsplit(partes._replace(path=f"/{nombre}"))


@pytest.fixture(scope="session")
def timescale_listo() -> str:
    """Prepara la DB de test (crea `ves_market_test` + aplica la migración real)
    y devuelve su DSN. Skip si TimescaleDB no está disponible.

    Corre en su propio event loop (asyncio.run) para que ningún objeto async
    de sesión cruce hacia los loops por-test de pytest-asyncio.
    """
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
            # Sentencia por sentencia y fuera de transacción: CREATE EXTENSION y
            # create_hypertable no toleran el batch implícito del protocolo simple.
            for sentencia in MIGRACION.read_text(encoding="utf-8").split(";"):
                if sentencia.strip():
                    await conexion.execute(sentencia)
        finally:
            await conexion.close()

    try:
        asyncio.run(asyncio.wait_for(_preparar(), timeout=30))
    except Exception as exc:
        pytest.skip(f"TimescaleDB no disponible ({exc}); {_SUGERENCIA}")
    return dsn


@pytest.fixture(scope="session")
def amqp_listo() -> str:
    """Devuelve la URL AMQP de test. Skip si RabbitMQ no está disponible."""
    import aio_pika

    url = os.environ.get("TEST_AMQP_URL", AMQP_TEST_POR_DEFECTO)

    async def _probar() -> None:
        conexion = await aio_pika.connect(url, timeout=3)
        await conexion.close()

    try:
        asyncio.run(asyncio.wait_for(_probar(), timeout=10))
    except Exception as exc:
        pytest.skip(f"RabbitMQ no disponible ({exc}); {_SUGERENCIA}")
    return url


@pytest.fixture
async def pool(timescale_listo: str):
    """Pool asyncpg en el loop del test, con las tablas limpias."""
    import asyncpg

    pool = await asyncpg.create_pool(timescale_listo, min_size=1, max_size=4)
    await pool.execute("TRUNCATE official_rates, official_rate_source_health")
    yield pool
    await pool.close()
