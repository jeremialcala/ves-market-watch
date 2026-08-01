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
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest
import yaml
from jsonschema import Draft202012Validator

from indicator_engine.adapters.amqp.publisher import construir_evento_analisis
from indicator_engine.domain.analisis import (
    Distribucion,
    cargar_config_analisis,
    construir_analisis,
)
from indicator_engine.domain.reglas import cargar_ruleset, evaluar_proximidad

SCHEMA = Path(__file__).parents[4] / "schemas" / "analysis.v1.json"
CONFIG = Path(__file__).parents[2] / "config" / "analisis.v1.yaml"
RULESET = Path(__file__).parents[2] / "config" / "senales.v1.yaml"

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


def _evento(
    *,
    con_percentiles: bool = True,
    confianza_baja: bool = False,
    vista: dict[str, Decimal] | None = None,
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
        official_stale=False,
    )
    return construir_evento_analisis(analisis)


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
