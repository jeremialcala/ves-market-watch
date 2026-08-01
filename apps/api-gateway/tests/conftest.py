"""Fixtures compartidos del api-gateway.

Mismo patrón que los servicios hermanos: los fixtures de infraestructura
hacen probe corto y skip con instrucciones si no hay `docker compose up -d
--wait`. La autenticación de tests usa un par RSA local servido como JWKS
estático — misma validación RS256/aud/iss que producción, sin red ni Auth0.
"""

from __future__ import annotations

import asyncio
import dataclasses
import os
import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pytest

from api_gateway.application.ports import LecturaRepository
from api_gateway.config import Settings
from tests.soporte_auth import (  # noqa: F401 — reexportados para los tests
    AUDIENCE_TEST,
    ISSUER_TEST,
    KID_TEST,
    PERMISOS_TODOS,
    firmar_token,
    jwks_de_test,
)

APP_DIR = Path(__file__).parents[1]
RAIZ_REPO = Path(__file__).parents[3]
SCHEMAS_DIR = RAIZ_REPO / "schemas"
OPENAPI = APP_DIR / "docs" / "openapi.yaml"

# Migraciones de los productores: el gateway solo LEE estas tablas.
MIGRACIONES = [
    RAIZ_REPO / "apps" / "ingestor-bcv" / "db" / "migrations" / "001_official_rates.sql",
    RAIZ_REPO / "apps" / "ingestor-bcv" / "db" / "migrations" / "002_suspect_resolution.sql",
    RAIZ_REPO / "apps" / "indicator-engine" / "db" / "migrations" / "001_indicators.sql",
    RAIZ_REPO / "apps" / "indicator-engine" / "db" / "migrations" / "002_signals.sql",
    RAIZ_REPO / "apps" / "indicator-engine" / "db" / "migrations" / "003_analysis.sql",
    RAIZ_REPO / "apps" / "ingestor-binance" / "db" / "migrations" / "001_p2p_snapshots.sql",
]

DSN_TEST_POR_DEFECTO = "postgresql://postgres:postgres@127.0.0.1:5433/ves_market_gw_test"
AMQP_TEST_POR_DEFECTO = "amqp://guest:guest@127.0.0.1:5672/"

_SUGERENCIA = "levantar la infraestructura con: docker compose up -d --wait (raíz del repo)"


def settings_de_test(**cambios) -> Settings:
    base = Settings.from_env({})
    return dataclasses.replace(
        base,
        auth0_issuer=ISSUER_TEST,
        auth0_audience=AUDIENCE_TEST,
        jwks_uri="https://vmw-test.local/jwks.json",  # nunca se llama (JWKS estático)
        **cambios,
    )


# -- repositorio en memoria (unit/contract) ----------------------------------


class RepositorioEnMemoria(LecturaRepository):
    """Doble del puerto de lectura, sembrable por atributos."""

    def __init__(self) -> None:
        self.tasas: dict[str, dict] = {}
        self.historial_tasas: list[dict] = []
        self.vigentes: dict[tuple[str, str], dict] = {}
        self.historial_ind: list[dict] = []
        self.snapshots: dict[str, dict] = {}
        self.filas_senales: list[dict] = []
        self.analisis: dict[str, dict] = {}
        self.db_ok = True

    async def tasa_oficial_vigente(self, currency: str) -> dict | None:
        return self.tasas.get(currency)

    async def historial_tasa_oficial(self, currency, desde, hasta, offset, limite):
        filas = [
            f
            for f in self.historial_tasas
            if f["currency"] == currency and desde <= f["value_date"] <= hasta
        ]
        return filas[offset : offset + limite], len(filas)

    async def indicadores_vigentes(self, nombres, currency):
        return {
            n: self.vigentes[(n, currency)]
            for n in nombres
            if (n, currency) in self.vigentes
        }

    async def historial_indicadores(
        self, desde, hasta, intervalo, indicador, moneda, offset, limite
    ):
        filas = [
            f
            for f in self.historial_ind
            if desde <= f["as_of"] <= hasta
            and (indicador is None or f["indicator"] == indicador)
            and (moneda is None or f["currency"] == moneda)
        ]
        return filas[offset : offset + limite], len(filas)

    async def snapshot_p2p_reciente(self, side):
        return self.snapshots.get(side)

    async def senales(self, desde, hasta, tipo, offset, limite):
        filas = [
            f
            for f in self.filas_senales
            if desde <= f["emitted_at"] <= hasta and (tipo is None or f["type"] == tipo)
        ]
        return filas[offset : offset + limite], len(filas)

    async def analisis_vigente(self, currency):
        return self.analisis.get(currency)

    async def ping(self):
        return self.db_ok


def fila_tasa(
    currency: str = "USD",
    rate: str = "417.03000000",
    hace: timedelta = timedelta(hours=1),
) -> dict:
    ahora = datetime.now(UTC)
    return {
        "currency": currency,
        "rate": rate,
        "value_date": date.today(),
        "captured_at": ahora - hace,
    }


def fila_indicador(
    valor: str = "417.03000000",
    hace: timedelta = timedelta(minutes=1),
    calc_version: int = 1,
) -> dict:
    return {
        "value": valor,
        "as_of": datetime.now(UTC) - hace,
        "calc_version": calc_version,
    }


def fila_senal(tipo: str = "correccion_inminente") -> dict:
    ahora = datetime.now(UTC)
    return {
        "emitted_at": ahora,
        "as_of": ahora - timedelta(minutes=1),
        "type": tipo,
        "direction": "bajista",
        "currency": "VES",
        "calc_version": 1,
        "triggered_by": str(uuid.uuid4()),
        "evidence": {
            "rule": f"{tipo}@v1",
            "inputs": {"p2p_spread_pct": "-0.8", "p2p_momentum_bid_3h_pct": "1.4"},
        },
    }


def payload_analisis(
    as_of: datetime | None = None,
    currency: str = "VES",
    confidence: str = "normal",
    fuente: str = "percentiles",
    triggered_by: str | None = None,
) -> dict:
    """Documento `IndicatorAnalysis` válido según `schemas/analysis.v1.json`
    (`payload` del evento `analysis.updated`, que es lo que persiste el motor)."""
    momento = as_of or (datetime.now(UTC) - timedelta(minutes=1))
    escala = {
        "source": fuente,
        "window_days": 90,
        "samples": 4187 if fuente == "percentiles" else 137,
        "min_samples": 200,
        "computed_at": momento.isoformat(),
        "domain": {"min": "0", "max": "3"},
        "cuts": (
            [
                {"key": "p10", "value": "0.40", "position": "0.1000"},
                {"key": "p50", "value": "0.90", "position": "0.5000"},
                {"key": "p90", "value": "2.20", "position": "0.9000"},
            ]
            if fuente == "percentiles"
            else [
                {"key": "techo_inminente@v1", "value": "0.2", "position": "0.0666"},
            ]
        ),
    }
    return {
        "as_of": momento.isoformat(),
        "currency": currency,
        "calc_version": 1,
        "analysis_version": 1,
        "ruleset_version": 1,
        "confidence": confidence,
        "official_stale": False,
        "triggered_by": triggered_by or str(uuid.uuid4()),
        "indicators": [
            {
                "indicator": "p2p_ratio_oferta_demanda",
                "value": "0.59",
                "as_of": momento.isoformat(),
                "band": "low" if fuente == "percentiles" else "unscaled",
                "position": "0.1966",
                "scale": escala,
                "rules": [
                    {
                        "rule": "techo_inminente@v1",
                        "type": "techo_inminente",
                        "direction": "bajista",
                        "op": "lt",
                        "threshold": "0.2",
                        "met": False,
                        "distance": "0.39",
                        "threshold_position": "0.0666",
                    }
                ],
            }
        ],
        "rule_proximity": [
            {
                "rule": "techo_inminente@v1",
                "type": "techo_inminente",
                "direction": "bajista",
                "conditions_total": 3,
                "conditions_met": 1,
                "evaluable": True,
                "blocked_by": "p2p_momentum_bid_3h_pct",
                "conditions": [
                    {
                        "indicator": "p2p_momentum_bid_3h_pct",
                        "op": "gt",
                        "threshold": "1.5",
                        "value": "0.30",
                        "met": False,
                        "distance": "1.20",
                    },
                    {
                        "indicator": "p2p_spread_pct",
                        "op": "lt",
                        "threshold": "0.5",
                        "value": "0.40",
                        "met": True,
                        "distance": "-0.10",
                    },
                    {
                        "indicator": "p2p_ratio_oferta_demanda",
                        "op": "lt",
                        "threshold": "0.2",
                        "value": "0.59",
                        "met": False,
                        "distance": "0.39",
                    },
                ],
            }
        ],
        "summary": {
            "rules_total": 3,
            "rules_evaluable": 1,
            "closest_rule": "techo_inminente@v1",
            "conditions_met": 1,
            "conditions_total": 3,
            "blocked_by": "p2p_momentum_bid_3h_pct",
            "rules_met": [],
        },
    }


def fila_analisis(
    hace: timedelta = timedelta(minutes=1), currency: str = "VES", **kwargs
) -> dict:
    """Fila de `indicator_analysis` tal como la devuelve el repositorio."""
    momento = datetime.now(UTC) - hace
    return {
        "as_of": momento,
        "payload": payload_analisis(as_of=momento, currency=currency, **kwargs),
    }


def evento_analisis(currency: str = "VES", **kwargs) -> dict:
    """Evento `analysis.updated` válido según `schemas/analysis.v1.json`."""
    return {
        "event_id": str(uuid.uuid4()),
        "event_type": "analysis.updated",
        "schema_version": 1,
        "occurred_at": datetime.now(UTC).isoformat(),
        "producer": "indicator-engine",
        "payload": payload_analisis(currency=currency, **kwargs),
    }


def item_crudo(precio: str, disponible: str) -> dict:
    """Item minimizado de `p2p_snapshots_raw.raw` (forma del ingestor-binance)."""
    return {
        "adv": {"price": precio, "surplusAmount": disponible},
        "advertiser": {"userType": "user", "merchant_ref": "ab" * 16},
    }


# -- eventos del bus (integration/e2e) ---------------------------------------


def evento_senal(tipo: str = "correccion_inminente") -> dict:
    """Evento `signals.emitted` válido según `schemas/signal.v1.json`."""
    ahora = datetime.now(UTC)
    return {
        "event_id": str(uuid.uuid4()),
        "event_type": "signals.emitted",
        "schema_version": 1,
        "occurred_at": ahora.isoformat(),
        "producer": "indicator-engine",
        "payload": {
            "type": tipo,
            "direction": "bajista",
            "currency": "VES",
            "as_of": (ahora - timedelta(minutes=1)).isoformat(),
            "calc_version": 1,
            "triggered_by": str(uuid.uuid4()),
            "evidence": {
                "rule": f"{tipo}@v1",
                "inputs": {"p2p_spread_pct": "-0.8"},
            },
        },
    }


# -- fixtures ----------------------------------------------------------------


@pytest.fixture
def repositorio() -> RepositorioEnMemoria:
    return RepositorioEnMemoria()


@pytest.fixture
def app(repositorio):
    from api_gateway.adapters.auth.jwks import ValidadorTokenAuth0
    from api_gateway.app import create_app

    settings = settings_de_test()
    validador = ValidadorTokenAuth0(
        jwks_uri=settings.jwks_uri,
        issuer=settings.auth0_issuer,
        audience=settings.auth0_audience,
        jwks_estatico=jwks_de_test(),
    )
    return create_app(
        settings, validador=validador, repositorio=repositorio, con_amqp=False
    )


@pytest.fixture
def cliente(app):
    from fastapi.testclient import TestClient

    with TestClient(app) as cliente:
        yield cliente


@pytest.fixture
def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {firmar_token()}"}


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
    """Prepara `ves_market_gw_test` con las migraciones de los productores."""
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
            for migracion in MIGRACIONES:
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
    """Pool ADMIN (lectura-escritura) para sembrar datos; las tablas nacen limpias."""
    import asyncpg

    pool = await asyncpg.create_pool(timescale_listo, min_size=1, max_size=4)
    await pool.execute(
        "TRUNCATE official_rates, official_rate_source_health, indicators, "
        "processed_events, signals, p2p_snapshots_raw, indicator_analysis"
    )
    yield pool
    await pool.close()
