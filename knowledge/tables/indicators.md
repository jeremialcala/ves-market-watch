---
type: TimescaleDB Hypertable
title: indicators
description: Serie de tiempo de indicadores calculados (formato largo) + processed_events para idempotencia del consumidor.
resource: ../../apps/indicator-engine/db/migrations/001_indicators.sql
tags: [indicadores, implementada]
timestamp: 2026-07-05T00:00:00Z
---

# indicators

Hypertable particionada por `as_of`, **formato largo**: una fila por
indicador/moneda/instante. El estado del motor es este histórico — el "último valor"
de un indicador es su fila más reciente (sobrevive reinicios, ADR-0009 en espíritu).

## Esquema

| Columna | Tipo | Descripción |
|---|---|---|
| `as_of` | timestamptz | Instante del dato origen (captura BCV / snapshot P2P) |
| `indicator` | text | Nombre canónico (`official_rate`, `official_rate_change_abs/pct`; fase 2: brecha, spreads…) |
| `currency` | text | Código ISO 4217 |
| `value` | numeric(24,8) | Valor (las variaciones pueden ser negativas) |
| `calc_version` | integer | Versión de la fórmula (RF-3, reproducibilidad) |
| `metadata` | jsonb | Reservado (banderas de calidad en fase 2) |

PK `(as_of, indicator, currency)` — la reentrega de un evento no duplica filas
(`ON CONFLICT DO NOTHING`).

## processed_events (misma migración)

`event_id uuid PK, event_type, processed_at` — deduplicación del consumidor
(escenario negativo 2 del PRD, A08).

- Escribe: [indicator-engine](../services/indicator-engine.md) (INSERT/SELECT).
  Leerá: api-gateway (solo lectura, `/indicators/*`).
