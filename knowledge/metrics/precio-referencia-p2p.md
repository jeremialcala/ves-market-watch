---
type: Metric
title: Precio de referencia P2P
description: Precio representativo del mercado P2P por lado — mediana y VWAP del top-N de anuncios tras filtrar outliers.
tags: [indicador, diseñado, p2p]
timestamp: 2026-07-05T00:00:00Z
---

# Precio de referencia P2P

Por cada [p2p.snapshot](../events/p2p-snapshot.md) y lado (BUY/SELL):

1. Filtrar outliers del top-N por MAD/IQR (defensa contra anuncios manipulados, amenaza T2).
2. Calcular **mediana** (robusta) y **VWAP** (ponderada por cantidad disponible).
3. Si > 30 % del snapshot es outlier → `confidence=low`; las señales que dependan de
   este precio se suprimen.

Es el insumo de la [brecha cambiaria](brecha-cambiaria.md) y de los spreads.
4. **Mejor precio, en par.** `p2p_mejor_precio` es el top of book **literal, sin
   filtrar**: es lo que alguien está pidiendo de verdad y ocultarlo sería ocultar
   que hay un anuncio a 920. Junto a él va `p2p_mejor_precio_filtrado`, el mejor
   de los que sobreviven al filtro. **La diferencia entre los dos es el dato**:
   cuando coinciden, el escaparate ES el libro; cuando se separan, mide
   exactamente cuánto se aleja uno del otro.

   Hizo falta porque el sin filtrar solo contaba media verdad. Medido sobre 318
   snapshots por lado (6 h, 2026-08-07): en **SELL el primer anuncio estaba
   marcado como outlier en 103 de 318** —un tercio de las lecturas— y en BUY en 1
   de 318. Reproducido sobre el snapshot real de las 03:40 VET: 871 de escaparate
   contra 860 de libro, **11 VES de diferencia** por un anuncio de 141 USDT.

   Filtrar el indicador habría destruido su significado; el par deja las dos
   verdades a la vista. Por lo mismo, el sin filtrar **no compite** en «qué se
   movió» del SPA: un anuncio manipulado no es movimiento de mercado.

**Ambos dependen del orden de la fuente.** Binance devuelve el mejor primero
según el lado —en BUY el más barato, en SELL el más caro— y se comprobó contra el
crudo: el primero fue el mínimo en 318/318 snapshots BUY y el máximo en 318/318
SELL. Filtrar preserva el orden, así que el mejor filtrado es el primero de los
limpios por el mismo criterio.
