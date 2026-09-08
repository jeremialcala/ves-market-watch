"""La brecha contra su propia historia (RF-7, ADR-0021).

Lo que se fija aquí es el mecanismo que impide la mentira que motivó el trabajo:
la tarjeta mostraba «Promedio 30 días» calculado sobre 12 días de serie. El
número era real y la etiqueta no.

`dias_cubiertos` es la respuesta, y estos tests son los que garantizan que no se
pierda en un refactor: una ventana incompleta se publica igual —con su cobertura
a la vista— pero NO se usa como referencia de la prosa, y su carácter parcial se
afirma antes que nada.
"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest
import yaml

from indicator_engine.domain.comparativas import (
    POS_EN_LINEA,
    POS_POR_DEBAJO,
    POS_POR_ENCIMA,
    REF_MAXIMO,
    REF_MINIMO,
    Agregado,
    ConfigComparativasInvalida,
    cargar_config_comparativas,
    clasificar_posicion,
    es_extremo,
    ventana_mas_ancha_completa,
)
from indicator_engine.domain.lectura import (
    CLAIM_BRECHA_EXTREMO,
    CLAIM_BRECHA_VS_HISTORIA,
    CLAIM_HISTORIA_PARCIAL,
    HistoriaLado,
    afirmaciones_de_historia,
    construir_historia,
)

CONFIG_PATH = Path(__file__).parents[2] / "config" / "lectura.v1.yaml"


@pytest.fixture(scope="module")
def config():
    return cargar_config_comparativas(
        yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))["comparativas"]
    )


def ag(dias: int, media="15.00", maximo="20.00", minimo="10.00", cubiertos=None):
    return Agregado(
        ventana_dias=dias,
        media=Decimal(media) if media is not None else None,
        maximo=Decimal(maximo) if maximo is not None else None,
        minimo=Decimal(minimo) if minimo is not None else None,
        muestras=1000,
        dias_cubiertos=dias if cubiertos is None else cubiertos,
    )


# -- config ------------------------------------------------------------------


def test_la_config_del_repo_declara_las_tres_ventanas(config):
    assert config.ventanas_dias == (7, 30, 90)
    assert config.cobertura_minima == Decimal("0.9")
    # Mismo umbral que el eje de brecha: si medio punto no basta para llamar
    # «movimiento» a un cambio de 6 h, tampoco para llamar «desvío» a una
    # diferencia contra la media.
    assert config.umbral_desvio == Decimal("0.5")


BASE = {
    "ventanas_dias": [7, 30, 90],
    "cobertura_minima": "0.9",
    "umbral_desvio": "0.5",
}


@pytest.mark.parametrize(
    ("mutacion", "motivo"),
    [
        ({"ventanas_dias": []}, "sin ventanas"),
        ({"ventanas_dias": "7,30"}, "no es lista"),
        ({"ventanas_dias": [0, 30]}, "ventana de cero días"),
        ({"ventanas_dias": [7, 7, 30]}, "repetidas"),
        ({"ventanas_dias": [90, 7]}, "desordenadas"),
        ({"ventanas_dias": ["siete"]}, "no numéricas"),
        ({"cobertura_minima": "0"}, "cobertura nula: todo valdría"),
        ({"cobertura_minima": "1.5"}, "cobertura > 1"),
        ({"umbral_desvio": "0"}, "umbral simétrico en cero"),
        ({"umbral_desvio": "-1"}, "umbral negativo"),
    ],
)
def test_una_config_torcida_aborta_el_arranque(mutacion, motivo):
    with pytest.raises(ConfigComparativasInvalida):
        cargar_config_comparativas({**BASE, **mutacion})


# -- cobertura: el corazón del asunto ----------------------------------------


def test_una_ventana_que_alcanza_su_cobertura_esta_completa(config):
    assert ag(30, cubiertos=30).completa(config)
    assert ag(30, cubiertos=27).completa(config)  # 0,9 exacto


def test_una_ventana_de_30_con_12_dias_de_serie_NO_esta_completa(config):
    """El caso real que motivó todo esto."""
    assert not ag(30, cubiertos=12).completa(config)


def test_la_referencia_es_la_ventana_completa_MAS_ANCHA(config):
    """Comparar contra 90 días dice más que contra 7."""
    agregados = [ag(7, cubiertos=7), ag(30, cubiertos=30), ag(90, cubiertos=90)]
    assert ventana_mas_ancha_completa(agregados, config).ventana_dias == 90


def test_una_ventana_ancha_pero_INCOMPLETA_no_se_usa_de_referencia(config):
    """Es el caso del lado compra: 90 días configurados, 12 de serie."""
    agregados = [ag(7, cubiertos=7), ag(30, cubiertos=12), ag(90, cubiertos=12)]
    assert ventana_mas_ancha_completa(agregados, config).ventana_dias == 7


def test_sin_ninguna_ventana_completa_no_hay_referencia(config):
    agregados = [ag(7, cubiertos=2), ag(30, cubiertos=2)]
    assert ventana_mas_ancha_completa(agregados, config) is None


def test_una_ventana_sin_media_no_sirve_de_referencia(config):
    assert ventana_mas_ancha_completa([ag(90, media=None)], config) is None


# -- posición ----------------------------------------------------------------


@pytest.mark.parametrize(
    ("hoy", "esperado"),
    [
        ("16.00", POS_POR_ENCIMA),
        ("15.51", POS_POR_ENCIMA),
        ("15.50", POS_EN_LINEA),  # el umbral no se cruza a sí mismo
        ("15.00", POS_EN_LINEA),
        ("14.50", POS_EN_LINEA),
        ("14.49", POS_POR_DEBAJO),
        ("10.00", POS_POR_DEBAJO),
    ],
)
def test_la_posicion_parte_en_tres_tramos_simetricos(hoy, esperado, config):
    assert clasificar_posicion(Decimal(hoy), Decimal("15.00"), config) == esperado


def test_sin_valor_o_sin_referencia_no_hay_posicion(config):
    """«En línea» sería una afirmación que nadie midió."""
    assert clasificar_posicion(None, Decimal("15"), config) is None
    assert clasificar_posicion(Decimal("15"), None, config) is None


def test_igualar_el_extremo_ES_serlo():
    """El valor de hoy ya está DENTRO de la serie agregada: si iguala el máximo,
    es porque él mismo lo puso."""
    assert es_extremo(Decimal("20.00"), ag(90)) == REF_MAXIMO
    assert es_extremo(Decimal("10.00"), ag(90)) == REF_MINIMO
    assert es_extremo(Decimal("15.00"), ag(90)) is None


def test_sin_agregado_no_se_afirma_extremo():
    assert es_extremo(Decimal("20"), None) is None


# -- afirmaciones ------------------------------------------------------------


def historia(lado="buy", actual="16.00", agregados=None):
    return HistoriaLado(
        lado=lado,
        actual=Decimal(actual) if actual is not None else None,
        agregados=tuple(agregados or [ag(7), ag(30), ag(90)]),
    )


def test_emite_UNA_comparativa_por_lado_contra_la_ventana_mas_ancha(config):
    """Tres ventanas × dos lados serían seis frases en la tarjeta y ninguna se
    leería. Los números de las otras viajan igual en `historia`."""
    afirmaciones = afirmaciones_de_historia(historia(), config)
    comparativas = [a for a in afirmaciones if a.codigo == CLAIM_BRECHA_VS_HISTORIA]

    assert len(comparativas) == 1
    assert comparativas[0].datos["dias"] == "90"
    assert comparativas[0].datos["lado"] == "buy"
    assert comparativas[0].datos["posicion"] == POS_POR_ENCIMA
    assert comparativas[0].datos["delta_pp"] == "1.00"


def test_sin_ventana_completa_lo_UNICO_que_se_afirma_es_que_es_parcial(config):
    """La afirmación que impide que el resto se lea como si fuera de 90 días.
    No se emite comparativa: citar una media de 12 días como referencia de 90
    sería exactamente el fallo que esto viene a corregir."""
    parcial = [ag(7, cubiertos=2), ag(30, cubiertos=2), ag(90, cubiertos=2)]
    afirmaciones = afirmaciones_de_historia(historia(agregados=parcial), config)

    assert [a.codigo for a in afirmaciones] == [CLAIM_HISTORIA_PARCIAL]
    assert afirmaciones[0].datos == {"lado": "buy", "ventana": "90", "dias": "2"}


def test_ser_el_extremo_se_dice_ademas_de_la_comparativa(config):
    afirmaciones = afirmaciones_de_historia(historia(actual="20.00"), config)
    codigos = [a.codigo for a in afirmaciones]
    assert codigos == [CLAIM_BRECHA_VS_HISTORIA, CLAIM_BRECHA_EXTREMO]
    extremo = afirmaciones[-1]
    assert extremo.datos == {"lado": "buy", "tipo": REF_MAXIMO, "dias": "90"}


def test_en_linea_con_la_media_tambien_se_afirma(config):
    """«Está donde suele» es información, no ausencia de ella."""
    afirmaciones = afirmaciones_de_historia(historia(actual="15.00"), config)
    assert afirmaciones[0].datos["posicion"] == POS_EN_LINEA


def test_sin_valor_actual_no_se_compara_nada(config):
    afirmaciones = afirmaciones_de_historia(historia(actual=None), config)
    assert [a.codigo for a in afirmaciones] == []


# -- ensamblado --------------------------------------------------------------


def test_la_historia_publica_TODAS_las_ventanas_incompletas_incluidas(config):
    """Filtrar aquí las incompletas escondería justo el dato que hace honesta la
    etiqueta del cliente."""
    agregados = {7: ag(7), 30: ag(30, cubiertos=12), 90: ag(90, cubiertos=12)}
    h = construir_historia("buy", Decimal("16"), agregados, config)

    assert [a.ventana_dias for a in h.agregados] == [7, 30, 90]
    assert [a.dias_cubiertos for a in h.agregados] == [7, 12, 12]


def test_las_ventanas_salen_en_el_orden_de_la_config(config):
    agregados = {90: ag(90), 7: ag(7), 30: ag(30)}
    h = construir_historia("sell", Decimal("16"), agregados, config)
    assert [a.ventana_dias for a in h.agregados] == list(config.ventanas_dias)


def test_sin_agregados_no_hay_historia(config):
    assert construir_historia("buy", Decimal("16"), {}, config) is None
    assert construir_historia("buy", Decimal("16"), None, config) is None


def test_una_ventana_que_la_base_no_devolvio_simplemente_no_aparece(config):
    """Sin filas en 90 días el motor no fabrica un agregado vacío."""
    h = construir_historia("buy", Decimal("16"), {7: ag(7)}, config)
    assert [a.ventana_dias for a in h.agregados] == [7]
