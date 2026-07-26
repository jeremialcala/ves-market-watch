---
type: Index
title: Indicadores financieros
description: Métricas que produce el indicator-engine a partir de la tasa oficial y el mercado P2P.
timestamp: 2026-07-05T00:00:00Z
---

# Indicadores

Definiciones completas: PRD `../../docs/01-requirements/motor-indicadores.md`.
Implementados en el [indicator-engine](../services/indicator-engine.md) —
fase 1: `official_rate` y su variación abs/% por moneda; fase 2 (2026-07-20):
los P2P por snapshot y lado (`p2p_mediana`, `p2p_vwap`, `p2p_mejor_precio`,
`p2p_liquidez`, `p2p_merchants_pct`, `p2p_outliers_pct`, `p2p_brecha_abs/pct`)
más la microestructura entre lados.

| Indicador | Concepto |
|---|---|
| Brecha cambiaria BCV↔P2P (abs y %) | [brecha-cambiaria](brecha-cambiaria.md) — implementada |
| Precio de referencia P2P (mediana / VWAP top-N) | [precio-referencia-p2p](precio-referencia-p2p.md) — implementado |
| Microestructura P2P (spread, ratio O/D, momentum bid, drenaje de oferta) | [microestructura-p2p](microestructura-p2p.md) — implementada, con umbrales de señal |
| Volumen agregado por lado | `p2p_liquidez_{buy,sell}` — implementado |
| Profundidad de mercado | volumen acumulado por banda de precio (0,5 %) — pendiente |
| Variación intradía | Δ del precio de referencia vs. apertura del día (VET) — pendiente |
| Señales de oportunidad | reglas configurables sobre los anteriores → [signals.emitted](../events/signals-emitted.md) — pendiente (umbrales iniciales en microestructura-p2p) |
