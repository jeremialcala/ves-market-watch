---
type: Index
title: Tablas TimescaleDB
description: Tablas de la base de datos (PostgreSQL + TimescaleDB, ADR-0002) — implementadas y planificadas.
timestamp: 2026-07-05T00:00:00Z
---

# Tablas

## Implementadas (migraciones en `apps/<servicio>/db/migrations/`)

| Tabla | Tipo | Contenido |
|---|---|---|
| [official_rates](official_rates.md) | Hypertable | Histórico completo de capturas de tasas BCV |
| [official_rate_source_health](official_rate_source_health.md) | Tabla | Salud de la fuente BCV (fallos, stale) |
| [indicators](indicators.md) | Hypertable | Indicadores calculados (formato largo, `calc_version`) |
| processed_events (ver [indicators](indicators.md)) | Tabla | Idempotencia del consumidor del engine |

## Planificadas (diseño en `../../docs/02-design/architecture.md`)

`p2p_snapshots` (crudo JSONB, retención 90 d), `p2p_top_of_book`, `signals`
(con evidencia), `api_clients` (secrets hasheados).
Agregados continuos 5 min / 1 h / 1 d para intradía.

Roles PostgreSQL separados por servicio, mínimo privilegio (A01).
