"""Modelo de dominio: un indicador calculado en un instante dado."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

# Nombres canónicos de los indicadores de fase 1 (derivados de la tasa oficial).
# Los P2P (brecha, spreads, volúmenes, profundidad) llegan con ingestor-binance.
OFFICIAL_RATE = "official_rate"
OFFICIAL_RATE_CHANGE_ABS = "official_rate_change_abs"
OFFICIAL_RATE_CHANGE_PCT = "official_rate_change_pct"


@dataclass(frozen=True, slots=True)
class Indicador:
    """Un valor de indicador para una moneda en un instante (`as_of`).

    `calc_version` versiona la fórmula que lo produjo (RF-3: reproducibilidad).
    """

    nombre: str
    moneda: str
    valor: Decimal
    as_of: datetime
    calc_version: int
