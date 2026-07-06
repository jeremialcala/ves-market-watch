"""Cálculos puros de indicadores — sin IO, deterministas y testeables.

Definiciones canónicas en `knowledge/metrics/`.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True, slots=True)
class Brecha:
    gap_abs: Decimal
    gap_pct: Decimal


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
