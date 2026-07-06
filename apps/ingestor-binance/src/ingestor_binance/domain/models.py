"""Modelo de dominio del mercado P2P."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import StrEnum


class Lado(StrEnum):
    """Lado del mercado desde la perspectiva del taker (parámetro `tradeType`
    del endpoint): BUY = anuncios donde se puede COMPRAR el asset (publicados
    por vendedores), SELL = donde se puede VENDER. El campo `adv.tradeType`
    de la respuesta trae la perspectiva opuesta (la del anunciante)."""

    BUY = "BUY"
    SELL = "SELL"


@dataclass(frozen=True, slots=True)
class Anuncio:
    """Anuncio P2P normalizado. Los outliers se etiquetan aquí (PRD escenario
    negativo 2); el filtrado final es responsabilidad del indicator-engine."""

    adv_no: str
    precio: Decimal  # fiat por unidad de asset (VES/USDT)
    cantidad_disponible: Decimal  # en asset (surplusAmount)
    limite_min: Decimal  # en fiat, por transacción
    limite_max: Decimal  # en fiat, por transacción
    metodos_pago: tuple[str, ...]
    es_merchant: bool
    # Pseudónimo HMAC del anunciante (ADR-0011); None si la fuente no trajo
    # el identificador estable. El alias/ID crudo nunca llega hasta aquí.
    merchant_ref: str | None = None
    outlier: bool = False


@dataclass(frozen=True, slots=True)
class SnapshotP2P:
    lado: Lado
    asset: str
    fiat: str
    capturado_en: datetime
    parcial: bool  # true si alguna página del top-K no llegó (escenario 2)
    anuncios: tuple[Anuncio, ...]
