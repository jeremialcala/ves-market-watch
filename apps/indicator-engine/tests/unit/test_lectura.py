"""Lectura del estado de mercado (RF-7, ADR-0021).

Lo que se fija aquí no es que salga texto: es la FRONTERA. Un régimen se publica
entero o no se publica; una atribución se calla cuando el dato que la sostiene
está vencido; una banda no se comenta si la escala es de respaldo. Cada uno de
esos silencios es una decisión de diseño, y sin test se pierde en el primer
refactor que «simplifique» la cascada de condiciones.
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
    Corte,
    Escala,
    LecturaIndicador,
    ReglaAlimentada,
    Sintesis,
)
from indicator_engine.domain.lectura import (
    BRECHA_AMPLIANDO,
    BRECHA_COMPRIMIENDO,
    BRECHA_ESTABLE,
    CLAIM_ATRIBUCION,
    CLAIM_BRECHA,
    CLAIM_CONFIANZA_BAJA,
    CLAIM_MEDIDOR_EN_BANDA,
    CLAIM_OFICIAL_RANCIA,
    CLAIM_REGLA_CERCA,
    INDICADOR_BRECHA_BUY,
    INDICADOR_MOMENTUM,
    MOV_BAJANDO,
    MOV_LATERAL,
    MOV_SUBIENDO,
    RESP_AMBOS,
    RESP_OFICIAL,
    RESP_PARALELO,
    ConfigLectura,
    ConfigLecturaInvalida,
    Variaciones,
    atribuir,
    cargar_config_lectura,
    clasificar_brecha,
    clasificar_movimiento,
    componer_regimen,
    construir_lectura,
    medidores_cerca_de_umbral,
)

CONFIG_PATH = Path(__file__).parents[2] / "config" / "lectura.v1.yaml"
AHORA = datetime(2026, 7, 31, 20, 54, tzinfo=UTC)


@pytest.fixture(scope="module")
def config() -> ConfigLectura:
    return cargar_config_lectura(
        yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))
    )


def escala(fuente: str = FUENTE_PERCENTILES, dias: int = 90) -> Escala:
    return Escala(
        fuente=fuente,
        ventana_dias=dias,
        muestras=4000,
        muestras_minimas=200,
        calculada_en=AHORA,
        dominio_min=Decimal("0"),
        dominio_max=Decimal("10"),
        cortes=(Corte(clave="p10", valor=Decimal("2"), posicion=Decimal("0.1")),),
    )


def medidor(
    indicador: str,
    valor: str = "1",
    banda: str = BANDA_BAJA,
    posicion: str | None = "0.30",
    reglas: tuple[ReglaAlimentada, ...] = (),
    fuente: str = FUENTE_PERCENTILES,
) -> LecturaIndicador:
    return LecturaIndicador(
        indicador=indicador,
        valor=Decimal(valor),
        as_of=AHORA,
        banda=banda,
        posicion=Decimal(posicion) if posicion is not None else None,
        escala=escala(fuente),
        reglas=reglas,
    )


def regla(posicion_umbral: str, cumple: bool = False) -> ReglaAlimentada:
    return ReglaAlimentada(
        regla="techo_inminente@v1",
        tipo="techo_inminente",
        direccion="bajista",
        op="lt",
        umbral=Decimal("0.5"),
        cumple=cumple,
        distancia=Decimal("0.06"),
        posicion_umbral=Decimal(posicion_umbral),
    )


def sintesis(cercana: str | None = "techo_inminente@v1") -> Sintesis:
    return Sintesis(
        reglas_total=3,
        reglas_evaluables=1 if cercana else 0,
        regla_mas_cercana=cercana,
        condiciones_cumplidas=1,
        condiciones_totales=3,
        bloqueada_por="p2p_momentum_bid_3h_pct",
        reglas_cumplidas=(),
    )


def var(brecha: str | None, paralelo: str | None, oficial: str | None) -> Variaciones:
    return Variaciones(
        brecha_pp=Decimal(brecha) if brecha is not None else None,
        paralelo=Decimal(paralelo) if paralelo is not None else None,
        oficial=Decimal(oficial) if oficial is not None else None,
    )


# -- config ------------------------------------------------------------------


def test_la_config_del_repo_carga_con_los_umbrales_que_documenta(config):
    assert config.version == 1
    assert config.ventana_horas == 6
    assert config.holgura_horas == 1
    # 0,5 es el mismo umbral que `arranque_alcista` usa para el momentum: el
    # producto no puede tener dos definiciones de «sube».
    assert config.umbral_movimiento == Decimal("0.5")
    assert config.umbral_brecha == Decimal("0.5")
    assert config.dominancia_minima == Decimal("0.8")
    assert config.proximidad_umbral == Decimal("0.1")


BASE = {
    "version": 1,
    "ventana_horas": 6,
    "holgura_horas": 1,
    "umbrales": {
        "movimiento": "0.5",
        "brecha": "0.5",
        "dominancia_minima": "0.8",
        "proximidad_umbral": "0.1",
    },
}


@pytest.mark.parametrize(
    ("mutacion", "motivo"),
    [
        ({"version": 0}, "version < 1"),
        ({"ventana_horas": 0}, "ventana sin duración"),
        ({"holgura_horas": -1}, "holgura negativa"),
        ({"umbrales": {**BASE["umbrales"], "movimiento": "0"}}, "umbral simétrico en 0"),
        ({"umbrales": {**BASE["umbrales"], "brecha": "-1"}}, "umbral negativo"),
        # Por debajo de 0,5 los DOS lados superarían la dominancia a la vez y la
        # atribución dejaría de ser una partición.
        ({"umbrales": {**BASE["umbrales"], "dominancia_minima": "0.4"}}, "ambigua"),
        ({"umbrales": {**BASE["umbrales"], "dominancia_minima": "1.5"}}, "> 1"),
        ({"umbrales": {**BASE["umbrales"], "proximidad_umbral": "0"}}, "nada cerca"),
        ({"umbrales": {**BASE["umbrales"], "proximidad_umbral": "2"}}, "todo cerca"),
        ({"umbrales": "no-es-un-mapeo"}, "umbrales mal tipados"),
        ({"umbrales": {"movimiento": "0.5"}}, "umbral ausente"),
        ({"ventana_horas": "seis"}, "no numérico"),
    ],
)
def test_una_config_torcida_aborta_el_arranque(mutacion, motivo):
    """Estricto a propósito: una config plausible-y-falsa produciría regímenes
    plausibles-y-falsos, que es peor que no publicar ninguno."""
    with pytest.raises(ConfigLecturaInvalida):
        cargar_config_lectura({**BASE, **mutacion})


def test_una_config_que_no_es_mapeo_tambien_aborta():
    with pytest.raises(ConfigLecturaInvalida):
        cargar_config_lectura([1, 2, 3])  # type: ignore[arg-type]


# -- ejes --------------------------------------------------------------------


@pytest.mark.parametrize(
    ("momentum", "esperado"),
    [
        ("2.0", MOV_SUBIENDO),
        ("0.51", MOV_SUBIENDO),
        ("0.5", MOV_LATERAL),  # el umbral NO se cruza a sí mismo
        ("0", MOV_LATERAL),
        ("-0.5", MOV_LATERAL),
        ("-0.51", MOV_BAJANDO),
        ("-3.0", MOV_BAJANDO),
    ],
)
def test_el_eje_de_movimiento_parte_en_tres_tramos_simetricos(
    momentum, esperado, config
):
    assert clasificar_movimiento(Decimal(momentum), config) == esperado


@pytest.mark.parametrize(
    ("delta", "esperado"),
    [
        ("1.03", BRECHA_AMPLIANDO),
        ("0.5", BRECHA_ESTABLE),
        ("0", BRECHA_ESTABLE),
        ("-0.5", BRECHA_ESTABLE),
        ("-1.03", BRECHA_COMPRIMIENDO),
    ],
)
def test_el_eje_de_brecha_parte_en_tres_tramos_simetricos(delta, esperado, config):
    assert clasificar_brecha(Decimal(delta), config) == esperado


def test_sin_dato_el_eje_no_resuelve_en_vez_de_caer_en_el_tramo_central(config):
    """`None` no es «lateral»/«estable». Que el momentum no esté vigente no
    significa que el paralelo esté quieto — significa que no se sabe."""
    assert clasificar_movimiento(None, config) is None
    assert clasificar_brecha(None, config) is None


def test_el_regimen_es_el_par_de_ejes():
    assert componer_regimen(MOV_LATERAL, BRECHA_COMPRIMIENDO) == "lateral_comprimiendo"
    assert componer_regimen(MOV_SUBIENDO, BRECHA_AMPLIANDO) == "subiendo_ampliando"


def test_con_un_eje_sin_resolver_no_hay_medio_regimen():
    assert componer_regimen(MOV_LATERAL, None) is None
    assert componer_regimen(None, BRECHA_ESTABLE) is None
    assert componer_regimen(None, None) is None


# -- atribución --------------------------------------------------------------


def test_sin_publicacion_del_bcv_la_atribucion_al_paralelo_es_un_hecho(config):
    """El ingestor sondea cada 30 min y persiste solo al cambiar: Δoficial = 0
    exacto es evidencia positiva de que el movimiento fue del paralelo, no un
    dato que falta."""
    assert atribuir(var("-1.03", "-8.40", "0"), config) == RESP_PARALELO


def test_cuando_el_bcv_si_publico_la_atribucion_puede_cambiar_de_lado(config):
    assert atribuir(var("-1.03", "0", "9.00"), config) == RESP_OFICIAL
    # 4 y 6 sobre 10: ninguno llega a 0,8 ⇒ se movieron los dos.
    assert atribuir(var("-1.03", "-4.00", "6.00"), config) == RESP_AMBOS


def test_justo_en_la_dominancia_el_lado_se_lleva_la_atribucion(config):
    # |8| / (|8| + |2|) = 0,8 exacto: el umbral inclusivo evita el hueco.
    assert atribuir(var("-1.03", "8", "2"), config) == RESP_PARALELO


def test_si_no_se_movio_nada_no_hay_nada_que_atribuir(config):
    assert atribuir(var("0", "0", "0"), config) is None


def test_sin_una_de_las_dos_piernas_no_se_atribuye(config):
    assert atribuir(var("-1.03", None, "0"), config) is None
    assert atribuir(var("-1.03", "-8.40", None), config) is None


# -- proximidad a umbrales ---------------------------------------------------


def test_cuenta_los_medidores_a_tiro_de_piedra_de_un_umbral_sin_cruzar(config):
    indicadores = [
        medidor("a", posicion="0.30", reglas=(regla("0.35"),)),  # 0,05 ⇒ cerca
        medidor("b", posicion="0.30", reglas=(regla("0.80"),)),  # 0,50 ⇒ lejos
        medidor("c", posicion="0.30", reglas=(regla("0.40"),)),  # 0,10 ⇒ justo
    ]
    assert medidores_cerca_de_umbral(indicadores, config) == 2


def test_un_umbral_ya_cumplido_no_esta_cerca_esta_pasado(config):
    indicadores = [medidor("a", posicion="0.30", reglas=(regla("0.35", cumple=True),))]
    assert medidores_cerca_de_umbral(indicadores, config) == 0


def test_sin_posicion_dibujable_no_se_puede_medir_la_distancia(config):
    indicadores = [medidor("a", posicion=None, reglas=(regla("0.35"),))]
    assert medidores_cerca_de_umbral(indicadores, config) == 0


def test_un_medidor_con_dos_reglas_cerca_cuenta_una_vez(config):
    indicadores = [
        medidor("a", posicion="0.30", reglas=(regla("0.32"), regla("0.35"))),
    ]
    assert medidores_cerca_de_umbral(indicadores, config) == 1


# -- construcción de la lectura ---------------------------------------------


def lectura_completa(config, **kwargs):
    base = dict(
        config=config,
        indicadores=[
            medidor(INDICADOR_MOMENTUM, valor="0.30"),
            medidor(INDICADOR_BRECHA_BUY, banda=BANDA_MUY_BAJA, posicion="0.05"),
        ],
        sintesis=sintesis(),
        variaciones=var("-1.03", "-8.40", "0"),
        confianza_baja=False,
        official_stale=False,
    )
    return construir_lectura(**{**base, **kwargs})


def codigos(lectura) -> list[str]:
    return [a.codigo for a in lectura.afirmaciones]


def test_el_caso_nominal_produce_el_regimen_y_sus_cuatro_afirmaciones(config):
    lectura = lectura_completa(config)

    assert lectura.regimen == "lateral_comprimiendo"
    assert lectura.eje_movimiento == MOV_LATERAL
    assert lectura.eje_brecha == BRECHA_COMPRIMIENDO
    assert lectura.ventana_horas == 6
    assert lectura.lectura_version == 1
    assert codigos(lectura) == [
        CLAIM_BRECHA,
        CLAIM_ATRIBUCION,
        CLAIM_MEDIDOR_EN_BANDA,
        CLAIM_REGLA_CERCA,
    ]


def test_las_cifras_viajan_como_cadenas_de_punto_fijo(config):
    """El contrato exige `^-?[0-9]+(\\.[0-9]+)?$`: un `str(Decimal)` en notación
    científica rompería la validación del evento."""
    lectura = lectura_completa(config, variaciones=var("-0.0000103", "-8.40", "0"))
    brecha = next(a for a in lectura.afirmaciones if a.codigo == CLAIM_BRECHA)
    assert "E" not in brecha.datos["delta_pp"]
    assert brecha.datos["delta_pp"] == "0.0000103"


def test_la_magnitud_de_la_brecha_va_en_absoluto_porque_la_direccion_ya_va_aparte(
    config,
):
    lectura = lectura_completa(config)
    brecha = next(a for a in lectura.afirmaciones if a.codigo == CLAIM_BRECHA)
    assert brecha.datos == {
        "direccion": BRECHA_COMPRIMIENDO,
        "delta_pp": "1.03",
        "horas": "6",
    }


def test_la_confianza_baja_encabeza_y_suprime_la_proximidad_a_reglas(config):
    """Con confianza baja el motor no calculó la microestructura: hablar de a
    cuánto está un aviso sería citar cifras que no se computaron."""
    lectura = lectura_completa(config, confianza_baja=True)
    assert codigos(lectura)[0] == CLAIM_CONFIANZA_BAJA
    assert CLAIM_REGLA_CERCA not in codigos(lectura)


def test_con_la_oficial_rancia_no_se_afirma_quien_movio_la_brecha(config):
    """La brecha se calculó contra una tasa vencida: decir quién la movió sería
    afirmar de más. El eje de brecha SÍ se publica — la variación del paralelo
    es real."""
    lectura = lectura_completa(config, official_stale=True)
    assert CLAIM_OFICIAL_RANCIA in codigos(lectura)
    assert CLAIM_ATRIBUCION not in codigos(lectura)
    assert CLAIM_BRECHA in codigos(lectura)


def test_con_la_brecha_estable_no_se_atribuye_un_movimiento_que_no_hubo(config):
    lectura = lectura_completa(config, variaciones=var("0.10", "-0.40", "0"))
    assert lectura.eje_brecha == BRECHA_ESTABLE
    assert CLAIM_ATRIBUCION not in codigos(lectura)


def test_sin_brecha_medible_no_hay_regimen_ni_claim_de_brecha(config):
    """Hueco de captura: el eje de movimiento sí resolvió, pero medio régimen no
    se publica."""
    lectura = lectura_completa(config, variaciones=var(None, None, None))
    assert lectura.regimen is None
    assert lectura.eje_movimiento == MOV_LATERAL
    assert lectura.eje_brecha is None
    assert CLAIM_BRECHA not in codigos(lectura)
    assert CLAIM_ATRIBUCION not in codigos(lectura)


def test_sin_momentum_vigente_tampoco_hay_regimen(config):
    lectura = lectura_completa(
        config, indicadores=[medidor(INDICADOR_BRECHA_BUY, banda=BANDA_MUY_BAJA)]
    )
    assert lectura.regimen is None
    assert lectura.eje_movimiento is None
    assert lectura.eje_brecha == BRECHA_COMPRIMIENDO


@pytest.mark.parametrize("banda", [BANDA_BAJA, BANDA_ALTA])
def test_una_banda_del_medio_no_sostiene_la_frase_que_orienta(banda, config):
    """«De lo más barata en 90 días» solo es cierto en los extremos. En `low` o
    `high` la frase existiría igual de bien redactada y sería falsa."""
    lectura = lectura_completa(
        config,
        indicadores=[
            medidor(INDICADOR_MOMENTUM, valor="0.30"),
            medidor(INDICADOR_BRECHA_BUY, banda=banda),
        ],
    )
    assert CLAIM_MEDIDOR_EN_BANDA not in codigos(lectura)


def test_con_la_escala_en_respaldo_no_se_comenta_la_banda(config):
    """`unscaled` significa que no hubo distribución utilizable: no hay «tercio
    más barato» del que hablar."""
    lectura = lectura_completa(
        config,
        indicadores=[
            medidor(INDICADOR_MOMENTUM, valor="0.30"),
            medidor(
                INDICADOR_BRECHA_BUY, banda=BANDA_SIN_ESCALA, fuente=FUENTE_RULESET
            ),
        ],
    )
    assert CLAIM_MEDIDOR_EN_BANDA not in codigos(lectura)


def test_la_banda_alta_tambien_se_comenta_no_solo_la_barata(config):
    lectura = lectura_completa(
        config,
        indicadores=[
            medidor(INDICADOR_MOMENTUM, valor="0.30"),
            medidor(INDICADOR_BRECHA_BUY, banda=BANDA_MUY_ALTA),
        ],
    )
    banda = next(a for a in lectura.afirmaciones if a.codigo == CLAIM_MEDIDOR_EN_BANDA)
    assert banda.datos == {
        "indicador": INDICADOR_BRECHA_BUY,
        "banda": BANDA_MUY_ALTA,
        "dias": "90",
    }


def test_sin_regla_evaluable_no_se_dice_a_cuanto_esta_el_aviso(config):
    lectura = lectura_completa(config, sintesis=sintesis(cercana=None))
    assert CLAIM_REGLA_CERCA not in codigos(lectura)


def test_ninguna_afirmacion_lleva_prosa_solo_codigos_y_cifras(config):
    """El motor clasifica, el cliente redacta (ADR-0019 y ADR-0021). Si aquí se
    colara una frase, el ES/EN se partiría en dos sitios."""
    for afirmacion in lectura_completa(config).afirmaciones:
        assert afirmacion.codigo.islower()
        assert " " not in afirmacion.codigo
        for clave, valor in afirmacion.datos.items():
            assert isinstance(valor, str), clave
            # Las cifras y los códigos no llevan espacios; los nombres de regla
            # tampoco (`techo_inminente@v1`).
            assert " " not in valor, (afirmacion.codigo, clave)


# --------------------------------------------------------------------------- #
# Las piernas del movimiento (ADR-0023)                                        #
# --------------------------------------------------------------------------- #


def test_las_piernas_viajan_AUNQUE_no_haya_atribucion(config):
    """El defecto que ADR-0023 corrige.

    Con la brecha estable no hay nada que atribuir —y así debe seguir siendo—,
    pero las dos deltas son hechos medidos. Antes viajaban DENTRO del claim de
    atribución, así que desaparecían con él y la tarjeta se quedaba en blanco
    justo cuando el mercado estaba quieto: el caso en que el usuario quiere
    comprobar precisamente que no pasa nada.
    """
    lectura = lectura_completa(config, variaciones=var("0.10", "-0.40", "0"))

    assert CLAIM_ATRIBUCION not in codigos(lectura)
    assert lectura.piernas is not None
    assert lectura.piernas.paralelo == Decimal("-0.40")
    assert lectura.piernas.oficial == Decimal("0")
    assert lectura.piernas.responsable is None  # no se afirma lo que no se puede


def test_con_la_oficial_rancia_las_piernas_siguen_pero_sin_responsable(config):
    """La honestidad de ADR-0021 se conserva donde estaba: en el RESPONSABLE.

    Las deltas se midieron igual; lo que no se sostiene con una tasa vencida es
    decir cuál de las dos movió la brecha.
    """
    lectura = lectura_completa(config, official_stale=True)

    assert lectura.piernas is not None
    assert lectura.piernas.paralelo == Decimal("-8.40")
    assert lectura.piernas.responsable is None


def test_con_atribucion_el_responsable_viaja_en_las_piernas_y_en_el_claim(config):
    """Una sola fuente: el claim redacta la prosa y las piernas pintan la fila,
    pero los dos citan al MISMO responsable."""
    lectura = lectura_completa(config)

    claim = next(a for a in lectura.afirmaciones if a.codigo == CLAIM_ATRIBUCION)
    assert lectura.piernas.responsable == claim.datos["responsable"]


def test_la_identidad_se_conserva_en_las_piernas_publicadas(config):
    """`Δbrecha_abs = Δparalelo − Δoficial`: el neto NO se publica porque el
    consumidor lo deriva. Lo que sí tiene que cuadrar es lo que se publica."""
    lectura = lectura_completa(config, variaciones=var("-1.03", "-8.40", "2.50"))

    p = lectura.piernas
    assert p.paralelo - p.oficial == Decimal("-10.90")


def test_una_pierna_no_medible_no_enmudece_a_la_otra(config):
    lectura = lectura_completa(config, variaciones=var("-1.03", None, "0"))

    assert lectura.piernas is not None
    assert lectura.piernas.paralelo is None
    assert lectura.piernas.oficial == Decimal("0")


def test_sin_ninguna_pierna_medible_no_se_publican(config):
    lectura = lectura_completa(config, variaciones=var("-1.03", None, None))

    assert lectura.piernas is None


def test_la_ventana_de_las_piernas_es_la_MISMA_que_la_del_claim_de_brecha(config):
    """Las dos salen de un solo `Variaciones` y de una sola `ventana_horas`: si
    pudieran discrepar, la fila diría «6 h» sobre una medición de otra ventana."""
    lectura = lectura_completa(config)

    brecha = next(a for a in lectura.afirmaciones if a.codigo == CLAIM_BRECHA)
    assert str(lectura.piernas.ventana_horas) == brecha.datos["horas"]
