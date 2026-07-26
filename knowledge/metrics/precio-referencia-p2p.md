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
El mejor precio sin filtrar (top of book) se conserva aparte para profundidad de mercado.
