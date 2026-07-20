---
type: Metric
title: Microestructura P2P — indicadores de señal
description: Spread BUY↔SELL, ratio oferta/demanda, momentum del bid (3 h) y drenaje de oferta (6 h) — el tablero cuya combinación anticipa movimientos del mercado.
tags: [indicador, implementado, p2p, señales]
timestamp: 2026-07-20T00:00:00Z
---

# Microestructura P2P

Indicadores entre lados y de ventana móvil que el indicator-engine (fase 2)
recalcula ante cada [p2p.snapshot](../events/p2p-snapshot.md). Complementan el
[precio de referencia](precio-referencia-p2p.md) y la
[brecha](brecha-cambiaria.md) con la información que en el backtest resultó
*anticipatoria* — la que se necesita para el motor de señales (RF-4).

| Indicador | Definición | Se emite al procesar |
|---|---|---|
| `p2p_spread_pct` | (mediana BUY − mediana SELL) / mediana SELL × 100 | cualquier lado, con el opuesto ≤ 15 min |
| `p2p_ratio_oferta_demanda` | liquidez BUY (asks) / liquidez SELL (bids) | cualquier lado, con el opuesto ≤ 15 min |
| `p2p_momentum_bid_3h_pct` | Δ% de la mediana SELL vs. ~3 h atrás | snapshots SELL |
| `p2p_drenaje_oferta_6h_pct` | Δ% de la liquidez BUY vs. ~6 h atrás | snapshots BUY |

Con hueco de captura (histórico más viejo que ventana + 1 h) las ventanas se
omiten; con `confianza_baja` (> 30 % outliers) se suprimen todas — el rastro
queda en `p2p_outliers_pct_{lado}`.

## Umbrales de señal (backtest 11–20 jul 2026, 208 h)

Percentiles de referencia — spread p10/p50/p90: 0,55/0,86/2,13 % · ratio:
0,18/0,47/1,87 · liquidez asks: 317 k/737 k/1.989 k USDT.

- **Arranque alcista**: momentum bid cruza de negativo a **> +0,5 %** con
  drenaje de oferta **< −40 %/6 h** y ratio **< 0,3**. (Se observó en el
  arranque del 13-jul y en la absorción del 20-jul.)
- **Techo inminente**: momentum bid **> +1,5 %** + spread **< 0,5 %** + ratio
  **< 0,2** simultáneos. (Una sola aparición: el pico exacto de 884,4 el 15-jul;
  sin falsos positivos en la serie.)
- **Corrección inminente**: ratio **> 2** (muro de oferta) con momentum bid
  **< −1 %**. (Anticipó el flush del 16-jul con 6–12 h.)
- Un muro de oferta que se **absorbe sin caída del precio** (ratio > 1,5 que
  revierte a < 0,5 en horas con mediana estable) es continuación alcista, no
  techo (20-jul).

Estos umbrales son el punto de partida empírico del motor de reglas de señales
(config YAML versionada, RF-4) — se recalibran con más historia.
