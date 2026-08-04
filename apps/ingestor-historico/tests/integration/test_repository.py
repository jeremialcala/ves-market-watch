"""Integración: repositorio contra TimescaleDB real (docker compose up -d --wait)."""

from __future__ import annotations

import json
from decimal import Decimal

import pytest
from conftest import FIXTURES, TZ_CARACAS

from ingestor_historico.adapters.csv_reader import leer_csv
from ingestor_historico.adapters.timescale.repository import (
    TimescaleRepositorioHistorico,
)
from ingestor_historico.application.cargar_historicos import CargarHistoricos

pytestmark = pytest.mark.integration

FIXTURE = FIXTURES / "query_result_muestra.csv"


async def test_connect_arma_el_repositorio_igual_que_en_produccion(timescale_listo):
    """`connect()`/`close()` es lo que usa `_cmd_cargar`, y no lo tocaba nadie.

    Tercera vez que aparece el mismo hueco en este monorepo —ya estaba en
    `ingestor-bcv` y en `ingestor-binance`— y siempre por la misma causa: el
    fixture de integración recibe el pool ya construido, así que la forma en que
    el servicio se conecta de verdad no se ejercita en ningún sitio.
    """
    repositorio = await TimescaleRepositorioHistorico.connect(timescale_listo)
    try:
        assert await repositorio.leer_puntos(None, None) is not None
    finally:
        await repositorio.close()


async def test_carga_y_relectura_round_trip(pool):
    repositorio = TimescaleRepositorioHistorico(pool)
    cabeceras, filas = leer_csv(FIXTURE)
    caso = CargarHistoricos(repositorio)

    resumen = await caso.ejecutar(cabeceras, filas, FIXTURE.name, TZ_CARACAS)
    assert resumen.insertadas == 11
    assert resumen.duplicadas == 0

    # Recarga: ON CONFLICT no duplica.
    recarga = await caso.ejecutar(cabeceras, filas, FIXTURE.name, TZ_CARACAS)
    assert recarga.insertadas == 0
    assert recarga.duplicadas == 11
    assert await pool.fetchval("SELECT count(*) FROM historical_market_snapshots") == 11

    # Round-trip de la serie para estadísticas.
    puntos = await repositorio.leer_puntos(None, None)
    assert len(puntos) == 11
    assert puntos[0].precio == Decimal("396.55")
    assert puntos[0].tasas_por_banco["Banesco"] == Decimal("396.79")
    assert puntos[0].capturado_en < puntos[-1].capturado_en


async def test_detalle_por_banco_persistido(pool):
    repositorio = TimescaleRepositorioHistorico(pool)
    cabeceras, filas = leer_csv(FIXTURE)
    await CargarHistoricos(repositorio).ejecutar(
        cabeceras, filas, FIXTURE.name, TZ_CARACAS
    )

    banks = json.loads(
        await pool.fetchval(
            """
            SELECT banks FROM historical_market_snapshots
            WHERE source_id = '692f5f0ddb32e097a433cd13'
            """
        )
    )
    assert banks["Mercantil"]["low_liquidity"] is True
    assert banks["SpecificBank"]["available"] == 94238
    assert banks["Banesco"]["rate"] == 398.5
