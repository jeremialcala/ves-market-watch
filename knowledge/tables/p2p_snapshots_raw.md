---
type: TimescaleDB Hypertable
title: p2p_snapshots_raw
description: Snapshots crudos del mercado P2P (JSONB completo) para reproceso, con retención nativa de 90 días.
resource: ../../apps/ingestor-binance/db/migrations/001_p2p_snapshots.sql
tags: [binance, p2p, implementada]
timestamp: 2026-07-06T00:00:00Z
---

# p2p_snapshots_raw

Hypertable particionada por `captured_at` con `add_retention_policy(90 días)`
(RF-5: reproceso con nuevas versiones de cálculo sin re-consultar la fuente).

## Esquema

| Columna | Tipo | Descripción |
|---|---|---|
| `captured_at` | timestamptz | Instante de la captura |
| `side` | text | BUY / SELL (perspectiva del taker) |
| `asset` / `fiat` | text | Par capturado (USDT / VES) |
| `partial` | boolean | true si alguna página del top-K no llegó |
| `ad_count` | integer | Anuncios capturados |
| `raw` | jsonb | Items `{adv, advertiser}` con el anunciante **minimizado**: sin alias ni identificadores pseudónimos (data-classification), solo `userType` y métricas públicas |

PK `(captured_at, side)`; reentrega/duplicado → `ON CONFLICT DO NOTHING`.

- Escribe: [ingestor-binance](../services/ingestor-binance.md) (INSERT).
  Leerá: reproceso batch y análisis (futuro).
