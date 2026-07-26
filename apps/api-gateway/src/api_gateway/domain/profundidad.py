"""Profundidad del mercado P2P por bandas de precio (funciones puras).

Proyección de lectura sobre el último snapshot crudo minimizado
(`p2p_snapshots_raw.raw`, ADR-0011): niveles acumulados en bandas de 0,5 %
desde el mejor precio del lado. Es una proyección del gateway, no un
indicador del engine: cuando exista la hypertable `p2p_top_of_book`
(architecture.md, planificada) esta lógica migra al indicator-engine
(ADR-0016).

Semántica de lados (perspectiva del taker, ADR-0005): en BUY el taker compra
USDT (mejor precio = el más bajo); en SELL el taker vende USDT (mejor precio
= el más alto).
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation


def _precio_y_volumen(item: dict) -> tuple[Decimal, Decimal] | None:
    """Extrae (precio, volumen disponible en USDT) de un item crudo minimizado
    (`{adv: {...}, advertiser: {...}}`). Item ilegible → se descarta (robustez
    ante variaciones de la fuente; el crudo es dato no confiable, A08)."""
    adv = item.get("adv") or {}
    try:
        precio = Decimal(str(adv["price"]))
        volumen = Decimal(str(adv.get("surplusAmount", "0")))
    except (KeyError, InvalidOperation, TypeError):
        return None
    if precio <= 0 or volumen < 0:
        return None
    return precio, volumen


def calcular_profundidad(
    items: list[dict], side: str, band_pct: Decimal, niveles: int
) -> list[dict]:
    """Niveles `{price_band, cum_volume}` del contrato REST (`DepthLevel`).

    `price_band` es el límite exterior de cada banda (peor precio incluido en
    ella); `cum_volume` acumula el volumen desde el mejor precio hasta esa
    banda. Sin anuncios legibles → lista vacía (nunca se inventa dato, A10).
    """
    puntos = [p for p in (_precio_y_volumen(i) for i in items) if p is not None]
    if not puntos or niveles <= 0:
        return []

    compra = side.upper() == "BUY"
    # BUY: de menor a mayor precio; SELL: de mayor a menor.
    puntos.sort(key=lambda pv: pv[0], reverse=not compra)
    mejor = puntos[0][0]
    paso = mejor * band_pct / Decimal(100)
    if paso == 0:
        return []

    bandas: list[dict] = []
    acumulado = Decimal(0)
    idx = 0
    for n in range(1, niveles + 1):
        limite = mejor + paso * n if compra else mejor - paso * n
        while idx < len(puntos) and (
            puntos[idx][0] <= limite if compra else puntos[idx][0] >= limite
        ):
            acumulado += puntos[idx][1]
            idx += 1
        bandas.append({"price_band": str(limite), "cum_volume": str(acumulado)})
        if idx >= len(puntos):
            break
    return bandas
