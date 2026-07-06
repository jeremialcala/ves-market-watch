"""Fixtures compartidos del ingestor-binance.

Mismo patrón que los demás servicios: probe corto + skip si no hay
`docker compose up -d --wait`. Incluye un factory de servidores HTTP locales
para simular el endpoint P2P (integración y e2e sin tocar Binance).
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pytest

FIXTURES = Path(__file__).parent / "fixtures"
MIGRACIONES = Path(__file__).parents[1] / "db" / "migrations"
SCHEMA_FUENTE = Path(__file__).parents[1] / "schemas" / "binance-adv-search.response.json"
SCHEMAS_REPO = Path(__file__).parents[3] / "schemas"

DSN_TEST_POR_DEFECTO = "postgresql://postgres:postgres@127.0.0.1:5433/ves_market_test"
AMQP_TEST_POR_DEFECTO = "amqp://guest:guest@127.0.0.1:5672/"

_SUGERENCIA = "levantar la infraestructura con: docker compose up -d --wait (raíz del repo)"


def cargar_fixture(lado: str) -> dict:
    """Respuesta real del endpoint adv/search capturada el 2026-07-05 (spike)."""
    return json.loads(
        (FIXTURES / f"adv_search_{lado.lower()}_p1.json").read_text(encoding="utf-8")
    )


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
    import asyncpg

    pool = await asyncpg.create_pool(timescale_listo, min_size=1, max_size=4)
    await pool.execute("TRUNCATE p2p_snapshots_raw")
    yield pool
    await pool.close()


@pytest.fixture
async def servidor_http():
    """Factory de servidores HTTP locales: `crear(manejador)` → URL base.

    `manejador(cuerpo_json: dict) -> (status: int, respuesta: dict | bytes)`
    se invoca por cada POST recibido.
    """
    servidores: list[asyncio.Server] = []

    async def crear(manejador):
        async def atender(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
            try:
                cabeceras = (await reader.readuntil(b"\r\n\r\n")).decode("latin1")
                coincidencia = re.search(r"Content-Length:\s*(\d+)", cabeceras, re.I)
                cuerpo = (
                    await reader.readexactly(int(coincidencia.group(1)))
                    if coincidencia
                    else b""
                )
                peticion = json.loads(cuerpo) if cuerpo else {}
                status, respuesta = manejador(peticion)
                if not isinstance(respuesta, bytes):
                    respuesta = json.dumps(respuesta).encode("utf-8")
                writer.write(
                    f"HTTP/1.1 {status} X\r\n"
                    "Content-Type: application/json\r\n"
                    f"Content-Length: {len(respuesta)}\r\n"
                    "Connection: close\r\n\r\n".encode("latin1") + respuesta
                )
                await writer.drain()
            finally:
                writer.close()

        servidor = await asyncio.start_server(atender, "127.0.0.1", 0)
        servidores.append(servidor)
        puerto = servidor.sockets[0].getsockname()[1]
        return f"http://127.0.0.1:{puerto}/"

    yield crear

    for servidor in servidores:
        servidor.close()
        await servidor.wait_closed()
