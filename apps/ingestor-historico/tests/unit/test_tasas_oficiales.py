"""Carga histórica de tasas oficiales del BCV (ADR-0013).

Lo que se fija aquí son las tres decisiones que, mal tomadas, corrompen la serie
en silencio: de qué columna sale el valor, cuál de las dos escalas monetarias se
usa, y qué se hace con las jornadas cuyo XLS no traía hora. Ninguna de las tres
da error si se equivoca — dan números plausibles y falsos, que es peor.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

import pytest

from ingestor_historico.adapters.memory import InMemoryRepositorioTasasOficiales
from ingestor_historico.application.cargar_tasas_oficiales import CargarTasasOficiales
from ingestor_historico.config import parse_tz
from ingestor_historico.domain.tasas_oficiales import (
    FUENTE,
    FUENTE_SIN_HORA,
    FilaOficialInvalida,
    FormatoOficialNoSoportado,
    parsear_fila,
    verificar_columnas,
)

# La misma zona que el CLI usa por defecto (`TZ_ORIGEN`), no una construida a
# mano: si esa constante cambiara, estos tests tienen que enterarse.
VET = parse_tz("-04:00")

CABECERAS = [
    "fecha_operacion", "fecha_valor", "publicado_en", "moneda", "pais",
    "es_iso4217", "usd_bid", "usd_ask", "bs_bid", "bs_ask", "bs_bid_bsd",
    "bs_ask_bsd", "escala_monetaria", "escala_aplicada", "cotizacion_invertida",
    "archivo_fuente",
]

# Fila real del export, de la última jornada: es la que permitió verificar que
# la serie viva guarda el ASK.
FILA_HOY = {
    "fecha_operacion": "2026-07-31",
    "fecha_valor": "2026-08-03",
    "publicado_en": "2026-07-31 16:36:00",
    "moneda": "USD",
    "pais": "E.U.A.",
    "es_iso4217": "1",
    "usd_bid": "1.00000000",
    "usd_ask": "1.00000000",
    "bs_bid": "746.91443400",
    "bs_ask": "748.78640000",
    "bs_bid_bsd": "746.91443400",
    "bs_ask_bsd": "748.78640000",
    "escala_monetaria": "1",
    "escala_aplicada": "1",
    "cotizacion_invertida": "0",
    "archivo_fuente": "2_1_2c26_smc.xls",
}

# Fila real de 2020, ANTES de la redenominación: `bs_ask` y `bs_ask_bsd`
# difieren en un factor de 1.000.000.
FILA_2020 = {
    **FILA_HOY,
    "fecha_operacion": "2020-03-27",
    "fecha_valor": "2020-03-30",
    "publicado_en": "2020-03-27 15:06:00",
    "bs_bid": "77698.72684875",
    "bs_ask": "77893.46050000",
    "bs_bid_bsd": "0.07769873",
    "bs_ask_bsd": "0.07789346",
    "escala_monetaria": "1000000",
    "escala_aplicada": "1000000",
    "archivo_fuente": "2_1_2a20_smc.xls",
}


def test_el_valor_sale_del_ASK_no_del_BID():
    """Verificado contra la serie viva el 2026-08-01: el `ingestor-bcv` guarda
    748.78640000 para esta jornada, que es el ASK. Cargar el BID metería un
    escalón falso justo en la unión entre histórico y serie viva."""
    assert parsear_fila(FILA_HOY, VET).valor == Decimal("748.78640000")


def test_usa_la_escala_BSD_no_la_cruda():
    """La redenominación de 2021 dividió el bolívar entre un millón. Con la
    columna cruda, la serie daría un salto de seis órdenes de magnitud en
    octubre de 2021 que nunca ocurrió."""
    tasa = parsear_fila(FILA_2020, VET)
    assert tasa.valor == Decimal("0.07789346")
    assert tasa.valor != Decimal("77893.46050000")


def test_la_fecha_valor_es_la_de_vigencia_no_la_de_operacion():
    """`value_date` es cuándo RIGE la tasa; el BCV publica el día anterior."""
    tasa = parsear_fila(FILA_HOY, VET)
    assert tasa.fecha_valor == date(2026, 8, 3)
    assert tasa.publicado_en.date() == date(2026, 7, 31)


def test_la_hora_del_export_es_de_Venezuela_y_se_guarda_en_UTC():
    """16:36 VET = 20:36 UTC. Interpretarla como UTC adelantaría toda la serie
    cuatro horas y la descolocaría respecto de las capturas vivas."""
    publicado = parsear_fila(FILA_HOY, VET).publicado_en
    assert publicado.utcoffset().total_seconds() == -4 * 3600
    assert publicado.astimezone(timezone.utc) == datetime(
        2026, 7, 31, 20, 36, tzinfo=timezone.utc
    )


def test_una_hora_con_offset_propio_se_respeta():
    fila = {**FILA_HOY, "publicado_en": "2026-07-31T16:36:00+02:00"}
    assert parsear_fila(fila, VET).publicado_en.utcoffset().total_seconds() == 7200


# -- jornadas sin hora de publicación ---------------------------------------


def test_sin_hora_se_usa_la_fecha_real_a_las_cero_horas():
    """Dos jornadas del export (2020-04-14 y 2026-06-25) no traen hora en el
    XLS de origen. Descartarlas dejaría un hueco en una serie diaria por lo
    demás completa, y un hueco se lee como «el BCV no publicó»."""
    tasa = parsear_fila({**FILA_HOY, "publicado_en": ""}, VET)
    assert tasa.publicado_en == datetime(2026, 7, 31, 0, 0, tzinfo=VET)
    assert tasa.fecha_valor == date(2026, 8, 3)


def test_sin_hora_la_fila_queda_MARCADA_en_el_dato():
    """No basta con decirlo en el resumen de la carga: quien consulte la tabla
    dentro de un año tiene que poder aislar las filas cuya hora es inventada."""
    con_hora = parsear_fila(FILA_HOY, VET)
    sin_hora = parsear_fila({**FILA_HOY, "publicado_en": ""}, VET)

    assert con_hora.fuente == FUENTE and con_hora.hora_conocida
    assert sin_hora.fuente == FUENTE_SIN_HORA and not sin_hora.hora_conocida
    assert con_hora.fuente != sin_hora.fuente


def test_sin_hora_NI_fecha_de_operacion_se_descarta():
    with pytest.raises(FilaOficialInvalida):
        parsear_fila({**FILA_HOY, "publicado_en": "", "fecha_operacion": ""}, VET)


# -- filas que la tabla rechazaría ------------------------------------------


@pytest.mark.parametrize(
    ("mutacion", "motivo"),
    [
        ({"bs_ask_bsd": ""}, "valor ausente"),
        ({"bs_ask_bsd": "no-es-un-numero"}, "valor no numérico"),
        # El CHECK (rate > 0) de la tabla los rechazaría: mejor descartarlos con
        # motivo que reventar el lote entero.
        ({"bs_ask_bsd": "0"}, "cero"),
        ({"bs_ask_bsd": "-1.5"}, "negativo"),
        ({"bs_ask_bsd": "0.000000001"}, "se cuantiza a cero con 8 decimales"),
        ({"bs_ask_bsd": "1e13"}, "no cabe en numeric(20,8)"),
        ({"fecha_valor": ""}, "sin fecha de vigencia"),
        ({"fecha_valor": "31/07/2026"}, "fecha en otro formato"),
        ({"moneda": ""}, "sin moneda"),
        ({"moneda": "DOLARES"}, "moneda sin forma de código"),
    ],
)
def test_las_filas_irrecuperables_se_descartan_con_motivo(mutacion, motivo):
    with pytest.raises(FilaOficialInvalida):
        parsear_fila({**FILA_HOY, **mutacion}, VET)


def test_el_valor_mas_pequeno_del_export_real_SI_se_carga():
    """COP en 2020 vale 0,00001928 BsD. Es diminuto pero real y positivo: una
    guarda demasiado estricta lo tiraría junto con la basura."""
    fila = {**FILA_2020, "moneda": "COP", "bs_ask_bsd": "0.00001928"}
    assert parsear_fila(fila, VET).valor == Decimal("0.00001928")


def test_un_codigo_no_ISO_pero_con_forma_de_codigo_se_acepta():
    """El export trae `MXP`, en desuso desde 1993. Reescribirlo a `MXN` sería
    corregir al BCV por nuestra cuenta."""
    assert parsear_fila({**FILA_HOY, "moneda": "MXP"}, VET).moneda == "MXP"


def test_un_csv_sin_las_columnas_clave_aborta_antes_de_tocar_nada():
    with pytest.raises(FormatoOficialNoSoportado) as exc:
        verificar_columnas(["fecha_operacion", "moneda"])
    assert "bs_ask_bsd" in str(exc.value)


def test_el_csv_real_pasa_la_verificacion_de_columnas():
    verificar_columnas(CABECERAS)  # no lanza


# -- caso de uso -------------------------------------------------------------


async def _cargar(filas, monedas=None):
    repositorio = InMemoryRepositorioTasasOficiales()
    resumen = await CargarTasasOficiales(repositorio).ejecutar(
        CABECERAS, filas, "bcv_fx_historico.csv", VET, monedas
    )
    return resumen, repositorio


async def test_carga_nominal_resume_lo_cargado():
    resumen, repo = await _cargar([FILA_2020, FILA_HOY])
    assert (resumen.insertadas, resumen.duplicadas) == (2, 0)
    assert resumen.monedas == ("USD",)
    assert (resumen.desde, resumen.hasta) == (date(2020, 3, 30), date(2026, 8, 3))
    assert resumen.sin_hora == 0
    assert len(repo.tasas) == 2


async def test_recargar_el_mismo_archivo_no_duplica():
    """Idempotencia: la PK real es (captured_at, currency)."""
    repositorio = InMemoryRepositorioTasasOficiales()
    caso = CargarTasasOficiales(repositorio)
    for _ in range(2):
        resumen = await caso.ejecutar(
            CABECERAS, [FILA_HOY], "bcv_fx_historico.csv", VET, None
        )
    assert (resumen.insertadas, resumen.duplicadas) == (0, 1)
    assert len(repositorio.tasas) == 1


async def test_dos_filas_que_colisionan_en_la_PK_cuentan_una_vez():
    resumen, repo = await _cargar([FILA_HOY, dict(FILA_HOY)])
    assert (resumen.insertadas, resumen.duplicadas) == (1, 1)
    assert len(repo.tasas) == 1


async def test_una_fila_ilegible_no_aborta_la_carga():
    """31.000 filas: una rota no puede tirar las 30.999 buenas."""
    resumen, repo = await _cargar([FILA_HOY, {**FILA_2020, "bs_ask_bsd": "x"}])
    assert resumen.insertadas == 1
    assert sum(resumen.descartadas.values()) == 1
    assert len(repo.tasas) == 1


async def test_el_filtro_de_monedas_descarta_contando_el_motivo():
    resumen, _ = await _cargar(
        [FILA_HOY, {**FILA_HOY, "moneda": "ANG"}], monedas=frozenset({"USD"})
    )
    assert resumen.insertadas == 1
    assert resumen.monedas == ("USD",)
    assert any("ANG" in motivo for motivo in resumen.descartadas)


async def test_el_resumen_CUENTA_las_filas_sin_hora():
    resumen, _ = await _cargar([FILA_HOY, {**FILA_2020, "publicado_en": ""}])
    assert resumen.sin_hora == 1


async def test_un_csv_sin_filas_no_es_un_error_silencioso():
    resumen, repo = await _cargar([])
    assert (resumen.insertadas, resumen.total_filas) == (0, 0)
    assert (resumen.desde, resumen.hasta) == (None, None)
    assert repo.tasas == {}
