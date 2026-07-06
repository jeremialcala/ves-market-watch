"""Fixtures compartidos del indicator-engine.

Mismo patrón que ingestor-bcv: los fixtures de infraestructura hacen probe
corto y skip con instrucciones si no hay `docker compose up -d --wait`.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pytest

MIGRACIONES = Path(__file__).parents[1] / "db" / "migrations"
SCHEMAS_DIR = Path(__file__).parents[3] / "schemas"

DSN_TEST_POR_DEFECTO = "postgresql://postgres:postgres@127.0.0.1:5433/ves_market_test"
AMQP_TEST_POR_DEFECTO = "amqp://guest:guest@127.0.0.1:5672/"

_SUGERENCIA = "levantar la infraestructura con: docker compose up -d --wait (raíz del repo)"


def evento_tasa_oficial(
    currency: str = "USD",
    rate: str = "667.05000000",
    value_date: str = "2026-07-06",
    captured_at: str | None = None,
    event_id: str | None = None,
) -> dict:
    """Evento `official.rate.updated` válido según `schemas/official-rate.v1.json`
    (misma forma que produce `ingestor_bcv.adapters.amqp.publisher.construir_evento`)."""
    return {
        "event_id": event_id or str(uuid.uuid4()),
        "event_type": "official.rate.updated",
        "schema_version": 1,
        "occurred_at": datetime.now(UTC).isoformat(),
        "producer": "ingestor-bcv",
        "payload": {
            "source": "BCV",
            "currency": currency,
            "rate": rate,
            "value_date": value_date,
            "captured_at": captured_at or datetime.now(UTC).isoformat(),
            "status": "valid",
        },
    }


def _con_base_de_datos(dsn: str, nombre: str) -> str:
    partes = urlsplit(dsn)
    return urlunsplit(partes._replace(path=f"/{nombre}"))


def _tiene_comando_sql(sentencia: str) -> bool:
    return any(
        linea.strip() and not linea.strip().startswith("--")
        for linea in sentencia.splitlines()
    )


@pytest.fixture(scope="session")
def validador():
    from indicator_engine.application.contracts import ValidadorDeContratos

    return ValidadorDeContratos(SCHEMAS_DIR)


@pytest.fixture
def crear_evento():
    """Factory de eventos `official.rate.updated` válidos (kwargs para variar)."""
    return evento_tasa_oficial


@pytest.fixture(scope="session")
def timescale_listo() -> str:
    """Prepara `ves_market_test` con las migraciones del engine y devuelve su DSN."""
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


@pytest.fixture(scope="session")
def amqp_listo() -> str:
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
    """Pool asyncpg en el loop del test, con las tablas del engine limpias."""
    import asyncpg

    pool = await asyncpg.create_pool(timescale_listo, min_size=1, max_size=4)
    await pool.execute("TRUNCATE indicators, processed_events")
    yield pool
    await pool.close()
