"""Tests de los cálculos puros de fase 2 (referencia P2P y microestructura)."""

from decimal import Decimal

import pytest

from indicator_engine.domain.calculos import (
    calcular_ratio_oferta_demanda,
    calcular_referencia_p2p,
    calcular_spread_pct,
)
from indicator_engine.domain.models import AnuncioP2P


def _anuncio(
    precio: str,
    cantidad: str = "100",
    outlier: bool = False,
    es_merchant: bool = False,
) -> AnuncioP2P:
    return AnuncioP2P(
        precio=Decimal(precio),
        cantidad_disponible=Decimal(cantidad),
        outlier=outlier,
        es_merchant=es_merchant,
    )


def test_mediana_y_vwap_excluyen_outliers():
    referencia = calcular_referencia_p2p(
        [
            _anuncio("850", "100"),
            _anuncio("852", "300"),
            _anuncio("9999", "1000", outlier=True),
        ]
    )
    assert referencia.mediana == Decimal("851")
    # VWAP solo sobre los limpios: (850·100 + 852·300) / 400
    assert referencia.vwap == (Decimal("850") * 100 + Decimal("852") * 300) / 400
    assert referencia.liquidez == Decimal("400")


def test_mejor_precio_es_top_of_book_sin_filtrar():
    # El primer anuncio del snapshot es el mejor precio del libro aunque sea
    # outlier: se conserva aparte (knowledge/metrics/precio-referencia-p2p.md).
    referencia = calcular_referencia_p2p(
        [_anuncio("700", outlier=True), _anuncio("850"), _anuncio("851"), _anuncio("852")]
    )
    assert referencia.mejor_precio == Decimal("700")
    assert referencia.mediana == Decimal("851")


def test_confianza_baja_cuando_mas_de_30_pct_outliers():
    limpios = [_anuncio("850")] * 6
    marcados = [_anuncio("9999", outlier=True)] * 4
    referencia = calcular_referencia_p2p(limpios + marcados)
    assert referencia.outliers_pct == Decimal("40")
    assert referencia.confianza_baja


def test_confianza_ok_en_el_umbral_exacto():
    referencia = calcular_referencia_p2p(
        [_anuncio("850")] * 7 + [_anuncio("9999", outlier=True)] * 3
    )
    assert referencia.outliers_pct == Decimal("30")
    assert not referencia.confianza_baja


def test_pct_merchants_sobre_los_limpios():
    referencia = calcular_referencia_p2p(
        [
            _anuncio("850", es_merchant=True),
            _anuncio("851"),
            _anuncio("9999", outlier=True, es_merchant=True),
        ]
    )
    assert referencia.merchants_pct == Decimal("50")


def test_todos_outliers_lanza():
    with pytest.raises(ValueError, match="outliers"):
        calcular_referencia_p2p([_anuncio("9999", outlier=True)])


def test_snapshot_vacio_lanza():
    with pytest.raises(ValueError, match="sin anuncios"):
        calcular_referencia_p2p([])


def test_spread_pct_buy_sobre_sell():
    assert calcular_spread_pct(Decimal("860"), Decimal("850")) == (
        Decimal("10") / Decimal("850") * 100
    )


def test_spread_negativo_si_libro_cruzado():
    assert calcular_spread_pct(Decimal("840"), Decimal("850")) < 0


def test_ratio_oferta_demanda():
    assert calcular_ratio_oferta_demanda(Decimal("300"), Decimal("1200")) == Decimal("0.25")


def test_ratio_con_demanda_cero_lanza():
    with pytest.raises(ValueError):
        calcular_ratio_oferta_demanda(Decimal("300"), Decimal("0"))
