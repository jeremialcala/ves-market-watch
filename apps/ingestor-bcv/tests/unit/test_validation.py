"""Tests de la validación de plausibilidad (RF-3, escenario negativo 2 del PRD)."""

from datetime import UTC, date, datetime
from decimal import Decimal

from ingestor_bcv.domain.models import TasaOficial
from ingestor_bcv.domain.validation import validar_plausibilidad

MAX_DELTA = Decimal("20")


def _tasa(valor: str, fecha: date = date(2026, 7, 6)) -> TasaOficial:
    return TasaOficial(
        moneda="USD",
        valor=Decimal(valor),
        fecha_valor=fecha,
        capturada_en=datetime.now(UTC),
    )


def test_primera_captura_sin_historia_es_valida():
    resultado = validar_plausibilidad(Decimal("667.05"), date(2026, 7, 6), None, MAX_DELTA)
    assert resultado.es_valida


def test_variacion_dentro_del_umbral_es_valida():
    ultima = _tasa("667.05")
    resultado = validar_plausibilidad(
        Decimal("700.00"), date(2026, 7, 7), ultima, MAX_DELTA
    )  # ~4.9 %
    assert resultado.es_valida


def test_variacion_mayor_al_umbral_es_sospechosa():
    ultima = _tasa("667.05")
    resultado = validar_plausibilidad(
        Decimal("900.00"), date(2026, 7, 7), ultima, MAX_DELTA
    )  # ~34.9 %
    assert not resultado.es_valida
    assert "variación" in resultado.motivo


def test_valor_no_positivo_es_sospechoso():
    resultado = validar_plausibilidad(Decimal("0"), date(2026, 7, 6), None, MAX_DELTA)
    assert not resultado.es_valida
    assert "no positivo" in resultado.motivo


def test_fecha_valor_que_retrocede_es_sospechosa():
    ultima = _tasa("667.05", fecha=date(2026, 7, 6))
    resultado = validar_plausibilidad(
        Decimal("668.00"), date(2026, 7, 1), ultima, MAX_DELTA
    )
    assert not resultado.es_valida
    assert "retrocede" in resultado.motivo


def test_umbral_es_configurable():
    ultima = _tasa("100")
    holgado = validar_plausibilidad(Decimal("140"), date(2026, 7, 7), ultima, Decimal("50"))
    estricto = validar_plausibilidad(Decimal("140"), date(2026, 7, 7), ultima, Decimal("5"))
    assert holgado.es_valida
    assert not estricto.es_valida
