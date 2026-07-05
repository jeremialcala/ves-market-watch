---
type: TimescaleDB Hypertable
title: official_rates
description: Histórico completo (append-only, bitemporal) de las tasas oficiales capturadas del BCV. Una fila por captura y moneda.
resource: ../../apps/ingestor-bcv/db/migrations/001_official_rates.sql
tags: [bcv, implementada, bitemporal]
timestamp: 2026-07-05T00:00:00Z
---

# official_rates

Hypertable particionada por `captured_at`. **Toda** consulta al BCV deja fila (auditoría),
publique o no evento — ver [official.rate.updated](../events/official-rate-updated.md).

## Esquema

| Columna | Tipo | Descripción |
|---|---|---|
| `captured_at` | timestamptz | Cuándo lo supo el sistema (dimensión de conocimiento, ADR-0009) |
| `currency` | text | Código ISO 4217 (USD, EUR, CNY, TRY, RUB…) |
| `rate` | numeric(20,8) | Valor VES por unidad; CHECK > 0 |
| `value_date` | date | Fecha-valor declarada por el BCV (dimensión de validez) |
| `status` | text | `valid` (publicada si cambió) / `suspect` (retenida, HITL) / `stale` (marca administrativa) |
| `source` | text | `BCV` por defecto |

PK `(captured_at, currency)`; índice `(currency, captured_at DESC)`.

## Reglas
- **Append-only**: correcciones = fila nueva; vigente por `value_date` = mayor
  `captured_at` con `status='valid'` (ADR-0009).
- Escribe: [ingestor-bcv](../services/ingestor-bcv.md) (INSERT/SELECT).
  Leerá: indicator-engine y api-gateway (solo lectura).
- Retención ≥ 12 meses (clasificación: dato público).
