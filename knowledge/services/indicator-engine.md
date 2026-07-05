---
type: Service
title: indicator-engine
description: Motor reactivo que consume eventos de mercado y produce indicadores y señales — diseñado, sin implementar.
resource: ../../apps/indicator-engine/
tags: [python, diseñado, indicadores]
timestamp: 2026-07-05T00:00:00Z
---

# indicator-engine

**Estado: diseñado, sin código.** Consume [p2p.snapshot](../events/p2p-snapshot.md) y
[official.rate.updated](../events/official-rate-updated.md); calcula los
[indicadores](../metrics/index.md) y evalúa reglas de señales (config YAML versionada).
Publica [indicators.updated](../events/indicators-updated.md) y
[signals.emitted](../events/signals-emitted.md).

## Propiedades de diseño
- Idempotencia por `event_id`; coalescing ante backlog (último snapshot por lado).
- > 30 % outliers en snapshot → `low_confidence`, señales suprimidas.
- Tasa oficial stale → `official_stale=true` propagado (ADR-0007).
- Reproducibilidad: `calc_version` + tasa as-of `captured_at` (ADR-0009).

## Referencias
- PRD: `../../docs/01-requirements/motor-indicadores.md` · Amenazas T2, T5, T10.

## Pendiente (HITL)
- Calibrar umbrales de señales con datos reales.
