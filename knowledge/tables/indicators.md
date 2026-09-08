---
type: TimescaleDB Hypertable
title: indicators
description: Serie de tiempo de indicadores calculados (formato largo) + processed_events para idempotencia del consumidor.
resource: ../../apps/indicator-engine/db/migrations/001_indicators.sql
tags: [indicadores, implementada]
timestamp: 2026-07-26T00:00:00Z
---

# indicators

Hypertable particionada por `as_of`, **formato largo**: una fila por
indicador/moneda/instante. El estado del motor es este histórico — el "último valor"
de un indicador es su fila más reciente (sobrevive reinicios, ADR-0009 en espíritu).

## Esquema

| Columna | Tipo | Descripción |
|---|---|---|
| `as_of` | timestamptz | Instante del dato origen (captura BCV / snapshot P2P) |
| `indicator` | text | Nombre canónico (`official_rate`, `official_rate_change_abs/pct`, y los `p2p_*` de fase 2: brecha, spreads, microestructura) |
| `currency` | text | Código ISO 4217 |
| `value` | numeric(24,8) | Valor (las variaciones pueden ser negativas) |
| `calc_version` | integer | Versión de la fórmula (RF-3, reproducibilidad). **`0` = fila DERIVADA de un export externo, no calculada por el motor** (ver más abajo) |
| `metadata` | jsonb | Procedencia de las filas derivadas (origen, fórmula, lado y sesgo medido). Vacío en lo que calcula el motor |

PK `(as_of, indicator, currency)` — la reentrega de un evento no duplica filas
(`ON CONFLICT DO NOTHING`).

## Series derivadas: `calc_version = 0` (2026-08-01, ADR-0013 RF-7)

`p2p_brecha_pct_sell` y `p2p_brecha_abs_sell` tienen **61.544 filas derivadas**
(2025-12-02 → 2026-07-20) calculadas desde
[historical_market_snapshots](historical_market_snapshots.md) contra la tasa
oficial vigente en cada instante. No las produjo el motor, y por eso **no llevan
su `calc_version = 1`**: quien filtre por 1 sigue viendo solo lo medido.

**El backfill se corta ANTES del primer punto del motor** y esa guarda es lo que
hace segura la mezcla. Las marcas de tiempo de las dos series no coinciden (10 min
contra ~30 s), así que el `ON CONFLICT` no las fusiona: sin el corte quedarían
interleavadas dos series que difieren 0,08 pp, y `ultimo_indicador` /
`indicador_asof` —que **no filtran por `calc_version`**— devolverían una u otra al
azar. Verificado tras cargar: 0 filas derivadas en el tramo del motor y unión sin
escalón (16,4758 → 16,5641 en 9 min).

### La consecuencia que hay que recordar: el muestreo no es uniforme

La serie derivada tiene una fila cada 10 min y la del motor una cada ~30 s. **Toda
agregación sobre una ventana que cruce el 2026-07-20 tiene que ponderar por
tiempo, no por muestra.** No es teórico: la media de 90 días de la brecha de venta
daba 20,37 % con `avg()` plano y 25,81 % promediando por hora — **5,4 puntos** de
sesgo hacia el tramo más denso, que es justo el reciente. Dentro de esa ventana la
densidad varía 34× (38 a 1.283 muestras/día).

## processed_events (misma migración)

`event_id uuid PK, event_type, processed_at` — deduplicación del consumidor
(escenario negativo 2 del PRD, A08).

- Escribe: [indicator-engine](../services/indicator-engine.md) (INSERT/SELECT).
  Leerá: api-gateway (solo lectura, `/indicators/*`).
