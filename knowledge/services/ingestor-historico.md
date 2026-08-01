---
type: Service
title: ingestor-historico
description: Carga batch idempotente desde exports CSV —históricos de precio USDT/VES y tasas oficiales del BCV— y varianza histórica vía CLI. Implementado.
resource: ../../apps/ingestor-historico/
tags: [python, implementado, historico, batch]
timestamp: 2026-07-11T00:00:00Z
---

# ingestor-historico

**Implementado** (2026-07-11) — verificado con el export real
`query_result_2026-07-11….csv`: 1.064 filas (2025-12-02 → 2025-12-11) cargadas,
recarga idempotente (0 nuevas / 1.064 duplicadas) y varianza calculada. Python 3.12,
hexagonal, mismas convenciones que los demás servicios. PRD:
`docs/01-requirements/ingesta-historica.md` · ADR-0013.

Proceso **batch por demanda** (CLI `cargar` / `cargar-oficiales` / `stats`), sin
scheduler y **sin publicar al bus** (ADR-0013): el histórico se consulta, no se
reproduce como eventos. Reemitir seis años de `official.rate.updated` dispararía el
motor de indicadores como si fueran cambios de hoy.

## Propiedades implementadas
- Parseo **adaptativo**: heurística de columnas (nombres + fila de muestra), mapas por
  banco `{:Banco valor (anotación)}` con bancos dinámicos, números con separador de
  miles, fechas inglesas o ISO, fallback de fecha desde ObjectId; columnas no
  reconocidas → `extra` JSONB. Archivo sin precio → rechazo completo; fila ilegible →
  descarte contado por motivo.
- Idempotencia por PK `(captured_at, source_id)` + `ON CONFLICT DO NOTHING`; sin
  columna ID, hash determinista del contenido.
- Señales de calidad por banco preservadas: `lower liquidity` / `only N available`.
- `stats`: media, varianza muestral, desviación, min/max y log-retornos — global, por
  banco y por día de mercado (zona configurable, default UTC−4); salida JSON.
- Persistencia: [historical_market_snapshots](../tables/historical_market_snapshots.md).
- **Tasas oficiales del BCV** (`cargar-oficiales`, RF-6, 2026-08-01): carga
  `bcv_fx_historico.csv` en [official_rates](../tables/official_rates.md) —la misma
  tabla que el `ingestor-bcv` en vivo, ver la enmienda de ADR-0013—, idempotente por
  `(captured_at, currency)`. Toma la columna **ASK** (verificada contra la serie viva:
  coincidencia exacta en las 75 combinaciones solapadas) en escala **BsD** (absorbe la
  redenominación del 2021-10-01), con `captured_at` = hora de publicación del BCV en
  zona de Venezuela. `source` distingue la procedencia; las jornadas sin hora en el XLS
  van marcadas aparte. Filtro opcional `--monedas`.
- 68 tests (unit + integración contra TimescaleDB real).

## Pendientes
- Usar la serie como línea base de varianza para los umbrales de señales: la fase 2 del
  engine y el motor de reglas (ADR-0015) se entregaron **sin** consumirla — el motor no
  referencia `historical_market_snapshots`. Sigue como mejora para la recalibración HITL.
  (El PRD fue **aprobado HITL el 2026-07-11** — Gate 0 incremental cerrado para esta
  funcionalidad.)
