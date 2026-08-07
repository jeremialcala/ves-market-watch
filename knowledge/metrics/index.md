---
type: Index
title: Indicadores financieros
description: Métricas que produce el indicator-engine a partir de la tasa oficial y el mercado P2P.
timestamp: 2026-07-26T00:00:00Z
---

# Indicadores

Definiciones completas: PRD `../../docs/01-requirements/motor-indicadores.md`.
Implementados en el [indicator-engine](../services/indicator-engine.md) —
fase 1: `official_rate` y su variación abs/% por moneda; fase 2 (2026-07-20):
los P2P por snapshot y lado (`p2p_mediana`, `p2p_vwap`, `p2p_mejor_precio` y su
par `p2p_mejor_precio_filtrado`,
`p2p_liquidez`, `p2p_merchants_pct`, `p2p_outliers_pct`, `p2p_brecha_abs/pct`)
más la microestructura entre lados.

| Indicador | Concepto |
|---|---|
| Brecha cambiaria BCV↔P2P (abs y %) | [brecha-cambiaria](brecha-cambiaria.md) — implementada |
| Precio de referencia P2P (mediana / VWAP top-N) | [precio-referencia-p2p](precio-referencia-p2p.md) — implementado |
| Microestructura P2P (spread, ratio O/D, momentum bid, drenaje de oferta) | [microestructura-p2p](microestructura-p2p.md) — implementada, con umbrales de señal |
| Volumen agregado por lado | `p2p_liquidez_{buy,sell}` — implementado |
| Profundidad de mercado | volumen acumulado por banda de precio (0,5 %) — pendiente |
| Variación intradía | Δ vs. apertura del día operativo (VET, UTC−4 fijo) — **derivada en el cliente** desde 2026-07-29 para TODOS los indicadores, no solo el precio de referencia ([web-spa](../services/web-spa.md), `lib/intradia.ts`); no está persistida como indicador del motor |
| Señales de oportunidad | reglas configurables sobre los anteriores → [signals.emitted](../events/signals-emitted.md) — implementadas (motor de reglas RF-4/ADR-0015, emite `signals.emitted` desde 2026-07-22; la recalibración HITL de umbrales queda como evolución) |
| Lectura de indicadores (banda, escala, proximidad) | [lectura-de-indicadores](lectura-de-indicadores.md) — implementada (RF-6/ADR-0019, emite [analysis.updated](../events/analysis-updated.md) desde 2026-08-01). No es un indicador nuevo: es cómo se leen los anteriores |
| Lectura de mercado (régimen, atribución, afirmaciones) | [lectura-de-mercado](lectura-de-mercado.md) — implementada (RF-7/ADR-0021, en `reading` del mismo [analysis.updated](../events/analysis-updated.md) desde 2026-08-01). Un escalón por encima: lee el mercado como un todo, no cada medidor |
