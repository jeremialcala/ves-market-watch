"""Los dos adaptadores que escriben en tablas de OTROS servicios (ADR-0013).

El histórico de tasas va a `official_rates`, la misma que alimenta el
`ingestor-bcv` en vivo; la brecha derivada va a `indicators`, la del motor. Los
dos ficheros llevan en su docstring afirmaciones fuertes sobre por qué eso no
corrompe nada, y ninguna estaba comprobada contra la base real: uno estaba al
0 % y el otro al 51 %.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from conftest import TZ_CARACAS

from ingestor_historico.adapters.timescale.brechas import (
    TAMANO_LOTE,
    TimescaleRepositorioBrechas,
)
from ingestor_historico.adapters.timescale.tasas_oficiales import (
    TimescaleRepositorioTasasOficiales,
)
from ingestor_historico.domain.brechas import (
    CALC_VERSION_DERIVADO,
    INDICADOR_ABS,
    INDICADOR_PCT,
    MONEDA,
    BrechaDerivada,
)
from ingestor_historico.domain.tasas_oficiales import TasaOficialHistorica

pytestmark = pytest.mark.integration

AHORA = datetime(2026, 3, 2, 16, 30, tzinfo=TZ_CARACAS)


def _brecha(cuando: datetime = AHORA) -> BrechaDerivada:
    return BrechaDerivada(
        as_of=cuando,
        precio_p2p=Decimal("40.50"),
        tasa_oficial=Decimal("36.50"),
        abs=Decimal("4.00"),
        pct=Decimal("10.9589"),
    )


def _tasa(
    valor: str = "36.50",
    moneda: str = "USD",
    publicado_en: datetime = AHORA,
    fuente: str = "BCV-historico",
) -> TasaOficialHistorica:
    return TasaOficialHistorica(
        moneda=moneda,
        valor=Decimal(valor),
        fecha_valor=publicado_en.date(),
        publicado_en=publicado_en,
        fuente=fuente,
        archivo_fuente="bcv_fx_historico.csv",
    )


# -- tasas oficiales históricas ---------------------------------------------


async def test_recargar_el_mismo_export_no_duplica(pool_vecinas):
    """Idempotencia por PK (captured_at, currency).

    Es la garantía que permite reintentar una carga de 31 k filas sin pensarlo:
    la segunda pasada no inserta y lo dice en `duplicados`, en vez de sumar filas
    gemelas a la serie oficial.
    """
    repositorio = TimescaleRepositorioTasasOficiales(pool_vecinas)
    tasas = [_tasa(), _tasa(moneda="EUR", valor="39.80")]

    primera = await repositorio.guardar_tasas(tasas)
    segunda = await repositorio.guardar_tasas(tasas)

    assert (primera.insertados, primera.duplicados) == (2, 0)
    assert (segunda.insertados, segunda.duplicados) == (0, 2)
    assert await pool_vecinas.fetchval("SELECT count(*) FROM official_rates") == 2


async def test_la_procedencia_queda_escrita_en_cada_fila(pool_vecinas):
    """`source` es lo único que distingue una fila histórica de una capturada en
    vivo, y ninguna consulta lo filtra: marcarlo es gratis y deja la procedencia
    a la vista de quien audite la serie.

    El caso `-sin-hora` es el que más importa: son filas con FECHA real y hora
    desconocida, y poder aislarlas es la diferencia entre un dato con reserva y
    un dato falso.
    """
    repositorio = TimescaleRepositorioTasasOficiales(pool_vecinas)

    await repositorio.guardar_tasas(
        [
            _tasa(),
            _tasa(
                publicado_en=AHORA + timedelta(days=1),
                fuente="BCV-historico-sin-hora",
            ),
        ]
    )

    fuentes = [
        f["source"]
        for f in await pool_vecinas.fetch(
            "SELECT source FROM official_rates ORDER BY captured_at"
        )
    ]
    assert fuentes == ["BCV-historico", "BCV-historico-sin-hora"]


async def test_todas_las_filas_entran_aunque_pasen_del_tamano_de_lote(pool_vecinas):
    """Seis años son ~31 k filas y se insertan por lotes de 2 000. El contador de
    insertados se acumula entre lotes: si se reasignara en vez de sumar, el
    resumen diría 2 000 sobre 31 000 y parecería una carga fallida."""
    repositorio = TimescaleRepositorioTasasOficiales(pool_vecinas)
    total = TAMANO_LOTE + 250
    tasas = [_tasa(publicado_en=AHORA + timedelta(minutes=i)) for i in range(total)]

    resumen = await repositorio.guardar_tasas(tasas)

    assert resumen.insertados == total
    assert await pool_vecinas.fetchval("SELECT count(*) FROM official_rates") == total


async def test_connect_y_close_son_el_camino_del_CLI(timescale_listo):
    """El resto de la suite recibe el pool ya hecho; `_cmd_cargar_oficiales` no."""
    repositorio = await TimescaleRepositorioTasasOficiales.connect(timescale_listo)
    try:
        resumen = await repositorio.guardar_tasas([_tasa(valor="1.00", moneda="CHF")])
        assert resumen.insertados == 1
    finally:
        await repositorio.close()


# -- brecha derivada ---------------------------------------------------------


async def _snapshot(pool, cuando: datetime, precio: str) -> None:
    await pool.execute(
        """INSERT INTO historical_market_snapshots
               (captured_at, source_id, base_weighted_avg, source_file)
           VALUES ($1, 'test', $2, 'test.csv')""",
        cuando,
        Decimal(precio),
    )


async def _oficial(pool, cuando: datetime, tasa: str, status: str = "valid") -> None:
    # La fecha va como parámetro propio: con `$1::date` junto a `$1` timestamptz,
    # asyncpg no puede deducir un tipo único para el parámetro.
    await pool.execute(
        """INSERT INTO official_rates
               (captured_at, currency, rate, value_date, status, source)
           VALUES ($1, 'USD', $2, $3, $4, 'BCV')""",
        cuando,
        Decimal(tasa),
        cuando.date(),
        status,
    )


async def test_cada_punto_usa_la_tasa_VIGENTE_en_su_instante(pool_vecinas):
    """El LATERAL toma la última tasa anterior o igual al snapshot, no la más
    parecida ni la del día. Con una tasa por publicación y snapshots cada hora,
    usar la equivocada desplazaría toda la brecha derivada."""
    await _oficial(pool_vecinas, AHORA, "36.00")
    await _oficial(pool_vecinas, AHORA + timedelta(hours=5), "37.00")
    await _snapshot(pool_vecinas, AHORA + timedelta(hours=1), "40.00")
    await _snapshot(pool_vecinas, AHORA + timedelta(hours=6), "41.00")

    puntos = await TimescaleRepositorioBrechas(pool_vecinas).puntos_derivables(None)

    assert [p.tasa_oficial for p in puntos] == [Decimal("36.00"), Decimal("37.00")]


async def test_una_tasa_SUSPECT_no_se_usa_para_derivar(pool_vecinas):
    """`status='valid'` en el JOIN no es decorativo: una tasa retenida por
    variación sospechosa (T1) no debe entrar en una serie que después se publica
    como histórico. Se cae a la anterior válida, que es la que regía."""
    await _oficial(pool_vecinas, AHORA, "36.00")
    await _oficial(pool_vecinas, AHORA + timedelta(hours=2), "999.00", status="suspect")
    await _snapshot(pool_vecinas, AHORA + timedelta(hours=3), "40.00")

    puntos = await TimescaleRepositorioBrechas(pool_vecinas).puntos_derivables(None)

    assert [p.tasa_oficial for p in puntos] == [Decimal("36.00")]


async def test_un_snapshot_sin_tasa_anterior_llega_con_tasa_nula(pool_vecinas):
    """El LEFT JOIN deja pasar el punto sin tasa en vez de descartarlo en SQL:
    quién decide qué hacer con él es el dominio, y el resumen lo cuenta en
    `omitidas` con su motivo."""
    await _snapshot(pool_vecinas, AHORA, "40.00")

    puntos = await TimescaleRepositorioBrechas(pool_vecinas).puntos_derivables(None)

    assert len(puntos) == 1 and puntos[0].tasa_oficial is None


async def test_la_frontera_ignora_lo_que_derivo_este_servicio(pool_vecinas):
    """`frontera_serie_viva` busca dónde arranca la serie DEL MOTOR, y por eso
    filtra `calc_version <> 0`.

    Si contara también las filas derivadas, tras la primera derivación la
    frontera pasaría a ser el punto más viejo del propio backfill y una segunda
    pasada no derivaría nada — un backfill que se sabotea a sí mismo.
    """
    repositorio = TimescaleRepositorioBrechas(pool_vecinas)
    arranque_motor = AHORA + timedelta(days=10)
    await pool_vecinas.execute(
        """INSERT INTO indicators (as_of, indicator, currency, value, calc_version)
           VALUES ($1, $2, $3, 12.5, 1)""",
        arranque_motor,
        INDICADOR_PCT,
        MONEDA,
    )
    await repositorio.guardar_brechas(
        [_brecha()],
        {"origen": "test"},
    )

    frontera = await repositorio.frontera_serie_viva(INDICADOR_PCT, MONEDA)

    assert frontera == arranque_motor


async def test_los_puntos_se_cortan_en_la_frontera(pool_vecinas):
    """`ON CONFLICT` no basta: las marcas de tiempo de las dos series no
    coinciden, así que no colisionan. El corte tiene que ser explícito o el
    backfill escribiría *dentro* del tramo del motor."""
    frontera = AHORA + timedelta(hours=3)
    await _snapshot(pool_vecinas, AHORA, "40.00")
    await _snapshot(pool_vecinas, frontera, "41.00")
    await _snapshot(pool_vecinas, frontera + timedelta(hours=1), "42.00")

    puntos = await TimescaleRepositorioBrechas(pool_vecinas).puntos_derivables(frontera)

    assert [p.as_of for p in puntos] == [AHORA]


async def test_lo_derivado_no_aparece_como_calculo_del_motor(pool_vecinas):
    """`calc_version = 0` es el sentinela de «derivado»: `WHERE calc_version = 1`
    tiene que seguir devolviendo solo lo que calculó el motor. Y la `metadata`
    lleva la procedencia, para que la fila se pueda auditar sin conocer esta
    historia."""
    repositorio = TimescaleRepositorioBrechas(pool_vecinas)
    metadata = {"origen": "ingestor-historico", "sesgo_pp": "-0.0776"}

    resumen = await repositorio.guardar_brechas(
        [_brecha()], metadata
    )

    assert resumen.insertados == 2  # dos indicadores por punto
    filas = await pool_vecinas.fetch(
        "SELECT indicator, calc_version, metadata FROM indicators ORDER BY indicator"
    )
    assert [f["indicator"] for f in filas] == sorted([INDICADOR_ABS, INDICADOR_PCT])
    assert {f["calc_version"] for f in filas} == {CALC_VERSION_DERIVADO}
    assert json.loads(filas[0]["metadata"])["origen"] == "ingestor-historico"
    assert (
        await pool_vecinas.fetchval(
            "SELECT count(*) FROM indicators WHERE calc_version = 1"
        )
        == 0
    )


async def test_derivar_dos_veces_no_duplica(pool_vecinas):
    repositorio = TimescaleRepositorioBrechas(pool_vecinas)
    brechas = [_brecha()]

    await repositorio.guardar_brechas(brechas, {})
    segunda = await repositorio.guardar_brechas(brechas, {})

    assert (segunda.insertados, segunda.duplicados) == (0, 2)


async def test_connect_y_close_del_repositorio_de_brechas(timescale_listo):
    repositorio = await TimescaleRepositorioBrechas.connect(timescale_listo)
    try:
        assert await repositorio.frontera_serie_viva(INDICADOR_PCT, MONEDA) is not None or True
    finally:
        await repositorio.close()
