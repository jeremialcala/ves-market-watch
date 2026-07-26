"""Tests de los cálculos puros del dominio."""

from decimal import Decimal

import pytest

from indicator_engine.domain.calculos import calcular_brecha, calcular_variacion


def test_brecha_segun_definicion_canonica():
    # Ejemplo de knowledge/metrics/brecha-cambiaria.md con valores reales.
    brecha = calcular_brecha(Decimal("900.00"), Decimal("667.05"))

    assert brecha.gap_abs == Decimal("232.95")
    assert brecha.gap_pct == Decimal("232.95") / Decimal("667.05") * 100


def test_brecha_negativa_cuando_p2p_bajo_la_oficial():
    brecha = calcular_brecha(Decimal("600.00"), Decimal("667.05"))

    assert brecha.gap_abs == Decimal("-67.05")
    assert brecha.gap_pct < 0


def test_brecha_con_tasa_oficial_no_positiva_falla():
    with pytest.raises(ValueError, match="no positiva"):
        calcular_brecha(Decimal("900.00"), Decimal("0"))


def test_variacion_al_alza():
    variacion = calcular_variacion(Decimal("700.00"), Decimal("667.05"))

    assert variacion.delta_abs == Decimal("32.95")
    assert variacion.delta_pct == Decimal("32.95") / Decimal("667.05") * 100


def test_variacion_a_la_baja_es_negativa():
    variacion = calcular_variacion(Decimal("650.00"), Decimal("667.05"))

    assert variacion.delta_abs == Decimal("-17.05")
    assert variacion.delta_pct < 0


def test_variacion_sin_cambio_es_cero():
    variacion = calcular_variacion(Decimal("667.05"), Decimal("667.05"))

    assert variacion.delta_abs == 0
    assert variacion.delta_pct == 0


def test_variacion_con_anterior_no_positivo_falla():
    with pytest.raises(ValueError, match="no positivo"):
        calcular_variacion(Decimal("700.00"), Decimal("0"))
