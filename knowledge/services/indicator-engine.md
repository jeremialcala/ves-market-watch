---
type: Service
title: indicator-engine
description: Motor reactivo que consume eventos de mercado y produce indicadores — fase 1 implementada (tasas oficiales); P2P y señales pendientes.
resource: ../../apps/indicator-engine/
tags: [python, implementado-parcial, indicadores]
timestamp: 2026-07-05T00:00:00Z
---

# indicator-engine

**Fase 1 implementada** — primer consumidor de
[official.rate.updated](../events/official-rate-updated.md). Valida cada evento contra
`schemas/official-rate.v1.json`, deduplica por `event_id`, calcula `official_rate` y su
variación abs/% por moneda, persiste en [indicators](../tables/indicators.md) con
`calc_version` y publica [indicators.updated](../events/indicators-updated.md) con
`triggered_by` (trazabilidad). Python 3.12, hexagonal, mismas convenciones que
[ingestor-bcv](ingestor-bcv.md).

## Propiedades implementadas
- Idempotencia por `event_id` persistente (tabla `processed_events`).
- Schema inválido o fallo de procesamiento → DLQ `market.events.dlq` + alerta (A05/A08).
- `official_stale=true` si la captura supera 6 h (`STALE_THRESHOLD_HOURS`, ADR-0007).
- Estado del motor = su propio histórico (sin estado en memoria; sobrevive reinicios).
- Fórmula de la [brecha](../metrics/brecha-cambiaria.md) en el dominio, lista para fase 2.
- CLI: `python -m indicator_engine [--drain]`. 26 tests (unit/contract/integration/e2e).

## Referencias
- PRD: `../../docs/01-requirements/motor-indicadores.md` · Diseño: `../../apps/indicator-engine/docs/design.md`
- Contratos: `../../schemas/` · Amenazas T2, T5, T10.

## Pendiente (fase 2 — requiere ingestor-binance)
- [p2p.snapshot](../events/p2p-snapshot.md): outliers, precio de referencia, brecha,
  spreads, volúmenes, profundidad, coalescing, `low_confidence`.
- Reglas de señales (YAML versionado) y [signals.emitted](../events/signals-emitted.md);
  calibrar umbrales con datos reales (HITL).
