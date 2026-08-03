"""Contrato de `analysis.updated` contra `schemas/analysis.v1.json` (ADR-0019).

El productor real construye el evento desde el dominio y se valida contra el
schema publicado: así el contrato y el código que lo implementa no pueden
divergir. Las variantes negativas fijan las líneas que el contrato NO deja
cruzar — sobre todo las dos que serían dato inventado: una banda de percentil
sobre el respaldo del ruleset, y un valor rellenado donde el indicador no está
vigente.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest
import yaml
from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError

from indicator_engine.adapters.amqp.publisher import construir_evento_analisis
from indicator_engine.domain.analisis import (
    Distribucion,
    cargar_config_analisis,
    construir_analisis,
)
from indicator_engine.domain.lectura import (
    Variaciones,
    cargar_config_lectura,
    construir_lectura,
)
from indicator_engine.domain.reglas import cargar_ruleset, evaluar_proximidad

SCHEMA = Path(__file__).parents[4] / "schemas" / "analysis.v1.json"
CONFIG = Path(__file__).parents[2] / "config" / "analisis.v1.yaml"
RULESET = Path(__file__).parents[2] / "config" / "senales.v1.yaml"
CONFIG_LECTURA = Path(__file__).parents[2] / "config" / "lectura.v1.yaml"

AS_OF = datetime(2026, 7, 31, 20, 54, tzinfo=UTC)
TRIGGERED_BY = "3b8d5a10-19c7-4e2f-bb64-0c9a71e5d833"


def _validador() -> Draft202012Validator:
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)  # el schema en sí es válido
    return Draft202012Validator(schema)


def _config():
    return cargar_config_analisis(yaml.safe_load(CONFIG.read_text(encoding="utf-8")))


def _ruleset():
    return cargar_ruleset(yaml.safe_load(RULESET.read_text(encoding="utf-8")))


def _distribucion(muestras: int) -> Distribucion:
    return Distribucion(
        muestras=muestras,
        minimo=Decimal("8.41"),
        maximo=Decimal("31.07"),
        cortes=(Decimal("10.55"), Decimal("15.90"), Decimal("24.18")),
        calculada_en=AS_OF,
    )


def _config_lectura():
    return cargar_config_lectura(
        yaml.safe_load(CONFIG_LECTURA.read_text(encoding="utf-8"))
    )


def _evento(
    *,
    con_percentiles: bool = True,
    confianza_baja: bool = False,
    vista: dict[str, Decimal] | None = None,
    con_lectura: bool = False,
    official_stale: bool = False,
    variaciones: Variaciones | None = None,
) -> dict:
    config, ruleset = _config(), _ruleset()
    vista = vista if vista is not None else {
        "p2p_brecha_pct_buy": Decimal("13.22"),
        "p2p_spread_pct": Decimal("0.56"),
        "p2p_ratio_oferta_demanda": Decimal("0.59"),
        "p2p_drenaje_oferta_6h_pct": Decimal("29.86"),
        "p2p_outliers_pct_buy": Decimal("0.50"),
    }
    muestras = 4187 if con_percentiles else 137
    analisis = construir_analisis(
        config=config,
        ruleset=ruleset,
        vista=vista,
        as_of_por_indicador={n: AS_OF for n in vista},
        distribuciones={n: _distribucion(muestras) for n in vista},
        proximidad=evaluar_proximidad(
            ruleset, vista, evaluable=not confianza_baja
        ),
        as_of=AS_OF,
        moneda="VES",
        calc_version=1,
        triggered_by=TRIGGERED_BY,
        confianza_baja=confianza_baja,
        official_stale=official_stale,
    )
    if not con_lectura:
        return construir_evento_analisis(analisis)
    lectura = construir_lectura(
        config=_config_lectura(),
        indicadores=analisis.indicadores,
        sintesis=analisis.sintesis,
        variaciones=variaciones
        or Variaciones(
            brecha_pp=Decimal("-1.03"),
            paralelo=Decimal("-8.40"),
            oficial=Decimal("0"),
        ),
        confianza_baja=confianza_baja,
        official_stale=official_stale,
    )
    return construir_evento_analisis(analisis, lectura=lectura)


def test_el_evento_del_productor_cumple_el_schema():
    _validador().validate(_evento())  # lanza si no cumple


def test_sobre_estandar():
    evento = _evento()
    assert set(evento) == {
        "event_id",
        "event_type",
        "schema_version",
        "occurred_at",
        "producer",
        "payload",
    }
    assert evento["event_type"] == "analysis.updated"
    assert evento["schema_version"] == 1
    assert evento["producer"] == "indicator-engine"


def test_todos_los_decimales_viajan_en_punto_fijo():
    """`str(Decimal)` puede dar notación científica y el contrato exige
    `^-?[0-9]+(\\.[0-9]+)?$` en todos los niveles."""
    payload = _evento()["payload"]
    decimales: list[str] = []
    for indicador in payload["indicators"]:
        decimales += [indicador["value"], indicador["position"]]
        decimales += [
            indicador["scale"]["domain"]["min"],
            indicador["scale"]["domain"]["max"],
        ]
        for corte in indicador["scale"]["cuts"]:
            decimales += [corte["value"], corte["position"]]
        for regla in indicador["rules"]:
            decimales += [
                regla["threshold"],
                regla["distance"],
                regla["threshold_position"],
            ]
    for regla in payload["rule_proximity"]:
        for cond in regla["conditions"]:
            decimales += [cond["threshold"], cond["value"], cond["distance"]]

    assert decimales, "el ejemplo debe traer decimales que comprobar"
    for valor in decimales:
        if valor is None:
            continue  # `null` es legítimo: indicador no vigente / sin escala
        assert "E" not in valor and "e" not in valor, valor


def test_el_respaldo_publica_unscaled_y_su_fuente():
    payload = _evento(con_percentiles=False)["payload"]
    ratio = next(
        i for i in payload["indicators"] if i["indicator"] == "p2p_ratio_oferta_demanda"
    )
    assert ratio["scale"]["source"] == "ruleset"
    assert ratio["band"] == "unscaled"
    # Las muestras reales viajan igual: la UI cuenta 137/200 en el pie.
    assert (ratio["scale"]["samples"], ratio["scale"]["min_samples"]) == (137, 200)


def test_un_indicador_no_vigente_viaja_como_null_en_la_proximidad():
    """Jamás se rellena con el último conocido rancio."""
    payload = _evento(
        vista={"p2p_ratio_oferta_demanda": Decimal("0.59")}
    )["payload"]
    condiciones = [c for r in payload["rule_proximity"] for c in r["conditions"]]
    ausentes = [c for c in condiciones if c["indicator"] != "p2p_ratio_oferta_demanda"]
    assert ausentes
    assert all(c["value"] is None and c["distance"] is None for c in ausentes)
    assert all(not r["evaluable"] for r in payload["rule_proximity"])


def test_con_confianza_baja_se_emite_marcado_y_sin_reglas_evaluables():
    """La lectura de cada medidor sigue siendo válida; la proximidad no."""
    payload = _evento(confianza_baja=True)["payload"]
    _validador().validate(_evento(confianza_baja=True))
    assert payload["confidence"] == "low"
    assert payload["indicators"], "los medidores siguen publicando su lectura"
    assert payload["summary"]["rules_evaluable"] == 0
    assert payload["summary"]["closest_rule"] is None


# -- lectura del estado de mercado (RF-7, ADR-0021) --------------------------

# La vista por defecto no trae momentum —los medidores del panel se publican
# con lo que haya— y sin él no hay eje de movimiento. Esta sí lo trae, y pone la
# brecha por debajo de su p10 (10,55) para que la banda sea `very_low`: es la
# combinación que hace resolver los dos ejes y sostiene la frase orientativa.
VISTA_LECTURA = {
    "p2p_brecha_pct_buy": Decimal("9.10"),
    "p2p_spread_pct": Decimal("0.56"),
    "p2p_ratio_oferta_demanda": Decimal("0.59"),
    "p2p_drenaje_oferta_6h_pct": Decimal("29.86"),
    "p2p_outliers_pct_buy": Decimal("0.50"),
    "p2p_momentum_bid_3h_pct": Decimal("0.30"),  # |0,30| < 0,5 ⇒ lateral
}


def test_el_evento_con_lectura_cumple_el_schema():
    _validador().validate(_evento(con_lectura=True, vista=VISTA_LECTURA))


def test_la_lectura_es_aditiva_un_productor_sin_config_publica_igual():
    """Es la razón por la que `reading` es opcional: el gateway puede ir por
    delante del motor sin que `additionalProperties: false` rompa nada."""
    _validador().validate(_evento(con_lectura=False))
    assert "reading" not in _evento(con_lectura=False)["payload"]


def test_la_lectura_publica_el_regimen_sus_ejes_y_sus_afirmaciones():
    reading = _evento(con_lectura=True, vista=VISTA_LECTURA)["payload"]["reading"]
    assert reading["regime"] == "lateral_comprimiendo"
    assert (reading["axis_movement"], reading["axis_gap"]) == (
        "lateral",
        "comprimiendo",
    )
    assert (reading["version"], reading["window_hours"]) == (1, 6)
    assert [c["code"] for c in reading["claims"]] == [
        "brecha",
        "atribucion",
        "medidor_en_banda",
        "regla_cerca",
    ]


def test_las_cifras_de_los_claims_viajan_como_string_exacto():
    """Todo `data` es string (el schema lo exige), y las claves NUMÉRICAS además
    van en punto fijo: `str(Decimal)` puede dar notación científica."""
    numericas = {"delta_pp", "paralelo", "oficial", "horas", "dias", "cumplidas",
                 "totales"}
    reading = _evento(con_lectura=True, vista=VISTA_LECTURA)["payload"]["reading"]
    vistas: set[str] = set()
    for claim in reading["claims"]:
        for clave, valor in claim["data"].items():
            assert isinstance(valor, str), (claim["code"], clave)
            if clave in numericas:
                vistas.add(clave)
                assert re.fullmatch(r"-?[0-9]+(\.[0-9]+)?", valor), (clave, valor)
    assert vistas, "el ejemplo debe traer cifras que comprobar"


def test_con_la_oficial_rancia_el_evento_no_lleva_atribucion():
    """El silencio también es contrato: con una tasa vencida, decir quién movió
    la brecha sería afirmar de más."""
    reading = _evento(
        con_lectura=True, vista=VISTA_LECTURA, official_stale=True
    )["payload"]["reading"]
    codigos = [c["code"] for c in reading["claims"]]
    assert "oficial_rancia" in codigos
    assert "atribucion" not in codigos


def test_sin_brecha_medible_el_regimen_viaja_como_null_y_valida():
    evento = _evento(
        con_lectura=True,
        vista=VISTA_LECTURA,
        variaciones=Variaciones(brecha_pp=None, paralelo=None, oficial=None),
    )
    _validador().validate(evento)
    reading = evento["payload"]["reading"]
    assert reading["regime"] is None
    assert reading["axis_gap"] is None
    # El eje que SÍ resolvió se publica: se omite la clasificación, no el dato.
    assert reading["axis_movement"] is not None


@pytest.mark.parametrize(
    "mutacion",
    [
        pytest.param(
            lambda e: e["payload"]["reading"].pop("claims"), id="lectura-sin-claims"
        ),
        pytest.param(
            lambda e: e["payload"]["reading"].__setitem__("axis_gap", "cerrandose"),
            id="eje-fuera-de-enum",
        ),
        pytest.param(
            lambda e: e["payload"]["reading"]["claims"][0].__setitem__(
                "code", "va_a_subir"
            ),
            id="claim-predictivo-fuera-de-enum",
        ),
        pytest.param(
            lambda e: e["payload"]["reading"]["claims"][0]["data"].__setitem__(
                "delta_pp", 1.03
            ),
            id="cifra-como-numero-en-vez-de-string",
        ),
        pytest.param(
            lambda e: e["payload"]["reading"].__setitem__("gauges_near_threshold", -1),
            id="conteo-negativo",
        ),
        pytest.param(
            lambda e: e["payload"]["reading"].__setitem__("prosa", "Lateral en…"),
            id="prosa-en-el-evento",
        ),
    ],
)
def test_variantes_invalidas_de_la_lectura_son_rechazadas(mutacion):
    evento = _evento(con_lectura=True, vista=VISTA_LECTURA)
    mutacion(evento)
    assert not _validador().is_valid(evento)


@pytest.mark.parametrize(
    "mutacion",
    [
        pytest.param(lambda e: e["payload"].pop("summary"), id="sin-summary"),
        pytest.param(
            lambda e: e["payload"].pop("triggered_by"), id="sin-triggered_by"
        ),
        pytest.param(
            lambda e: e["payload"]["indicators"][0].__setitem__("band", "medio"),
            id="banda-fuera-de-enum",
        ),
        pytest.param(
            lambda e: e["payload"]["indicators"][0]["scale"].__setitem__(
                "source", "backtest"
            ),
            id="fuente-de-escala-inventada",
        ),
        pytest.param(
            lambda e: e["payload"]["indicators"][0].__setitem__("value", "13,22"),
            id="decimal-con-coma",
        ),
        pytest.param(
            lambda e: e["payload"]["indicators"][0].__setitem__("position", "-0.5"),
            id="posicion-negativa",
        ),
        pytest.param(
            lambda e: e["payload"].__setitem__("confidence", "media"),
            id="confianza-fuera-de-enum",
        ),
        pytest.param(
            lambda e: e["payload"].__setitem__("extra", "x"), id="propiedad-adicional"
        ),
        pytest.param(
            lambda e: e.__setitem__("event_type", "analysis.v2"), id="event_type-erroneo"
        ),
        pytest.param(
            lambda e: e["payload"]["rule_proximity"][0].__setitem__("conditions", []),
            id="regla-sin-condiciones",
        ),
    ],
)
def test_variantes_invalidas_son_rechazadas(mutacion):
    evento = _evento()
    mutacion(evento)
    assert not _validador().is_valid(evento)


# -- gap_history: la brecha contra su historia (RF-7) ------------------------


def _con_historia(agregados_por_lado):
    """Evento con `gap_history` armado desde el dominio, no a mano."""
    from indicator_engine.domain.comparativas import cargar_config_comparativas
    from indicator_engine.domain.lectura import construir_historia

    cfg = cargar_config_comparativas(
        yaml.safe_load(CONFIG_LECTURA.read_text(encoding="utf-8"))["comparativas"]
    )
    evento = _evento(con_lectura=True, vista=VISTA_LECTURA)
    lectura = _lectura_con_historia(agregados_por_lado, cfg)
    from indicator_engine.adapters.amqp.publisher import construir_evento_analisis

    analisis = _analisis_base()
    return construir_evento_analisis(analisis, lectura=lectura)


def _analisis_base():
    config, ruleset = _config(), _ruleset()
    return construir_analisis(
        config=config,
        ruleset=ruleset,
        vista=VISTA_LECTURA,
        as_of_por_indicador={n: AS_OF for n in VISTA_LECTURA},
        distribuciones={n: _distribucion(4187) for n in VISTA_LECTURA},
        proximidad=evaluar_proximidad(ruleset, VISTA_LECTURA, evaluable=True),
        as_of=AS_OF,
        moneda="VES",
        calc_version=1,
        triggered_by=TRIGGERED_BY,
        confianza_baja=False,
        official_stale=False,
    )


def _lectura_con_historia(agregados_por_lado, cfg):
    from indicator_engine.domain.lectura import construir_historia, construir_lectura

    analisis = _analisis_base()
    historia = [
        h
        for lado, ags in agregados_por_lado.items()
        if (h := construir_historia(lado, Decimal("13.38"), ags, cfg)) is not None
    ]
    return construir_lectura(
        config=_config_lectura(),
        indicadores=analisis.indicadores,
        sintesis=analisis.sintesis,
        variaciones=Variaciones(
            brecha_pp=Decimal("-1.03"), paralelo=Decimal("-8.40"), oficial=Decimal("0")
        ),
        confianza_baja=False,
        official_stale=False,
        historia=historia,
        config_comparativas=cfg,
    )


def _ag(dias, media="15.00", cubiertos=None):
    from indicator_engine.domain.comparativas import Agregado

    return Agregado(
        ventana_dias=dias,
        media=Decimal(media),
        maximo=Decimal("20.00"),
        minimo=Decimal("10.00"),
        muestras=500,
        dias_cubiertos=dias if cubiertos is None else cubiertos,
    )


COMPLETA = {7: _ag(7), 30: _ag(30), 90: _ag(90)}
PARCIAL = {7: _ag(7), 30: _ag(30, cubiertos=12), 90: _ag(90, cubiertos=12)}


def test_el_evento_con_gap_history_cumple_el_schema():
    _validador().validate(_con_historia({"buy": COMPLETA, "sell": COMPLETA}))


def test_gap_history_es_ADITIVO_el_evento_sin_el_tambien_vale():
    """Es lo que permite desplegar el gateway por delante del motor — y lo que
    NO se cumplió al añadir los claims nuevos, que llevan enum cerrado: el
    gateway descartó cada `analysis.updated` hasta que se amplió el enum."""
    evento = _evento(con_lectura=True, vista=VISTA_LECTURA)
    _validador().validate(evento)
    assert "gap_history" not in evento["payload"]


def test_publica_TODAS_las_ventanas_con_su_cobertura_real():
    payload = _con_historia({"buy": PARCIAL})["payload"]
    referencias = payload["gap_history"]["sides"][0]["references"]

    assert [r["days_configured"] for r in referencias] == [7, 30, 90]
    # La ventana incompleta se publica IGUAL, declarando su alcance: es lo que
    # permite al cliente rotular «12 d (de 30)» en vez de mentir.
    assert [r["days_covered"] for r in referencias] == [7, 12, 12]


def test_los_dos_lados_viajan_por_separado():
    lados = _con_historia({"buy": COMPLETA, "sell": COMPLETA})["payload"]["gap_history"]["sides"]
    assert sorted(l["side"] for l in lados) == ["buy", "sell"]


def test_las_cifras_de_la_historia_van_en_punto_fijo():
    payload = _con_historia({"buy": COMPLETA})["payload"]
    for lado in payload["gap_history"]["sides"]:
        for valor in [lado["current"]] + [
            r[k] for r in lado["references"] for k in ("mean", "max", "min")
        ]:
            if valor is not None:
                assert re.fullmatch(r"-?[0-9]+(\.[0-9]+)?", valor), valor


def test_con_ventanas_parciales_se_compara_contra_la_COMPLETA_mas_ancha():
    """El caso real del lado compra: 12 días de serie. Las ventanas de 30 y 90
    se publican con su cobertura, pero la prosa se apoya en la de 7, que sí está
    completa. Citar la de 90 sería exactamente la mentira que esto corrige."""
    payload = _con_historia({"buy": PARCIAL})["payload"]
    comparativas = [
        c for c in payload["reading"]["claims"] if c["code"] == "brecha_vs_historia"
    ]
    assert len(comparativas) == 1
    assert comparativas[0]["data"]["dias"] == "7"


def test_sin_NINGUNA_ventana_completa_el_claim_lo_declara():
    """Serie recién estrenada: no hay contra qué comparar, y decirlo es la única
    respuesta honesta."""
    recien = {7: _ag(7, cubiertos=1), 30: _ag(30, cubiertos=1), 90: _ag(90, cubiertos=1)}
    payload = _con_historia({"buy": recien})["payload"]
    codigos = [c["code"] for c in payload["reading"]["claims"]]

    assert "historia_parcial" in codigos
    assert "brecha_vs_historia" not in codigos


@pytest.mark.parametrize(
    "mutacion",
    [
        pytest.param(
            lambda e: e["payload"]["gap_history"]["sides"][0].__setitem__("side", "ambos"),
            id="lado-fuera-de-enum",
        ),
        pytest.param(
            lambda e: e["payload"]["gap_history"]["sides"][0]["references"][0].pop(
                "days_covered"
            ),
            id="sin-cobertura-declarada",
        ),
        pytest.param(
            lambda e: e["payload"]["gap_history"]["sides"][0]["references"][0].__setitem__(
                "days_covered", -1
            ),
            id="cobertura-negativa",
        ),
        pytest.param(
            lambda e: e["payload"]["gap_history"]["sides"][0]["references"][0].__setitem__(
                "mean", 15.0
            ),
            id="media-como-float",
        ),
        pytest.param(
            lambda e: e["payload"]["gap_history"].__setitem__("prosa", "sube"),
            id="prosa-en-la-historia",
        ),
    ],
)
def test_variantes_invalidas_de_gap_history_son_rechazadas(mutacion):
    evento = _con_historia({"buy": COMPLETA})
    mutacion(evento)
    assert not _validador().is_valid(evento)


# -- gap_legs: las piernas del movimiento (ADR-0023) -------------------------


def test_el_evento_con_gap_legs_cumple_el_schema():
    evento = _evento(con_lectura=True, vista=VISTA_LECTURA)
    _validador().validate(evento)
    piernas = evento["payload"]["gap_legs"]
    assert set(piernas) == {"hours", "official", "parallel", "responsible"}


def test_las_piernas_viajan_CON_responsible_null_y_el_schema_lo_acepta():
    """El punto entero de ADR-0023: las deltas son hechos y viajan siempre; el
    responsable es una afirmación y puede faltar. Si el schema exigiera un
    responsable no nulo, la fila volvería a desaparecer con el mercado quieto."""
    evento = _evento(con_lectura=True, vista=VISTA_LECTURA)
    evento["payload"]["gap_legs"]["responsible"] = None
    _validador().validate(evento)


def test_una_pierna_null_es_valida_y_NO_es_lo_mismo_que_cero():
    """`0` = la pierna no se movió (dato). `null` = no se pudo medir. Colapsar
    los dos haría que un hueco de captura se leyera como una meseta real."""
    evento = _evento(con_lectura=True, vista=VISTA_LECTURA)
    evento["payload"]["gap_legs"]["parallel"] = None
    _validador().validate(evento)
    evento["payload"]["gap_legs"]["parallel"] = "0"
    _validador().validate(evento)


def test_gap_legs_es_ADITIVO_el_evento_sin_el_tambien_vale():
    """Lo que permite desplegar el gateway por delante del motor."""
    evento = _evento(con_lectura=True, vista=VISTA_LECTURA)
    del evento["payload"]["gap_legs"]
    _validador().validate(evento)


def test_un_responsable_fuera_del_enum_se_rechaza():
    evento = _evento(con_lectura=True, vista=VISTA_LECTURA)
    evento["payload"]["gap_legs"]["responsible"] = "el_bcv"
    with pytest.raises(ValidationError):
        _validador().validate(evento)


def test_las_piernas_van_en_punto_fijo_como_el_resto_del_contrato():
    evento = _evento(con_lectura=True, vista=VISTA_LECTURA)
    for clave in ("official", "parallel"):
        valor = evento["payload"]["gap_legs"][clave]
        if valor is not None:
            assert "E" not in valor and "e" not in valor
