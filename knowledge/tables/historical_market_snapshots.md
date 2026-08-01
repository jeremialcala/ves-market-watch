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

## Contenido cargado (2026-08-01)

**32.525 filas · 2025-12-02 → 2026-08-01 · 243 días, sin huecos > 2 días**, en cadencia
de 10 minutos. Bancos: Banesco, Mercantil, Provincial, SpecificBank.

| Export | Filas insertadas | Rango |
|---|---|---|
| `query_result_2026-07-11T09_16_03…` | 1.064 | 2025-12-02 → 2025-12-11 |
| `query_result_2026-07-11T10_08_59…` | 28.510 | 2025-12-11 → 2026-07-11 |
| `query_result_2026-08-01T11_47_06…` | 2.951 | 2026-07-11 → 2026-08-01 |

`source_file` registra qué export **insertó** cada fila, no cuáles la contenían: el
tercer export traía 28.823 filas y 25.872 ya estaban (idempotencia por
`(captured_at, source_id)`), así que conservaron la atribución del segundo. Unión sin
escalón: 824,08 a las 14:00 UTC → 824,23 a las 14:10.

### Defecto conocido: `banks[].volume` vacío en el formato nuevo

Los exports desde `10_08_59` publican el volumen por banco en una columna
**`InforPerBank` con mapa anidado** (`{:Banesco {:volume …, :averageRate …}}`). La
heurística de `detectar_columnas` busca palabras de volumen en el NOMBRE de la columna,
y ese nombre no tiene ninguna, así que la columna cae en `extra` y `banks[].volume`
queda a `null`.

| Export | Entradas de banco | con `rate` | con `available` | con `volume` |
|---|---|---|---|---|
| `09_16_03…` | 3.192 | 3.192 | 1.464 | **3.192** |
| `10_08_59…` + `11_47_06…` | 113.972 + | todas | ~44 % | **0** |

**No se pierde información**: `InforPerBank` viaja verbatim en `extra`, que es
justamente el mecanismo que ADR-0013 previó para columnas no reconocidas. Y hoy no
afecta a nada: `leer_puntos` (la varianza) solo consume `rate`. Pero deja la misma
columna poblada para un export y vacía para otro dentro de la misma tabla, así que
conviene arreglar la heurística —reconocer mapas anidados— antes de que alguien
consulte `volume` y saque conclusiones de un `null` que no significa «sin volumen».
