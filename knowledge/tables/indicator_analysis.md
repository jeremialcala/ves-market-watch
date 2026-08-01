---
type: TimescaleDB Hypertable
title: indicator_analysis
description: Lectura de los medidores del panel por revisión (RF-6) — el documento publicado, guardado verbatim en JSONB.
resource: ../../apps/indicator-engine/db/migrations/003_analysis.sql
tags: [análisis, indicadores, implementada]
timestamp: 2026-08-01T00:00:00Z
---

# indicator_analysis

Hypertable particionada por `as_of`. Una fila por revisión — cada lote de
indicadores que el engine emite ante un `p2p.snapshot` (ADR-0019). Es la fuente
del `GET /api/v1/analysis/current` del api-gateway.

**El documento ES el contrato.** `payload` guarda verbatim el `payload` del
evento [analysis.updated](../events/analysis-updated.md): así el GET devuelve
exactamente lo que salió al bus y los decimales siguen siendo strings exactos,
sin round-trip por `numeric` (ADR-0017; mismo criterio que `signals.evidence`).

## Esquema

| Columna | Tipo | Descripción |
|---|---|---|
| `as_of` | timestamptz | Instante del dato de mercado de la revisión (partición) |
| `currency` | text | Fiat del par sobre el que se leyó el panel (`VES`) |
| `triggered_by` | uuid | `event_id` del `p2p.snapshot` que produjo la revisión |
| `calc_version` | integer | Versión de la fórmula de los indicadores leídos (RF-3) |
| `analysis_version` | integer | Versión de `config/analisis.v*.yaml` (ventana, cortes, dominios) |
| `ruleset_version` | integer | Versión del ruleset de señales evaluado |
| `confidence` | text | `normal` \| `low` (> 30 % de outliers) |
| `official_stale` | boolean | La tasa oficial de la brecha lleva > 6 h sin actualizarse |
| `scale_source` | text | `percentiles` \| `ruleset` — promovida desde el JSONB |
| `analyzed_at` | timestamptz | Instante de análisis. Default `now()` |
| `payload` | jsonb | El documento publicado, verbatim (`schemas/analysis.v1.json`) |

PK `(as_of, currency, triggered_by)`. `triggered_by` entra en la PK por dos
razones: idempotencia at-least-once (la reentrega del snapshot no duplica) y
para que las revisiones de BUY y SELL del mismo instante **convivan** en vez de
pisarse. Índice `indicator_analysis_currency_asof_idx` `(currency, as_of DESC)`
— lo único que consulta el gateway.

`scale_source` está promovida a columna para responder «¿cuánto tiempo estuvimos
en respaldo de ruleset?» sin abrir el JSONB. Basta que un medidor esté en
respaldo para que la revisión entera no cuente como de percentiles.

Retención de 90 días (`add_retention_policy`): es la ventana de análisis, más
allá el documento no explica ninguna lectura vigente. Volumen estimado ~260 k
filas y 1-2 GB en 90 d; si aprieta, `add_compression_policy` a los 7 días.

- Escribe: [indicator-engine](../services/indicator-engine.md)
  (`guardar_analisis`). Lee: [api-gateway](../services/api-gateway.md)
  (`analisis_vigente`, solo lectura). Un análisis más viejo que la frescura P2P
  (20 min) **no se sirve como vigente**: se devuelve 404 (A10).
