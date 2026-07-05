"""Contrato del evento `official.rate.updated` (sobre estándar de ADR-0004)."""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from ingestor_bcv.adapters.amqp.publisher import construir_evento
from ingestor_bcv.domain.models import EstadoTasa, TasaOficial


def _tasa() -> TasaOficial:
    return TasaOficial(
        moneda="USD",
        valor=Decimal("667.05000000"),
        fecha_valor=date(2026, 7, 6),
        capturada_en=datetime(2026, 7, 5, 21, 30, tzinfo=UTC),
    )


def test_sobre_del_evento_cumple_adr_0004():
    evento = construir_evento(_tasa())

    assert set(evento) == {
        "event_id",
        "event_type",
        "schema_version",
        "occurred_at",
        "producer",
        "payload",
    }
    uuid.UUID(evento["event_id"])  # debe ser UUID válido
    assert evento["event_type"] == "official.rate.updated"
    assert evento["schema_version"] == 1
    assert evento["producer"] == "ingestor-bcv"
    datetime.fromisoformat(evento["occurred_at"])  # ISO-8601 válido


def test_payload_del_evento():
    payload = construir_evento(_tasa())["payload"]

    assert payload == {
        "source": "BCV",
        "currency": "USD",
        "rate": "667.05000000",
        "value_date": "2026-07-06",
        "captured_at": "2026-07-05T21:30:00+00:00",
        "status": "valid",
    }
    # La tasa viaja como string decimal exacto, nunca float.
    assert Decimal(payload["rate"]) == Decimal("667.05")


def test_cada_evento_tiene_id_unico():
    tasa = _tasa()
    assert construir_evento(tasa)["event_id"] != construir_evento(tasa)["event_id"]
