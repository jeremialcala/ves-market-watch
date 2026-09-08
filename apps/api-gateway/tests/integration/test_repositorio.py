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
        base - timedelta(hours=3), base, "1h", None, None, 0, 100
    )
    assert total == 2  # dos buckets de 1 h
    # el bucket más reciente primero; dentro del bucket viejo gana el último valor
    assert [f["value"] for f in filas] == ["102.00000000", "101.00000000"]


async def test_historial_indicadores_agrega_por_bucket_de_15_min(pool, repo):
    """El bucket de 15 min agrupa DE VERDAD, no solo se acepta.

    Se anadio para la barra del intradia (tres pastillas 5/15/60 min) y el
    contrato solo tenia 5m/1h/1d: un 15m se iba en 422. Cuatro capturas dentro
    de la misma hora tienen que caer en dos buckets de 15 min y en uno solo de
    1 h — si el intervalo no llegara al `time_bucket`, los dos totales
    coincidirian y la prueba no diria nada.
    """
    base = AHORA.replace(minute=0, second=0, microsecond=0) - timedelta(hours=2)
    for minuto, valor in ((1, "100.00"), (7, "101.00"), (16, "102.00"), (29, "103.00")):
        await pool.execute(
            "INSERT INTO indicators (as_of, indicator, currency, value, calc_version)"
            " VALUES ($1, 'official_rate', 'USD', $2, 1)",
            base + timedelta(minutes=minuto),
            valor,
        )
    desde, hasta = base - timedelta(minutes=1), base + timedelta(hours=1)

    filas, total = await repo.historial_indicadores(desde, hasta, "15m", None, None, 0, 100)
    assert total == 2
    # Bucket reciente primero; dentro de cada uno gana la ultima captura.
    assert [f["value"] for f in filas] == ["103.00000000", "101.00000000"]

    _, total_1h = await repo.historial_indicadores(desde, hasta, "1h", None, None, 0, 100)
    assert total_1h == 1


async def test_historial_indicadores_filtra_en_servidor(pool, repo):
    """El filtro por indicador/moneda es del SQL, no del cliente: sin él, un
    dashboard paginaría toda la tabla y agotaría su cuota (visto en vivo)."""
    for nombre, moneda in (
        ("p2p_brecha_pct_buy", "VES"),
        ("p2p_spread_pct", "VES"),
        ("official_rate", "USD"),
    ):
        await _sembrar_indicador(pool, nombre, "1.0", currency=moneda)
    filas, total = await repo.historial_indicadores(
        AHORA - timedelta(hours=1),
        AHORA + timedelta(minutes=1),
        "1h",
        "p2p_brecha_pct_buy",
        "VES",
        0,
        100,
    )
    assert total == 1
    assert filas[0]["indicator"] == "p2p_brecha_pct_buy"


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


async def test_analisis_vigente_toma_la_ultima_revision_y_conserva_los_strings(
    pool, repo
):
    """El codec jsonb ya registrado decodifica el documento sin round-trip por
    float: los decimales llegan al SPA como el string exacto que se publicó."""
    for minutos, posicion in ((10, "0.1000"), (1, "0.2996")):
        await pool.execute(
            "INSERT INTO indicator_analysis (as_of, currency, triggered_by,"
            " calc_version, analysis_version, ruleset_version, confidence,"
            " official_stale, scale_source, payload)"
            " VALUES ($1, 'VES', gen_random_uuid(), 1, 1, 1, 'normal', false,"
            " 'percentiles', $2::jsonb)",
            AHORA - timedelta(minutes=minutos),
            json.dumps(
                {
                    "as_of": (AHORA - timedelta(minutes=minutos)).isoformat(),
                    "indicators": [{"position": posicion, "value": "13.220000"}],
                }
            ),
        )

    fila = await repo.analisis_vigente("VES")

    assert fila["payload"]["indicators"][0]["position"] == "0.2996"  # la última
    assert fila["payload"]["indicators"][0]["value"] == "13.220000"  # ceros intactos


async def test_analisis_vigente_sin_fila_es_none(pool, repo):
    assert await repo.analisis_vigente("COP") is None
