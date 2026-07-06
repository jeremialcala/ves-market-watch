"""Contrato de `indicators.updated` contra `schemas/indicators.v1.json`."""

import json
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from jsonschema import Draft202012Validator

from indicator_engine.adapters.amqp.publisher import construir_evento_indicadores
from indicator_engine.domain.models import Indicador

SCHEMA = Path(__file__).parents[4] / "schemas" / "indicators.v1.json"

AS_OF = datetime(2026, 7, 6, 12, 0, tzinfo=UTC)


def _indicadores() -> list[Indicador]:
    return [
        Indicador("official_rate", "USD", Decimal("700.00"), AS_OF, 1),
        Indicador("official_rate_change_abs", "USD", Decimal("32.95"), AS_OF, 1),
        Indicador("official_rate_change_pct", "USD", Decimal("-4.9"), AS_OF, 1),
    ]


def test_evento_emitido_cumple_el_schema_compartido():
    evento = construir_evento_indicadores(
        _indicadores(),
        official_stale=False,
        triggered_by=str(uuid.uuid4()),
        as_of=AS_OF,
    )

    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema).validate(evento)  # lanza si no cumple


def test_sobre_estandar_del_evento():
    evento = construir_evento_indicadores(
        _indicadores(), official_stale=True, triggered_by=str(uuid.uuid4()), as_of=AS_OF
    )

    assert set(evento) == {
        "event_id",
        "event_type",
        "schema_version",
        "occurred_at",
        "producer",
        "payload",
    }
    uuid.UUID(evento["event_id"])
    assert evento["event_type"] == "indicators.updated"
    assert evento["schema_version"] == 1
    assert evento["producer"] == "indicator-engine"
    assert evento["payload"]["official_stale"] is True
    assert evento["payload"]["calc_version"] == 1
    # Los valores viajan como string decimal exacto, nunca float.
    assert evento["payload"]["indicators"][1]["value"] == "32.95"
