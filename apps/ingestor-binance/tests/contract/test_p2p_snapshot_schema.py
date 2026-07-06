"""Contrato de `p2p.snapshot` contra `schemas/p2p-snapshot.v1.json`."""

import json
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from jsonschema import Draft202012Validator

from ingestor_binance.adapters.amqp.publisher import construir_evento_snapshot
from ingestor_binance.domain.models import Anuncio, Lado, SnapshotP2P

SCHEMA = Path(__file__).parents[4] / "schemas" / "p2p-snapshot.v1.json"


def _snapshot() -> SnapshotP2P:
    return SnapshotP2P(
        lado=Lado.BUY,
        asset="USDT",
        fiat="VES",
        capturado_en=datetime(2026, 7, 6, 12, 0, tzinfo=UTC),
        parcial=False,
        anuncios=(
            Anuncio(
                adv_no="12905116468971859968",
                precio=Decimal("745.000"),
                cantidad_disponible=Decimal("100.00"),
                limite_min=Decimal("20000"),
                limite_max=Decimal("50000"),
                metodos_pago=("Pago Movil", "Banesco"),
                es_merchant=True,
            ),
            Anuncio(
                adv_no="2",
                precio=Decimal("7450.000"),
                cantidad_disponible=Decimal("5"),
                limite_min=Decimal("100"),
                limite_max=Decimal("1000"),
                metodos_pago=(),
                es_merchant=False,
                outlier=True,
            ),
        ),
    )


def test_evento_emitido_cumple_el_schema_compartido():
    evento = construir_evento_snapshot(_snapshot())

    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema).validate(evento)  # lanza si no cumple


def test_sobre_estandar_y_payload():
    evento = construir_evento_snapshot(_snapshot())

    assert set(evento) == {
        "event_id",
        "event_type",
        "schema_version",
        "occurred_at",
        "producer",
        "payload",
    }
    uuid.UUID(evento["event_id"])
    assert evento["event_type"] == "p2p.snapshot"
    assert evento["schema_version"] == 1
    assert evento["producer"] == "ingestor-binance"

    payload = evento["payload"]
    assert payload["side"] == "BUY"
    assert payload["asset"] == "USDT"
    assert payload["fiat"] == "VES"
    assert payload["partial"] is False
    # Decimales como string exacto; el outlier viaja etiquetado, no filtrado.
    assert payload["ads"][0]["price"] == "745.000"
    assert payload["ads"][1]["outlier"] is True


def test_cada_evento_tiene_id_unico():
    snapshot = _snapshot()
    assert (
        construir_evento_snapshot(snapshot)["event_id"]
        != construir_evento_snapshot(snapshot)["event_id"]
    )
