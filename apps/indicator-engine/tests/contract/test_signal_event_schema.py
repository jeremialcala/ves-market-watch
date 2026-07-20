"""Contrato de `signals.emitted` contra `schemas/signal.v1.json`.

El evento aún no se emite (la emisión depende del motor de reglas, RF-4, sin
implementar). Este contrato fija la forma que el productor deberá cumplir: valida
que el schema es un Draft 2020-12 correcto y que un ejemplo canónico —y sus
variantes negativas— caen del lado esperado.
"""

import json
import uuid
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

SCHEMA = Path(__file__).parents[4] / "schemas" / "signal.v1.json"

AS_OF = datetime(2026, 7, 15, 18, 0, tzinfo=UTC)


def _validador() -> Draft202012Validator:
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)  # el schema en sí es válido
    return Draft202012Validator(schema)


def _senal_valida() -> dict:
    """Ejemplo canónico: 'techo inminente' del backtest (microestructura-p2p.md)."""
    return {
        "event_id": str(uuid.uuid4()),
        "event_type": "signals.emitted",
        "schema_version": 1,
        "occurred_at": datetime.now(UTC).isoformat(),
        "producer": "indicator-engine",
        "payload": {
            "type": "techo_inminente",
            "direction": "bajista",
            "currency": "VES",
            "as_of": AS_OF.isoformat(),
            "calc_version": 1,
            "triggered_by": str(uuid.uuid4()),
            "evidence": {
                "rule": "techo_inminente@v1",
                "inputs": {
                    "p2p_momentum_bid_3h_pct": "1.62",
                    "p2p_spread_pct": "0.41",
                    "p2p_ratio_oferta_demanda": "0.18",
                },
            },
        },
    }


def test_ejemplo_canonico_cumple_el_schema():
    _validador().validate(_senal_valida())  # lanza si no cumple


def test_sobre_estandar():
    senal = _senal_valida()
    assert set(senal) == {
        "event_id",
        "event_type",
        "schema_version",
        "occurred_at",
        "producer",
        "payload",
    }
    assert senal["event_type"] == "signals.emitted"
    assert senal["schema_version"] == 1


@pytest.mark.parametrize(
    "mutacion",
    [
        pytest.param(lambda s: s["payload"].pop("evidence"), id="sin-evidence"),
        pytest.param(lambda s: s["payload"].pop("triggered_by"), id="sin-triggered_by"),
        pytest.param(
            lambda s: s["payload"].__setitem__("direction", "lateral"),
            id="direction-fuera-de-enum",
        ),
        pytest.param(
            lambda s: s["payload"]["evidence"]["inputs"].__setitem__(
                "p2p_spread_pct", "0,41"
            ),
            id="input-no-decimal",
        ),
        pytest.param(
            lambda s: s["payload"].__setitem__("extra", "x"),
            id="propiedad-adicional",
        ),
        pytest.param(
            lambda s: s["payload"]["evidence"].__setitem__("inputs", {}),
            id="inputs-vacio",
        ),
        pytest.param(
            lambda s: s.__setitem__("event_type", "signal.emitted"),
            id="event_type-erroneo",
        ),
    ],
)
def test_variantes_invalidas_son_rechazadas(mutacion):
    senal = _senal_valida()
    mutacion(senal)
    assert not _validador().is_valid(senal)
