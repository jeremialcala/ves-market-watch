"""Consulta de percentiles contra TimescaleDB real (RF-6, ADR-0019 D.1).

Lo que se verifica aquí no se puede verificar en memoria: que `percentile_disc`
devuelve `numeric` EXACTO —no float— y valores realmente observados en la serie,
que la ventana recorta de verdad, y que un indicador sin filas simplemente no
aparece. Requiere infraestructura (docker compose up -d --wait).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from indicator_engine.adapters.timescale.repository import (
    TimescaleDistribucionRepository,
)

pytestmark = pytest.mark.integration

AHORA = datetime(2026, 7, 31, 20, 0, tzinfo=UTC)
PERCENTILES = [Decimal("0.1"), Decimal("0.5"), Decimal("0.9")]


async def sembrar(pool, nombre: str, valores: list[str], desde: datetime) -> None:
    await pool.executemany(
        """
        INSERT INTO indicators (as_of, indicator, currency, value, calc_version)
        VALUES ($1, $2, 'VES', $3, 1)
        ON CONFLICT DO NOTHING
        """,
        [
            (desde + timedelta(minutes=i), nombre, Decimal(v))
            for i, v in enumerate(valores)
        ],
    )


async def test_los_cortes_son_valores_realmente_observados_y_exactos(pool):
    # 1..100 en la ventana: p10 = 10, p50 = 50, p90 = 90 con percentile_disc.
    await sembrar(
        pool, "prueba_dist", [str(n) for n in range(1, 101)], AHORA - timedelta(hours=2)
    )
    repo = TimescaleDistribucionRepository(pool)

    dists = await repo.distribuciones(
        ["prueba_dist"], "VES", AHORA - timedelta(days=90), PERCENTILES
    )

    d = dists["prueba_dist"]
    assert d.muestras == 100
    assert (d.minimo, d.maximo) == (Decimal("1"), Decimal("100"))
    # percentile_disc, NUNCA percentile_cont: numeric exacto, no float (ADR-0017).
    assert all(isinstance(c, Decimal) for c in d.cortes)
    assert d.cortes == (Decimal("10"), Decimal("50"), Decimal("90"))
    assert d.calculada_en is not None


async def test_la_ventana_recorta_de_verdad(pool):
    await sembrar(pool, "prueba_vieja", ["1000"] * 10, AHORA - timedelta(days=120))
    await sembrar(pool, "prueba_vieja", ["5"] * 10, AHORA - timedelta(hours=1))
    repo = TimescaleDistribucionRepository(pool)

    dists = await repo.distribuciones(
        ["prueba_vieja"], "VES", AHORA - timedelta(days=90), PERCENTILES
    )

    # Solo las 10 filas de dentro de la ventana.
    assert dists["prueba_vieja"].muestras == 10
    assert dists["prueba_vieja"].maximo == Decimal("5")


async def test_un_indicador_sin_filas_no_aparece(pool):
    await sembrar(pool, "prueba_presente", ["1", "2", "3"], AHORA - timedelta(hours=1))
    repo = TimescaleDistribucionRepository(pool)

    dists = await repo.distribuciones(
        ["prueba_presente", "prueba_ausente"],
        "VES",
        AHORA - timedelta(days=90),
        PERCENTILES,
    )

    # No se fabrica una distribución vacía: el dominio degrada al respaldo.
    assert set(dists) == {"prueba_presente"}


async def test_la_moneda_filtra(pool):
    await sembrar(pool, "prueba_moneda", ["7"] * 5, AHORA - timedelta(hours=1))
    repo = TimescaleDistribucionRepository(pool)

    assert (
        await repo.distribuciones(
            ["prueba_moneda"], "COP", AHORA - timedelta(days=90), PERCENTILES
        )
        == {}
    )


async def test_una_sola_consulta_resuelve_varios_indicadores(pool):
    """La forma multi-fracción devuelve todos los cortes por indicador en un
    round trip: seis medidores no son seis consultas."""
    await sembrar(pool, "prueba_a", [str(n) for n in range(1, 21)], AHORA - timedelta(hours=3))
    await sembrar(pool, "prueba_b", [str(n) for n in range(100, 120)], AHORA - timedelta(hours=3))
    repo = TimescaleDistribucionRepository(pool)

    dists = await repo.distribuciones(
        ["prueba_a", "prueba_b"], "VES", AHORA - timedelta(days=90), PERCENTILES
    )

    assert set(dists) == {"prueba_a", "prueba_b"}
    assert len(dists["prueba_a"].cortes) == 3
    assert len(dists["prueba_b"].cortes) == 3
