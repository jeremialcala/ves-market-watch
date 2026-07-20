"""Cálculos puros de indicadores — sin IO, deterministas y testeables.

Definiciones canónicas en `knowledge/metrics/`.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from decimal import Decimal
from typing import Sequence

from indicator_engine.domain.models import AnuncioP2P

# Si más de este % del snapshot es outlier, la confianza es baja y las señales
# que dependen del precio se suprimen (knowledge/metrics/precio-referencia-p2p.md).
UMBRAL_CONFIANZA_OUTLIERS_PCT = Decimal("30")


@dataclass(frozen=True, slots=True)
class Brecha:
    gap_abs: Decimal
    gap_pct: Decimal


@dataclass(frozen=True, slots=True)
class ReferenciaP2P:
    """Precio representativo de un lado del mercado P2P y su contexto de calidad."""

    mediana: Decimal
    vwap: Decimal
    mejor_precio: Decimal
    liquidez: Decimal
    merchants_pct: Decimal
    outliers_pct: Decimal
    confianza_baja: bool


@dataclass(frozen=True, slots=True)
class Variacion:
    delta_abs: Decimal
    delta_pct: Decimal


def calcular_brecha(precio_referencia_p2p: Decimal, tasa_oficial: Decimal) -> Brecha:
    """Brecha cambiaria BCV↔P2P (knowledge/metrics/brecha-cambiaria.md):

        gap_abs = precio_referencia_p2p − tasa_oficial
        gap_pct = gap_abs / tasa_oficial × 100

    Activo desde fase 2 (requiere referencia P2P del ingestor-binance); la
    fórmula vive aquí desde fase 1 para fijar el contrato de cálculo.
    """
    if tasa_oficial <= 0:
        raise ValueError(f"tasa oficial no positiva: {tasa_oficial}")
    gap_abs = precio_referencia_p2p - tasa_oficial
    return Brecha(gap_abs=gap_abs, gap_pct=gap_abs / tasa_oficial * 100)


def calcular_variacion(actual: Decimal, anterior: Decimal) -> Variacion:
    """Variación de un valor frente al anterior conocido (abs y %)."""
    if anterior <= 0:
        raise ValueError(f"valor anterior no positivo: {anterior}")
    delta = actual - anterior
    return Variacion(delta_abs=delta, delta_pct=delta / anterior * 100)


def calcular_referencia_p2p(anuncios: Sequence[AnuncioP2P]) -> ReferenciaP2P:
    """Precio de referencia de un lado (knowledge/metrics/precio-referencia-p2p.md):

    - mediana y VWAP sobre los anuncios NO outlier (robustez frente a T2);
    - el mejor precio (top of book) se conserva sin filtrar, aparte;
    - `confianza_baja` si > 30 % del snapshot es outlier — las señales aguas
      abajo se suprimen, el precio se publica marcado, nunca en silencio.
    """
    if not anuncios:
        raise ValueError("snapshot sin anuncios")
    limpios = [a for a in anuncios if not a.outlier]
    if not limpios:
        raise ValueError("snapshot sin anuncios utilizables: todos son outliers")

    outliers_pct = Decimal(len(anuncios) - len(limpios)) / Decimal(len(anuncios)) * 100
    liquidez = sum((a.cantidad_disponible for a in limpios), Decimal(0))
    if liquidez > 0:
        vwap = sum(a.precio * a.cantidad_disponible for a in limpios) / liquidez
    else:
        vwap = statistics.median(a.precio for a in limpios)

    return ReferenciaP2P(
        mediana=statistics.median(a.precio for a in limpios),
        vwap=vwap,
        mejor_precio=anuncios[0].precio,
        liquidez=liquidez,
        merchants_pct=Decimal(sum(1 for a in limpios if a.es_merchant))
        / Decimal(len(limpios))
        * 100,
        outliers_pct=outliers_pct,
        confianza_baja=outliers_pct > UMBRAL_CONFIANZA_OUTLIERS_PCT,
    )


def calcular_spread_pct(mediana_buy: Decimal, mediana_sell: Decimal) -> Decimal:
    """Spread entre lados: (BUY − SELL) / SELL × 100. Negativo = libro cruzado."""
    if mediana_sell <= 0:
        raise ValueError(f"mediana SELL no positiva: {mediana_sell}")
    return (mediana_buy - mediana_sell) / mediana_sell * 100


def calcular_ratio_oferta_demanda(liquidez_buy: Decimal, liquidez_sell: Decimal) -> Decimal:
    """Liquidez de asks (lado BUY) sobre liquidez de bids (lado SELL).

    < 0,3 históricamente precede corridas alcistas; > 2 precede correcciones
    (backtest 11–20 jul 2026, knowledge/metrics/microestructura-p2p.md).
    """
    if liquidez_sell <= 0:
        raise ValueError(f"liquidez SELL no positiva: {liquidez_sell}")
    return liquidez_buy / liquidez_sell
