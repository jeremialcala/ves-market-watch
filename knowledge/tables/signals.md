---
type: TimescaleDB Hypertable
title: signals
description: Señales financieras emitidas por el motor de reglas (RF-4), con evidencia para trazabilidad y dedup por cooldown.
resource: ../../apps/indicator-engine/db/migrations/002_signals.sql
tags: [señales, implementada]
timestamp: 2026-07-22T00:00:00Z
---

# signals

Hypertable particionada por `emitted_at`. Una fila por señal emitida
(`signals.emitted`, contrato `schemas/signal.v1.json`). Es la fuente del futuro
`GET /signals` del api-gateway y el estado del dedup por cooldown (ADR-0015).

## Esquema

| Columna | Tipo | Descripción |
|---|---|---|
| `emitted_at` | timestamptz | Instante de emisión (partición). Default `now()`. |
| `as_of` | timestamptz | Instante del dato de mercado que disparó la regla |
| `type` | text | Tipo de señal (vocabulario abierto: `arranque_alcista`, `techo_inminente`, `correccion_inminente`) |
| `direction` | text | `alcista` \| `bajista` \| `neutral` |
| `currency` | text | Fiat del par (ISO 4217) |
| `rule` | text | Regla versionada que disparó (`<type>@v<version>`) |
| `calc_version` | integer | Versión del cálculo de los indicadores de evidencia (RF-3) |
| `triggered_by` | uuid | `event_id` del evento cuyos indicadores satisficieron la regla |
| `evidence` | jsonb | `{rule, inputs}`: regla + mapa indicador→valor usado (T10, A09) |

PK `(emitted_at, type, currency)`. Índice `signals_type_currency_asof_idx`
`(type, currency, as_of DESC)` para el cooldown: el dedup consulta la última señal
de un tipo/moneda por `as_of` (tiempo de dato), no de emisión.

- Escribe: [indicator-engine](../services/indicator-engine.md) (`guardar_senales`).
  Leerá: api-gateway (`GET /signals`, solo lectura). Nunca se emite bajo
  `low_confidence` ni el mismo tipo dentro del `cooldown`.
