"""Repositorio de lectura contra TimescaleDB real (docker compose up -d --wait).

Siembra con un pool admin (RW) y lee con el repositorio del gateway, que
abre su propio pool en modo `default_transaction_read_only=on`.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta

import asyncpg
import pytest

from api_gateway.adapters.timescale.repository import TimescaleLecturaRepository
from tests.conftest import item_crudo

pytestmark = pytest.mark.integration

AHORA = datetime.now(UTC)


@pytest.fixture
async def repo(timescale_listo, pool):
    repositorio = await TimescaleLecturaRepository.connect(timescale_listo)
    yield repositorio
    await repositorio.close()


async def _sembrar_tasa(pool, currency="USD", rate="417.03", status="valid", hace=0, dias_valor=0):
    await pool.execute(
        "INSERT INTO official_rates (captured_at, currency, rate, value_date, status)"
        " VALUES ($1, $2, $3, $4, $5)",
        AHORA - timedelta(hours=hace),
        currency,
        rate,
        date.today() - timedelta(days=dias_valor),
        status,
    )


async def test_tasa_vigente_ignora_suspect_y_rejected(pool, repo):
    await _sembrar_tasa(pool, rate="400.00", hace=3)
    await _sembrar_tasa(pool, rate="417.03", hace=2)
    await _sembrar_tasa(pool, rate="999.99", status="suspect", hace=1)
    await _sembrar_tasa(pool, rate="888.88", status="rejected", hace=0)
    fila = await repo.tasa_oficial_vigente("USD")
    assert fila["rate"] == "417.03000000"


async def test_historial_una_fila_por_dia_con_la_ultima_captura(pool, repo):
    await _sembrar_tasa(pool, rate="410.00", hace=26, dias_valor=1)
    await _sembrar_tasa(pool, rate="411.00", hace=25, dias_valor=1)  # gana el día 1
    await _sembrar_tasa(pool, rate="417.03", hace=1, dias_valor=0)
    filas, total = await repo.historial_tasa_oficial(
        "USD", date.today() - timedelta(days=7), date.today(), 0, 100
    )
    assert total == 2
    assert [f["rate"] for f in filas] == ["417.03000000", "411.00000000"]


async def _sembrar_indicador(pool, nombre, valor, currency="VES", hace_min=0):
    await pool.execute(
        "INSERT INTO indicators (as_of, indicator, currency, value, calc_version)"
        " VALUES ($1, $2, $3, $4, 1)",
        AHORA - timedelta(minutes=hace_min),
        nombre,
        currency,
        valor,
    )


async def test_indicadores_vigentes_toma_la_ultima_fila(pool, repo):
    await _sembrar_indicador(pool, "p2p_mediana_buy", "850.00", hace_min=10)
    await _sembrar_indicador(pool, "p2p_mediana_buy", "853.10", hace_min=1)
    vigentes = await repo.indicadores_vigentes(["p2p_mediana_buy"], "VES")
    assert vigentes["p2p_mediana_buy"]["value"] == "853.10000000"


async def test_historial_indicadores_agrega_por_bucket(pool, repo):
    base = AHORA.replace(minute=0, second=0, microsecond=0)
    for minuto, valor in ((5, "100.00"), (25, "101.00"), (65, "102.00")):
        await pool.execute(
            "INSERT INTO indicators (as_of, indicator, currency, value, calc_version)"
            " VALUES ($1, 'official_rate', 'USD', $2, 1)",
            base - timedelta(hours=2) + timedelta(minutes=minuto),
            valor,
        )
    filas, total = await repo.historial_indicadores(
        base - timedelta(hours=3), base, "1h", 0, 100
    )
    assert total == 2  # dos buckets de 1 h
    # el bucket más reciente primero; dentro del bucket viejo gana el último valor
    assert [f["value"] for f in filas] == ["102.00000000", "101.00000000"]


async def test_snapshot_p2p_reciente_decodifica_items(pool, repo):
    crudo = [item_crudo("850.00", "100"), item_crudo("851.00", "50")]
    await pool.execute(
        "INSERT INTO p2p_snapshots_raw (captured_at, side, asset, fiat, ad_count, raw)"
        " VALUES ($1, 'BUY', 'USDT', 'VES', 2, $2::jsonb)",
        AHORA,
        json.dumps(crudo),
    )
    snap = await repo.snapshot_p2p_reciente("BUY")
    assert snap["items"][0]["adv"]["price"] == "850.00"
    assert await repo.snapshot_p2p_reciente("SELL") is None


async def test_senales_filtra_por_tipo_y_decodifica_evidencia(pool, repo):
    for tipo in ("correccion_inminente", "techo_inminente"):
        await pool.execute(
            "INSERT INTO signals (emitted_at, as_of, type, direction, currency,"
            " rule, calc_version, triggered_by, evidence)"
            " VALUES ($1, $2, $3, 'bajista', 'VES', $4, 1, gen_random_uuid(), $5::jsonb)",
            AHORA,
            AHORA - timedelta(minutes=1),
            tipo,
            f"{tipo}@v1",
            json.dumps({"rule": f"{tipo}@v1", "inputs": {"p2p_spread_pct": "-0.8"}}),
        )
    filas, total = await repo.senales(
        AHORA - timedelta(hours=1), AHORA + timedelta(minutes=1),
        "techo_inminente", 0, 100,
    )
    assert total == 1
    assert filas[0]["evidence"]["inputs"] == {"p2p_spread_pct": "-0.8"}


async def test_el_pool_del_gateway_es_solo_lectura(repo):
    """Defensa en profundidad (T9): un INSERT por el pool del gateway falla."""
    with pytest.raises(asyncpg.ReadOnlySQLTransactionError):
        await repo._pool.execute(
            "INSERT INTO indicators (as_of, indicator, currency, value, calc_version)"
            " VALUES (now(), 'x', 'USD', 1, 1)"
        )


async def test_ping(repo):
    assert await repo.ping() is True
