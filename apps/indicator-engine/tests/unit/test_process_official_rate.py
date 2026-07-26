"""Tests del caso de uso ProcesarTasaOficial con adaptadores en memoria."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from indicator_engine.adapters.memory import (
    CollectingEventPublisher,
    InMemoryIndicatorRepository,
)
from indicator_engine.application.ports import TasaOficialRecibida
from indicator_engine.application.process_official_rate import ProcesarTasaOficial

AHORA = datetime(2026, 7, 6, 12, 0, tzinfo=UTC)


def _tasa(
    valor: str = "667.05",
    moneda: str = "USD",
    event_id: str = "11111111-1111-1111-1111-111111111111",
    capturada_hace: timedelta = timedelta(minutes=5),
) -> TasaOficialRecibida:
    return TasaOficialRecibida(
        event_id=event_id,
        moneda=moneda,
        valor=Decimal(valor),
        fecha_valor=date(2026, 7, 6),
        capturada_en=AHORA - capturada_hace,
    )


def _armar():
    repo = InMemoryIndicatorRepository()
    publisher = CollectingEventPublisher()
    caso = ProcesarTasaOficial(publisher, repo, calc_version=1, reloj=lambda: AHORA)
    return repo, publisher, caso


async def test_primera_tasa_produce_solo_official_rate():
    repo, publisher, caso = _armar()

    resultado = await caso.ejecutar(_tasa())

    assert [i.nombre for i in resultado.indicadores] == ["official_rate"]
    assert resultado.indicadores[0].valor == Decimal("667.05")
    assert len(repo.indicadores) == 1
    assert len(publisher.eventos) == 1
    assert "11111111-1111-1111-1111-111111111111" in repo.procesados


async def test_segunda_tasa_agrega_variacion_abs_y_pct():
    repo, publisher, caso = _armar()
    await caso.ejecutar(_tasa("667.05", event_id="11111111-1111-1111-1111-111111111111"))

    resultado = await caso.ejecutar(
        _tasa("700.00", event_id="22222222-2222-2222-2222-222222222222")
    )

    nombres = [i.nombre for i in resultado.indicadores]
    assert nombres == ["official_rate", "official_rate_change_abs", "official_rate_change_pct"]
    valores = {i.nombre: i.valor for i in resultado.indicadores}
    assert valores["official_rate_change_abs"] == Decimal("32.95")
    assert valores["official_rate_change_pct"] == Decimal("32.95") / Decimal("667.05") * 100


async def test_la_variacion_es_por_moneda():
    _, _, caso = _armar()
    await caso.ejecutar(_tasa("667.05", moneda="USD", event_id="1" * 8 + "-1111-1111-1111-" + "1" * 12))

    # Primera captura de EUR: sin referencia previa aunque USD ya exista.
    resultado = await caso.ejecutar(
        _tasa("763.19", moneda="EUR", event_id="2" * 8 + "-2222-2222-2222-" + "2" * 12)
    )

    assert [i.nombre for i in resultado.indicadores] == ["official_rate"]


async def test_evento_duplicado_no_reprocesa_ni_publica():
    repo, publisher, caso = _armar()
    await caso.ejecutar(_tasa())

    resultado = await caso.ejecutar(_tasa())  # mismo event_id

    assert resultado.duplicado
    assert resultado.indicadores == []
    assert len(repo.indicadores) == 1
    assert len(publisher.eventos) == 1


async def test_official_stale_cuando_la_captura_supera_el_umbral():
    _, publisher, caso = _armar()

    resultado = await caso.ejecutar(_tasa(capturada_hace=timedelta(hours=7)))

    assert resultado.official_stale
    assert publisher.eventos[0]["payload"]["official_stale"] is True


async def test_captura_fresca_no_es_stale():
    _, publisher, caso = _armar()

    resultado = await caso.ejecutar(_tasa(capturada_hace=timedelta(minutes=30)))

    assert not resultado.official_stale
    assert publisher.eventos[0]["payload"]["official_stale"] is False


async def test_evento_publicado_referencia_al_evento_origen():
    _, publisher, caso = _armar()

    await caso.ejecutar(_tasa())

    payload = publisher.eventos[0]["payload"]
    assert payload["triggered_by"] == "11111111-1111-1111-1111-111111111111"
    assert payload["indicators"][0] == {
        "indicator": "official_rate",
        "currency": "USD",
        "value": "667.05",
    }
