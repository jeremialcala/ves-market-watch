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


# -- agregados por ventana: la media NO puede depender del muestreo -----------


async def sembrar_denso(pool, nombre, desde, horas, por_hora, valor):
    """Siembra `por_hora` muestras por hora durante `horas`, todas con el mismo
    valor: así el efecto del muestreo se aísla del efecto del dato."""
    filas = [
        (
            desde + timedelta(hours=h, seconds=int(3600 * i / por_hora)),
            nombre,
            Decimal(valor),
        )
        for h in range(horas)
        for i in range(por_hora)
    ]
    await pool.executemany(
        """
        INSERT INTO indicators (as_of, indicator, currency, value, calc_version)
        VALUES ($1, $2, 'VES', $3, 1)
        ON CONFLICT DO NOTHING
        """,
        filas,
    )


async def test_la_media_NO_se_inclina_hacia_el_tramo_MAS_MUESTREADO(pool):
    """La regresión que motivó el arreglo, con datos sembrados a propósito.

    Un tramo antiguo de 48 h a 40 % con 6 muestras/hora y uno reciente de 48 h a
    10 % con 120 muestras/hora. La media honesta de esas 96 horas es 25 %: los
    dos tramos duran lo mismo. Una media por MUESTRA da ~11,4 %, porque el tramo
    reciente aporta 20 veces más filas.

    No es hipotético: es exactamente lo que pasó al empalmar el histórico
    (cada 10 min) con la serie del motor (cada ~30 s), y desplazó la media de 90
    días de la brecha de venta en 5,4 puntos.
    """
    nombre = f"prueba_muestreo_{AHORA.timestamp()}"
    ahora = datetime.now(UTC)
    await sembrar_denso(pool, nombre, ahora - timedelta(hours=96), 48, 6, "40")
    await sembrar_denso(pool, nombre, ahora - timedelta(hours=48), 48, 120, "10")

    repositorio = TimescaleDistribucionRepository(pool)
    agregados = await repositorio.agregados([nombre], "VES", [7], ahora)
    media = agregados[nombre][7].media

    assert media == pytest.approx(Decimal("25"), abs=Decimal("0.5")), (
        f"media {media}: se inclinó hacia el tramo más muestreado"
    )


async def test_los_extremos_SI_son_por_muestra(pool):
    """Máximo y mínimo no se promedian: son valores realmente observados, y
    suavizarlos por hora escondería justamente el pico que interesa."""
    nombre = f"prueba_extremos_{AHORA.timestamp()}"
    ahora = datetime.now(UTC)
    await sembrar_denso(pool, nombre, ahora - timedelta(hours=48), 47, 4, "10")
    await pool.execute(
        """
        INSERT INTO indicators (as_of, indicator, currency, value, calc_version)
        VALUES ($1, $2, 'VES', $3, 1) ON CONFLICT DO NOTHING
        """,
        ahora - timedelta(hours=1),
        nombre,
        Decimal("99"),
    )

    repositorio = TimescaleDistribucionRepository(pool)
    agregados = await repositorio.agregados([nombre], "VES", [7], ahora)
    assert agregados[nombre][7].maximo == Decimal("99.00000000")


async def test_dias_cubiertos_mide_el_alcance_no_la_densidad(pool):
    """Con 2 días de serie en una ventana de 30, `dias_cubiertos` es 2 por
    muchas muestras que haya: es lo que impide rotularla «30 días»."""
    nombre = f"prueba_alcance_{AHORA.timestamp()}"
    ahora = datetime.now(UTC)
    await sembrar_denso(pool, nombre, ahora - timedelta(hours=48), 48, 60, "15")

    repositorio = TimescaleDistribucionRepository(pool)
    agregados = await repositorio.agregados([nombre], "VES", [30], ahora)
    assert agregados[nombre][30].dias_cubiertos == 2
    assert agregados[nombre][30].muestras == 48 * 60


async def test_los_contadores_son_ENTEROS_no_Decimal(pool):
    """El fallo que tumbó la persistencia del análisis en producción.

    `sum()` sobre `bigint` devuelve NUMERIC en PostgreSQL, así que al agrupar por
    hora `muestras` pasó de int a Decimal y el `json.dumps` del payload reventó
    con «Object of type Decimal is not JSON serializable». Los tests de contrato
    no lo vieron porque construyen los `Agregado` a mano con enteros.
    """
    nombre = f"prueba_tipos_{AHORA.timestamp()}"
    ahora = datetime.now(UTC)
    await sembrar_denso(pool, nombre, ahora - timedelta(hours=6), 6, 5, "12")

    agregados = await TimescaleDistribucionRepository(pool).agregados(
        [nombre], "VES", [7], ahora
    )
    agregado = agregados[nombre][7]

    assert isinstance(agregado.muestras, int)
    assert not isinstance(agregado.muestras, bool)
    assert isinstance(agregado.dias_cubiertos, int)
    # Y el payload que los lleva tiene que serializar.
    import json

    json.dumps({"samples": agregado.muestras, "days": agregado.dias_cubiertos})
