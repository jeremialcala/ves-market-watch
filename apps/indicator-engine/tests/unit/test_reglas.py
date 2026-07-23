"""Motor de reglas de señales (RF-4): carga del ruleset y evaluación pura.

Incluye la validación del ruleset v1 real (`config/senales.v1.yaml`), para que un
cambio de umbral sin querer rompa un test.
"""

from decimal import Decimal
from pathlib import Path

import pytest
import yaml

from indicator_engine.domain.reglas import (
    RulesetInvalido,
    cargar_ruleset,
    evaluar_reglas,
)

RULESET_V1 = Path(__file__).parents[2] / "config" / "senales.v1.yaml"


def _ruleset_min(rules=None, version=1, cooldown=60):
    return cargar_ruleset(
        {
            "version": version,
            "cooldown_min": cooldown,
            "rules": rules
            or [
                {
                    "type": "prueba",
                    "direction": "alcista",
                    "when": [{"indicator": "x", "op": "gt", "value": "1"}],
                }
            ],
        }
    )


# --- carga / validación ---------------------------------------------------

def test_ruleset_v1_real_carga_las_tres_reglas():
    ruleset = cargar_ruleset(yaml.safe_load(RULESET_V1.read_text(encoding="utf-8")))
    assert ruleset.version == 1
    assert ruleset.cooldown_min == 60
    tipos = [r.tipo for r in ruleset.reglas]
    assert tipos == ["arranque_alcista", "techo_inminente", "correccion_inminente"]
    # umbrales del backtest: techo = momentum>1.5 & spread<0.5 & ratio<0.2
    techo = next(r for r in ruleset.reglas if r.tipo == "techo_inminente")
    umbrales = {c.indicador: (c.op, c.umbral) for c in techo.condiciones}
    assert umbrales["p2p_momentum_bid_3h_pct"] == ("gt", Decimal("1.5"))
    assert umbrales["p2p_spread_pct"] == ("lt", Decimal("0.5"))
    assert umbrales["p2p_ratio_oferta_demanda"] == ("lt", Decimal("0.2"))


@pytest.mark.parametrize(
    "data, mensaje",
    [
        ({"version": 0, "cooldown_min": 1, "rules": [1]}, "version"),
        ({"version": 1, "cooldown_min": -1, "rules": [1]}, "cooldown"),
        ({"version": 1, "cooldown_min": 1, "rules": []}, "rules"),
        (
            {
                "version": 1,
                "cooldown_min": 1,
                "rules": [{"type": "t", "direction": "lateral", "when": [{}]}],
            },
            "direction",
        ),
        (
            {
                "version": 1,
                "cooldown_min": 1,
                "rules": [
                    {
                        "type": "t",
                        "direction": "alcista",
                        "when": [{"indicator": "x", "op": "==", "value": "1"}],
                    }
                ],
            },
            "op",
        ),
    ],
)
def test_ruleset_invalido_falla_al_cargar(data, mensaje):
    with pytest.raises(RulesetInvalido):
        cargar_ruleset(data)


def test_tipos_duplicados_rechazados():
    regla = {
        "type": "dup",
        "direction": "alcista",
        "when": [{"indicator": "x", "op": "gt", "value": "1"}],
    }
    with pytest.raises(RulesetInvalido):
        _ruleset_min(rules=[regla, regla])


# --- evaluación -----------------------------------------------------------

def test_regla_dispara_cuando_todas_las_condiciones_se_cumplen():
    ruleset = cargar_ruleset(yaml.safe_load(RULESET_V1.read_text(encoding="utf-8")))
    vista = {
        "p2p_momentum_bid_3h_pct": Decimal("1.62"),
        "p2p_spread_pct": Decimal("0.41"),
        "p2p_ratio_oferta_demanda": Decimal("0.18"),
    }
    disparadas = evaluar_reglas(ruleset, vista)
    tipos = {d.tipo for d in disparadas}
    assert "techo_inminente" in tipos
    techo = next(d for d in disparadas if d.tipo == "techo_inminente")
    assert techo.direccion == "bajista"
    assert techo.regla == "techo_inminente@v1"
    assert techo.inputs == vista  # evidencia = insumos usados


def test_correccion_inminente_por_muro_de_oferta():
    ruleset = cargar_ruleset(yaml.safe_load(RULESET_V1.read_text(encoding="utf-8")))
    disparadas = evaluar_reglas(
        ruleset,
        {
            "p2p_ratio_oferta_demanda": Decimal("2.4"),
            "p2p_momentum_bid_3h_pct": Decimal("-1.3"),
            # spread/drenaje ausentes: techo/arranque no pueden disparar
        },
    )
    assert {d.tipo for d in disparadas} == {"correccion_inminente"}


def test_no_dispara_si_una_condicion_falla():
    ruleset = cargar_ruleset(yaml.safe_load(RULESET_V1.read_text(encoding="utf-8")))
    # momentum alto y spread bajo, pero ratio 0.5 (>0.2): techo NO dispara
    disparadas = evaluar_reglas(
        ruleset,
        {
            "p2p_momentum_bid_3h_pct": Decimal("1.8"),
            "p2p_spread_pct": Decimal("0.3"),
            "p2p_ratio_oferta_demanda": Decimal("0.5"),
        },
    )
    assert disparadas == []


def test_indicador_ausente_no_dispara_su_regla():
    # ratio presente y >2, pero falta el momentum que la regla exige
    ruleset = cargar_ruleset(yaml.safe_load(RULESET_V1.read_text(encoding="utf-8")))
    disparadas = evaluar_reglas(ruleset, {"p2p_ratio_oferta_demanda": Decimal("3")})
    assert disparadas == []
