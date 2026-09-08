"""Dominio del análisis de la revisión (RF-6, ADR-0019).

Lo que se fija aquí es la frontera entre lo que se calcula y lo que se inventa:
qué banda sale de una distribución real, cuándo se degrada al respaldo del
ruleset y por qué ahí NO hay banda, y qué se publica cuando no hay nada
dibujable.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest
import yaml

from indicator_engine.domain.analisis import (
    BANDA_ALTA,
    BANDA_BAJA,
    BANDA_MUY_ALTA,
    BANDA_MUY_BAJA,
    BANDA_SIN_ESCALA,
    FUENTE_PERCENTILES,
    FUENTE_RULESET,
    ConfigAnalisis,
    ConfigAnalisisInvalida,
    Distribucion,
    analizar_indicador,
    cargar_config_analisis,
    clasificar_banda,
    construir_analisis,
    elegir_escala,
    posicion_en_escala,
    reglas_que_alimenta,
    resumir,
)
from indicator_engine.domain.calculos import UMBRAL_CONFIANZA_OUTLIERS_PCT
from indicator_engine.domain.reglas import cargar_ruleset, evaluar_proximidad

CONFIG_PATH = Path(__file__).parents[2] / "config" / "analisis.v1.yaml"
RULESET_PATH = Path(__file__).parents[2] / "config" / "senales.v1.yaml"
AHORA = datetime(2026, 7, 31, 20, 54, tzinfo=UTC)


@pytest.fixture(scope="module")
def config() -> ConfigAnalisis:
    return cargar_config_analisis(
        yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))
    )


@pytest.fixture(scope="module")
def ruleset():
    return cargar_ruleset(yaml.safe_load(RULESET_PATH.read_text(encoding="utf-8")))


def dist(
    muestras: int = 4000,
    minimo: str = "0",
    maximo: str = "10",
    cortes: tuple[str, ...] = ("2", "5", "8"),
) -> Distribucion:
    return Distribucion(
        muestras=muestras,
        minimo=Decimal(minimo),
        maximo=Decimal(maximo),
        cortes=tuple(Decimal(c) for c in cortes),
        calculada_en=AHORA,
    )


# -- config ------------------------------------------------------------------


def test_la_config_del_repo_carga_y_declara_los_seis_medidores(config):
    assert config.version == 1
    assert config.ventana_dias == 90
    assert len(config.indicadores) == 6
    assert config.fracciones == (Decimal("0.1"), Decimal("0.5"), Decimal("0.9"))


def test_el_umbral_de_confianza_del_yaml_coincide_con_la_constante(config):
    """Canario: el 30 % del YAML y el de `calculos.py` son el MISMO umbral.

    Si alguien cambia uno y no el otro, el respaldo dibujaría un corte que no
    corresponde a ninguna regla real del sistema.
    """
    outliers = config.indicador("p2p_outliers_pct_buy")
    umbral = outliers.umbrales_sistema[0]
    assert umbral.clave == "confianza_baja"
    assert umbral.valor == UMBRAL_CONFIANZA_OUTLIERS_PCT
    assert umbral.origen.endswith("UMBRAL_CONFIANZA_OUTLIERS_PCT")


@pytest.mark.parametrize(
    "mutacion, esperado",
    [
        ({"version": 0}, "version"),
        ({"ventana_dias": 0}, "ventana_dias"),
        ({"muestras_minimas": 0}, "muestras_minimas"),
        ({"percentiles": [10, 50]}, "exactamente 3"),
        ({"anclas": ["0.10", "0.50"]}, "paralelos"),
        ({"percentiles": [50, 10, 90]}, "creciente"),
        ({"anclas": ["0.10", "0.50", "1.5"]}, r"cada ancla debe estar"),
        ({"indicadores": []}, "lista no vacía"),
    ],
)
def test_una_config_invalida_aborta_en_vez_de_producir_escalas_raras(
    mutacion, esperado
):
    data = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))
    data.update(mutacion)
    with pytest.raises(ConfigAnalisisInvalida, match=esperado):
        cargar_config_analisis(data)


def test_un_dominio_de_respaldo_invertido_aborta():
    data = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))
    data["indicadores"][0]["dominio_respaldo"] = {"minimo": "5", "maximo": "1"}
    with pytest.raises(ConfigAnalisisInvalida, match="minimo >= maximo"):
        cargar_config_analisis(data)


def test_un_umbral_de_sistema_sin_origen_aborta():
    """El `origen` apunta a la constante real: sin él, el umbral se desincroniza
    en silencio y nadie sabe de dónde salió el número."""
    data = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))
    data["indicadores"][5]["umbrales_sistema"][0].pop("origen")
    with pytest.raises(ConfigAnalisisInvalida, match="origen"):
        cargar_config_analisis(data)


# -- bandas ------------------------------------------------------------------


@pytest.mark.parametrize(
    "valor, banda",
    [
        ("1.99", BANDA_MUY_BAJA),  # < p10
        ("2", BANDA_BAJA),  # EXACTAMENTE p10 cuenta hacia arriba
        ("4.99", BANDA_BAJA),
        ("5", BANDA_ALTA),  # exactamente p50
        ("7.99", BANDA_ALTA),
        ("8", BANDA_MUY_ALTA),  # exactamente p90
        ("100", BANDA_MUY_ALTA),
    ],
)
def test_las_cuatro_bandas_cubren_el_rango_sin_huecos(valor, banda, config):
    escala = elegir_escala(config.indicadores[0], dist(), None, config)
    assert escala.fuente == FUENTE_PERCENTILES
    assert clasificar_banda(Decimal(valor), escala) == banda


def test_en_el_respaldo_no_hay_banda_sino_unscaled(config, ruleset):
    """Con solo umbrales no existe una noción empírica de alto/bajo: lo único
    real es cruzado / no cruzado, y eso viaja en `rules[].met`."""
    escala = elegir_escala(
        config.indicador("p2p_ratio_oferta_demanda"),
        dist(muestras=137),
        ruleset,
        config,
    )
    assert escala.fuente == FUENTE_RULESET
    assert clasificar_banda(Decimal("0.59"), escala) == BANDA_SIN_ESCALA


# -- elección de escala ------------------------------------------------------


def test_muestras_insuficientes_degradan_al_respaldo(config, ruleset):
    escala = elegir_escala(
        config.indicador("p2p_ratio_oferta_demanda"), dist(muestras=199), ruleset, config
    )
    assert escala.fuente == FUENTE_RULESET
    # Las muestras REALES viajan igual: la UI cuenta 199/200 en el pie.
    assert (escala.muestras, escala.muestras_minimas) == (199, 200)


def test_sin_distribucion_alguna_tambien_degrada(config, ruleset):
    escala = elegir_escala(
        config.indicador("p2p_ratio_oferta_demanda"), None, ruleset, config
    )
    assert escala.fuente == FUENTE_RULESET
    assert escala.muestras == 0
    assert escala.calculada_en is None


def test_una_serie_constante_no_sostiene_una_escala(config, ruleset):
    """min == max: todo caería en la banda alta. Eso sería inventar la lectura."""
    escala = elegir_escala(
        config.indicador("p2p_ratio_oferta_demanda"),
        dist(minimo="3", maximo="3", cortes=("3", "3", "3")),
        ruleset,
        config,
    )
    assert escala.fuente == FUENTE_RULESET


def test_una_distribucion_concentrada_en_un_valor_no_sostiene_bandas(config, ruleset):
    """Caso REAL que lo destapó: `p2p_outliers_pct_buy` con 14 000 muestras casi
    todas en cero ⇒ p10 = p50 = p90 = 0. Con cortes coincidentes, un snapshot
    impecable (0 % de outliers) salía `very_high` porque la igualdad cuenta hacia
    arriba. Sin dispersión en los cortes no hay banda que sostener."""
    escala = elegir_escala(
        config.indicador("p2p_outliers_pct_buy"),
        dist(minimo="0", maximo="41.3", cortes=("0", "0", "0")),
        ruleset,
        config,
    )
    assert escala.fuente == FUENTE_RULESET
    assert clasificar_banda(Decimal("0"), escala) == BANDA_SIN_ESCALA
    # …y el respaldo sí deja una referencia útil: el umbral real del 30 %.
    assert [c.clave for c in escala.cortes] == ["confianza_baja"]


def test_dos_cortes_iguales_bastan_para_degradar(config, ruleset):
    """p10 == p50 dejaría la banda `low` vacía y mandaría la moda a `high`."""
    escala = elegir_escala(
        config.indicador("p2p_ratio_oferta_demanda"),
        dist(cortes=("2", "2", "8")),
        ruleset,
        config,
    )
    assert escala.fuente == FUENTE_RULESET


def test_cortes_no_monotonos_degradan(config, ruleset):
    escala = elegir_escala(
        config.indicador("p2p_ratio_oferta_demanda"),
        dist(cortes=("5", "2", "8")),
        ruleset,
        config,
    )
    assert escala.fuente == FUENTE_RULESET


def test_el_respaldo_dibuja_los_umbrales_reales_del_ruleset(config, ruleset):
    escala = elegir_escala(
        config.indicador("p2p_ratio_oferta_demanda"), None, ruleset, config
    )
    # Las tres reglas del ruleset consumen el ratio, ordenadas por valor.
    assert [c.clave for c in escala.cortes] == [
        "techo_inminente@v1",
        "arranque_alcista@v1",
        "correccion_inminente@v1",
    ]
    assert [c.valor for c in escala.cortes] == [
        Decimal("0.2"),
        Decimal("0.3"),
        Decimal("2"),
    ]
    # Dominio de respaldo declarado en la config, no un dato de mercado.
    assert (escala.dominio_min, escala.dominio_max) == (Decimal("0"), Decimal("3"))


def test_el_respaldo_dibuja_tambien_el_umbral_de_sistema(config, ruleset):
    escala = elegir_escala(
        config.indicador("p2p_outliers_pct_buy"), None, ruleset, config
    )
    assert [c.clave for c in escala.cortes] == ["confianza_baja"]


# -- posición ----------------------------------------------------------------


def test_la_posicion_interpola_entre_los_cortes_publicados(config):
    escala = elegir_escala(config.indicadores[0], dist(), None, config)
    # Justo en un corte: la posición es su ancla exacta.
    assert posicion_en_escala(Decimal("2"), escala) == Decimal("0.1000")
    assert posicion_en_escala(Decimal("5"), escala) == Decimal("0.5000")
    assert posicion_en_escala(Decimal("8"), escala) == Decimal("0.9000")
    # A mitad del tramo [p10, p50]: a mitad entre 0,10 y 0,50.
    assert posicion_en_escala(Decimal("3.5"), escala) == Decimal("0.3000")


def test_la_posicion_se_acota_a_cero_uno(config):
    escala = elegir_escala(config.indicadores[0], dist(), None, config)
    assert posicion_en_escala(Decimal("-999"), escala) == Decimal("0.0000")
    assert posicion_en_escala(Decimal("999"), escala) == Decimal("1.0000")


def test_nudos_con_la_misma_x_se_colapsan_sin_dividir_por_cero(config):
    """Pasa cuando > 10 % de la ventana vale exactamente el mínimo: p10 == min.
    Al colapsar se conserva la posición MÁS ALTA, coherente con la regla de
    bandas (la igualdad cuenta hacia arriba)."""
    escala = elegir_escala(
        config.indicadores[0], dist(minimo="2", cortes=("2", "5", "8")), None, config
    )
    assert posicion_en_escala(Decimal("2"), escala) == Decimal("0.1000")
    assert posicion_en_escala(Decimal("3.5"), escala) == Decimal("0.3000")


def test_sin_cortes_no_hay_posicion_que_dibujar(config, ruleset):
    """La brecha no alimenta ninguna regla: en respaldo se queda sin cortes y
    la respuesta honesta son cero píxeles, no una barra a ojo."""
    escala = elegir_escala(config.indicador("p2p_brecha_pct_buy"), None, ruleset, config)
    assert escala.cortes == ()
    assert posicion_en_escala(Decimal("13.22"), escala) is None


# -- reglas que alimenta -----------------------------------------------------


def test_el_mapeo_indicador_reglas_se_deriva_del_ruleset(ruleset):
    """No se declara en la config: así no puede desincronizarse."""
    assert len(reglas_que_alimenta("p2p_ratio_oferta_demanda", ruleset)) == 3
    assert reglas_que_alimenta("p2p_brecha_pct_buy", ruleset) == []
    assert reglas_que_alimenta("lo_que_sea", None) == []


def test_un_indicador_sin_reglas_no_publica_ninguna(config, ruleset):
    lectura = analizar_indicador(
        config.indicador("p2p_brecha_pct_buy"),
        Decimal("13.22"),
        AHORA,
        dist(minimo="8", maximo="31", cortes=("10", "16", "24")),
        ruleset,
        config,
    )
    assert lectura.reglas == ()
    assert lectura.banda == BANDA_BAJA
    assert lectura.posicion is not None


def test_la_distancia_es_negativa_cuando_la_condicion_ya_se_cumple(config, ruleset):
    """`spread < 0.5` con spread 0,40: ya está del lado que el sistema vigila."""
    lectura = analizar_indicador(
        config.indicador("p2p_spread_pct"),
        Decimal("0.40"),
        AHORA,
        dist(minimo="-1", maximo="5", cortes=("0.5", "0.9", "2")),
        ruleset,
        config,
    )
    regla = lectura.reglas[0]
    assert regla.regla == "techo_inminente@v1"
    assert regla.cumple is True
    assert regla.distancia == Decimal("-0.10")


def test_cada_condicion_del_mismo_indicador_produce_su_propia_marca(config, ruleset):
    """El ratio alimenta TRES condiciones: tres marcas, no una sola fija."""
    lectura = analizar_indicador(
        config.indicador("p2p_ratio_oferta_demanda"),
        Decimal("0.59"),
        AHORA,
        None,
        ruleset,
        config,
    )
    assert len(lectura.reglas) == 3
    assert all(r.posicion_umbral is not None for r in lectura.reglas)


# -- síntesis ----------------------------------------------------------------


def vista_completa() -> dict[str, Decimal]:
    return {
        "p2p_momentum_bid_3h_pct": Decimal("0.30"),
        "p2p_drenaje_oferta_6h_pct": Decimal("29.86"),
        "p2p_ratio_oferta_demanda": Decimal("0.15"),
        "p2p_spread_pct": Decimal("0.40"),
    }


def test_la_regla_mas_cercana_es_la_de_mas_condiciones_cumplidas(ruleset):
    sintesis = resumir(evaluar_proximidad(ruleset, vista_completa()))
    assert sintesis.reglas_total == 3
    assert sintesis.reglas_evaluables == 3
    # techo_inminente cumple 2 de 3 (spread < 0.5 y ratio < 0.2); las otras, menos.
    assert sintesis.regla_mas_cercana == "techo_inminente@v1"
    assert (sintesis.condiciones_cumplidas, sintesis.condiciones_totales) == (2, 3)
    assert sintesis.bloqueada_por == "p2p_momentum_bid_3h_pct"
    assert sintesis.reglas_cumplidas == ()


def test_un_indicador_ausente_deja_la_regla_no_evaluable(ruleset):
    vista = vista_completa()
    del vista["p2p_momentum_bid_3h_pct"]
    proximidad = evaluar_proximidad(ruleset, vista)
    # Las tres reglas referencian el momentum ⇒ ninguna es evaluable, igual que
    # `evaluar_reglas` no dispararía ninguna.
    assert all(not p.evaluable for p in proximidad)
    sintesis = resumir(proximidad)
    assert sintesis.reglas_evaluables == 0
    assert sintesis.regla_mas_cercana is None
    assert sintesis.bloqueada_por is None


def test_con_confianza_baja_ninguna_regla_es_evaluable(ruleset):
    proximidad = evaluar_proximidad(ruleset, vista_completa(), evaluable=False)
    assert all(not p.evaluable for p in proximidad)
    assert resumir(proximidad).reglas_cumplidas == ()


def test_bloqueada_por_es_la_condicion_mas_lejana(ruleset):
    proximidad = evaluar_proximidad(ruleset, vista_completa())
    arranque = next(p for p in proximidad if p.tipo == "arranque_alcista")
    # drenaje necesita moverse 69,86; el momentum solo 0,20 y el ratio ya cumple.
    assert arranque.bloqueada_por == "p2p_drenaje_oferta_6h_pct"


def test_una_regla_cumplida_entera_no_bloquea_ni_es_la_mas_cercana(ruleset):
    vista = {
        "p2p_momentum_bid_3h_pct": Decimal("2.0"),
        "p2p_spread_pct": Decimal("0.1"),
        "p2p_ratio_oferta_demanda": Decimal("0.1"),
        "p2p_drenaje_oferta_6h_pct": Decimal("-50"),
    }
    sintesis = resumir(evaluar_proximidad(ruleset, vista))
    # `rules_met` NO implica emisión: el cooldown pudo suprimirla.
    assert "techo_inminente@v1" in sintesis.reglas_cumplidas
    assert sintesis.regla_mas_cercana != "techo_inminente@v1"


def test_el_desempate_de_la_regla_mas_cercana_es_determinista(ruleset):
    """A igual número de condiciones cumplidas gana la de menos condiciones
    totales, y luego el orden alfabético."""
    vista = {
        "p2p_momentum_bid_3h_pct": Decimal("-2"),
        "p2p_spread_pct": Decimal("9"),
        "p2p_ratio_oferta_demanda": Decimal("9"),
        "p2p_drenaje_oferta_6h_pct": Decimal("9"),
    }
    sintesis = resumir(evaluar_proximidad(ruleset, vista))
    # correccion_inminente cumple sus 2 → está cumplida entera; entre las que
    # quedan, arranque (0 de 3) y techo (0 de 3): alfabético.
    assert sintesis.reglas_cumplidas == ("correccion_inminente@v1",)
    assert sintesis.regla_mas_cercana == "arranque_alcista@v1"


# -- análisis completo -------------------------------------------------------


def test_un_medidor_sin_valor_vigente_no_produce_lectura(config, ruleset):
    vista = {"p2p_spread_pct": Decimal("0.56")}
    analisis = construir_analisis(
        config=config,
        ruleset=ruleset,
        vista=vista,
        as_of_por_indicador={"p2p_spread_pct": AHORA},
        distribuciones={},
        proximidad=evaluar_proximidad(ruleset, vista),
        as_of=AHORA,
        moneda="VES",
        calc_version=1,
        triggered_by="3b8d5a10-19c7-4e2f-bb64-0c9a71e5d833",
        confianza_baja=False,
        official_stale=False,
    )
    # Solo el que tiene valor: los otros cinco NO se infieren.
    assert [i.indicador for i in analisis.indicadores] == ["p2p_spread_pct"]
    assert analisis.confianza == "normal"
    assert analisis.ruleset_version == ruleset.version
    assert analisis.analysis_version == config.version


def test_la_fuente_de_escala_de_la_revision_es_la_peor_de_sus_medidores(
    config, ruleset
):
    """Basta un medidor en respaldo para que la revisión no sea de percentiles:
    la columna promovida responde «cuánto tiempo estuvimos en respaldo»."""
    vista = {"p2p_spread_pct": Decimal("0.56"), "p2p_brecha_pct_buy": Decimal("13")}
    comunes = dict(
        config=config,
        ruleset=ruleset,
        vista=vista,
        as_of_por_indicador={n: AHORA for n in vista},
        proximidad=evaluar_proximidad(ruleset, vista),
        as_of=AHORA,
        moneda="VES",
        calc_version=1,
        triggered_by="3b8d5a10-19c7-4e2f-bb64-0c9a71e5d833",
        confianza_baja=False,
        official_stale=False,
    )
    todas = {n: dist() for n in vista}
    assert construir_analisis(distribuciones=todas, **comunes).fuente_escala == (
        FUENTE_PERCENTILES
    )
    parcial = {"p2p_spread_pct": dist()}
    assert construir_analisis(distribuciones=parcial, **comunes).fuente_escala == (
        FUENTE_RULESET
    )
