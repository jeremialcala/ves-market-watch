---
type: TimescaleDB Hypertable
title: historical_market_snapshots
description: Snapshots históricos del mercado USDT/VES cargados desde exports externos, con detalle por banco en JSONB. Sin retención (histórico permanente).
resource: ../../apps/ingestor-historico/db/migrations/001_historical_snapshots.sql
tags: [historico, implementada]
timestamp: 2026-07-11T00:00:00Z
---

# historical_market_snapshots

Hypertable particionada por `captured_at`, **sin política de retención** (histórico
permanente; datos públicos de mercado, clasificación Interno). Escrita solo por
[ingestor-historico](../services/ingestor-historico.md) (ADR-0013); inmutable por
diseño (`ON CONFLICT DO NOTHING`, nunca upsert).

## Esquema

| Columna | Tipo | Descripción |
|---|---|---|
| `captured_at` | timestamptz | Instante de la observación (PK con `source_id`) |
| `source_id` | text | ID del sistema origen (ObjectId) o hash determinista de la fila |
| `asset` / `fiat` | text | Par (default USDT / VES) |
| `base_weighted_avg` | numeric | Promedio ponderado base del top de órdenes (> 0) |
| `total_order_size` | numeric | Volumen total de órdenes del snapshot |
| `banks` | jsonb | Por banco: `rate`, `volume`, `low_liquidity`, `available` |
| `extra` | jsonb | Columnas del export no reconocidas por el mapeo (crudas) |
| `source_file` | text | Export de origen (trazabilidad de la carga) |
| `loaded_at` | timestamptz | Momento de la carga |

Consulta típica por banco: `(banks->'Banesco'->>'rate')::numeric`.
