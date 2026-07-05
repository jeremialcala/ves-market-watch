---
type: TimescaleDB Table
title: official_rate_source_health
description: Estado operativo de la fuente BCV — contador de fallos consecutivos y marca stale. Separa la salud de la fuente de los datos de dominio.
resource: ../../apps/ingestor-bcv/db/migrations/001_official_rates.sql
tags: [bcv, implementada, observabilidad]
timestamp: 2026-07-05T00:00:00Z
---

# official_rate_source_health

Una fila por fuente (PK `source`). Materializa la separación dominio/operación del
ADR-0008: la frescura de la referencia oficial se pregunta aquí, no contando eventos.

## Esquema

| Columna | Tipo | Descripción |
|---|---|---|
| `source` | text | Identificador de la fuente (`BCV`) |
| `consecutive_failures` | integer | Fallos seguidos de fetch/parseo; un éxito lo reinicia |
| `last_success_at` / `last_failure_at` | timestamptz | Últimos resultados |
| `last_error` | text | Detalle del último fallo |
| `stale_since` | timestamptz | Desde cuándo la referencia se considera desactualizada |

Al llegar a `FAILURE_THRESHOLD` (3): alerta + `stale_since`; los indicadores propagan
`official_stale=true` (ADR-0007). Escribe: [ingestor-bcv](../services/ingestor-bcv.md).
