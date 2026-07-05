---
type: Index
title: Indicadores financieros
description: Métricas que produce el indicator-engine a partir de la tasa oficial y el mercado P2P.
timestamp: 2026-07-05T00:00:00Z
---

# Indicadores

Definiciones completas: PRD `../../docs/01-requirements/motor-indicadores.md`.
Todos diseñados, sin implementar (dependen del [indicator-engine](../services/indicator-engine.md)).

| Indicador | Concepto |
|---|---|
| Brecha cambiaria BCV↔P2P (abs y %) | [brecha-cambiaria](brecha-cambiaria.md) |
| Precio de referencia P2P (mediana / VWAP top-N) | [precio-referencia-p2p](precio-referencia-p2p.md) |
| Spread de compra / venta | distancia del mejor precio de cada lado al precio de referencia |
| Volumen agregado por lado | suma de cantidades disponibles en un snapshot |
| Profundidad de mercado | volumen acumulado por banda de precio (0,5 %) |
| Variación intradía | Δ del precio de referencia vs. apertura del día (VET) |
| Tendencia de liquidez | pendiente de volumen/profundidad en ventana móvil |
| Señales de oportunidad | reglas configurables sobre los anteriores → [signals.emitted](../events/signals-emitted.md) |
