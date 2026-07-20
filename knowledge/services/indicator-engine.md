---
type: Service
title: indicator-engine
description: Motor reactivo que consume eventos de mercado y produce indicadores — fases 1 (tasas oficiales) y 2 (P2P/microestructura) implementadas; motor de reglas de señales pendiente.
resource: ../../apps/indicator-engine/
tags: [python, implementado-parcial, indicadores]
timestamp: 2026-07-20T00:00:00Z
---

# indicator-engine

**Fases 1 y 2 implementadas.** Consumidor de
[official.rate.updated](../events/official-rate-updated.md) (fase 1) y de
[p2p.snapshot](../events/p2p-snapshot.md) (fase 2, 2026-07-20), despachados por
`event_type`. Valida cada evento contra su schema, deduplica por `event_id`, persiste en
[indicators](../tables/indicators.md) con `calc_version` y publica
[indicators.updated](../events/indicators-updated.md) con `triggered_by` (trazabilidad).
De la tasa oficial deriva `official_rate` y su variación abs/%; de cada snapshot P2P, la
[referencia del lado](../metrics/precio-referencia-p2p.md) (mediana, VWAP, mejor precio,
liquidez, merchants%, outliers%), la [brecha](../metrics/brecha-cambiaria.md) as-of y la
[microestructura](../metrics/microestructura-p2p.md) (spread, ratio O/D, momentum, drenaje).
Python 3.12, hexagonal, mismas convenciones que [ingestor-bcv](ingestor-bcv.md).

## Propiedades implementadas
- Idempotencia por `event_id` persistente (tabla `processed_events`).
- Schema inválido o fallo de procesamiento → DLQ `market.events.dlq` + alerta (A05/A08).
- `official_stale=true` si la captura supera 6 h (`STALE_THRESHOLD_HOURS`, ADR-0007).
- Estado del motor = su propio histórico (sin estado en memoria; sobrevive reinicios).
  Los indicadores de ventana (momentum 3 h, drenaje 6 h) se calculan sobre ese histórico
  vía repositorio, no en memoria (ADR-0014).
- Microestructura entre lados con frescura del lado opuesto (≤ 15 min); `confianza_baja`
  (> 30 % outliers) suprime las señales dejando rastro en `p2p_outliers_pct` (ADR-0014).
- CLI: `python -m indicator_engine [--drain]`. 49 tests (unit/contract/integration/e2e).

## Referencias
- PRD: `../../docs/01-requirements/motor-indicadores.md` · Diseño: `../../apps/indicator-engine/docs/design.md`
- Contratos: `../../schemas/` · ADR-0014 (microestructura P2P) · Amenazas T2, T5, T10.

## Pendiente (fase de señales)
- Motor de reglas de señales (YAML versionado, RF-4) y el evento
  [signals.emitted](../events/signals-emitted.md) / `schemas/signal.v1.json`;
  calibrar umbrales con datos reales (HITL). Los indicadores de microestructura que
  alimentan esas reglas ya están implementados ([microestructura P2P](../metrics/microestructura-p2p.md)).
