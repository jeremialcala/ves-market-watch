"""Modelo de dominio: un indicador calculado en un instante dado."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

# Nombres canónicos de los indicadores de fase 1 (derivados de la tasa oficial).
OFFICIAL_RATE = "official_rate"
OFFICIAL_RATE_CHANGE_ABS = "official_rate_change_abs"
OFFICIAL_RATE_CHANGE_PCT = "official_rate_change_pct"

# Fase 2 — indicadores P2P por lado (sufijo `_buy`/`_sell` vía `nombre_por_lado`).
# Definiciones canónicas en knowledge/metrics/.
P2P_MEDIANA = "p2p_mediana"
P2P_VWAP = "p2p_vwap"
P2P_MEJOR_PRECIO = "p2p_mejor_precio"
P2P_LIQUIDEZ = "p2p_liquidez"
P2P_MERCHANTS_PCT = "p2p_merchants_pct"
P2P_OUTLIERS_PCT = "p2p_outliers_pct"
P2P_BRECHA_ABS = "p2p_brecha_abs"
P2P_BRECHA_PCT = "p2p_brecha_pct"

# Fase 2 — microestructura entre lados (sin sufijo: BUY vs SELL en un solo valor).
P2P_SPREAD_PCT = "p2p_spread_pct"
P2P_RATIO_OFERTA_DEMANDA = "p2p_ratio_oferta_demanda"
P2P_MOMENTUM_BID_3H_PCT = "p2p_momentum_bid_3h_pct"
P2P_DRENAJE_OFERTA_6H_PCT = "p2p_drenaje_oferta_6h_pct"


def nombre_por_lado(base: str, side: str) -> str:
    """`p2p_mediana` + `BUY` → `p2p_mediana_buy` (side ya validado por contrato)."""
    return f"{base}_{side.lower()}"


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


@dataclass(frozen=True, slots=True)
class AnuncioP2P:
    """Proyección mínima de un anuncio del evento `p2p.snapshot` que el motor
    necesita para calcular indicadores. El etiquetado de outliers viene hecho
    por el ingestor (el filtrado sí es responsabilidad de este motor)."""

    precio: Decimal
    cantidad_disponible: Decimal
    outlier: bool
    es_merchant: bool
