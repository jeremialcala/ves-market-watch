"""Tests de la validación de eventos consumidos contra el schema compartido."""

from datetime import date
from decimal import Decimal

import pytest

from indicator_engine.application.contracts import EventoInvalido


def test_evento_valido_se_convierte_al_dto(validador, crear_evento):
    evento = crear_evento(currency="EUR", rate="763.19191650")

    tasa = validador.validar_tasa_oficial(evento)

    assert tasa.moneda == "EUR"
    assert tasa.valor == Decimal("763.19191650")
    assert tasa.fecha_valor == date(2026, 7, 6)
    assert tasa.event_id == evento["event_id"]


def test_falta_campo_requerido_es_invalido(validador, crear_evento):
    evento = crear_evento()
    del evento["payload"]["currency"]

    with pytest.raises(EventoInvalido, match="currency"):
        validador.validar_tasa_oficial(evento)


def test_rate_como_numero_es_invalido(validador, crear_evento):
    # El contrato exige decimal-como-string; un float JSON pierde precisión.
    evento = crear_evento()
    evento["payload"]["rate"] = 667.05

    with pytest.raises(EventoInvalido):
        validador.validar_tasa_oficial(evento)


def test_status_distinto_de_valid_es_invalido(validador, crear_evento):
    # ADR-0007: al bus solo llegan tasas valid; cualquier otra cosa es sospechosa.
    evento = crear_evento()
    evento["payload"]["status"] = "suspect"

    with pytest.raises(EventoInvalido):
        validador.validar_tasa_oficial(evento)


def test_event_type_incorrecto_es_invalido(validador, crear_evento):
    evento = crear_evento()
    evento["event_type"] = "p2p.snapshot"

    with pytest.raises(EventoInvalido):
        validador.validar_tasa_oficial(evento)


def test_moneda_fuera_de_iso4217_es_invalida(validador, crear_evento):
    evento = crear_evento()
    evento["payload"]["currency"] = "usd"

    with pytest.raises(EventoInvalido):
        validador.validar_tasa_oficial(evento)


def test_snapshot_p2p_valido_produce_dto(validador):
    from decimal import Decimal

    from tests.conftest import anuncio_p2p, evento_snapshot_p2p

    evento = evento_snapshot_p2p(
        side="SELL",
        ads=[anuncio_p2p(price="850.10", available_amount="25.5", merchant=True)],
    )

    snap = validador.validar_snapshot_p2p(evento)

    assert snap.side == "SELL"
    assert snap.fiat == "VES"
    assert snap.anuncios[0].precio == Decimal("850.10")
    assert snap.anuncios[0].cantidad_disponible == Decimal("25.5")
    assert snap.anuncios[0].es_merchant


def test_snapshot_p2p_con_side_invalido_va_a_dlq(validador):
    from tests.conftest import evento_snapshot_p2p

    evento = evento_snapshot_p2p(side="LONG")

    with pytest.raises(EventoInvalido):
        validador.validar_snapshot_p2p(evento)


def test_snapshot_p2p_sin_anuncios_es_invalido(validador):
    from tests.conftest import evento_snapshot_p2p

    evento = evento_snapshot_p2p(ads=[])

    with pytest.raises(EventoInvalido):
        validador.validar_snapshot_p2p(evento)
