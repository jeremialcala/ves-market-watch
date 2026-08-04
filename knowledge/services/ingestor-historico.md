---
type: Service
title: ingestor-historico
description: Carga batch idempotente desde exports CSV —históricos de precio USDT/VES y tasas oficiales del BCV— y varianza histórica vía CLI. Implementado.
resource: ../../apps/ingestor-historico/
tags: [python, implementado, historico, batch]
timestamp: 2026-07-11T00:00:00Z
---

# ingestor-historico

**Implementado** (2026-07-11) — verificado con exports reales. Al 2026-08-01 lleva
cargadas **32.525 filas de mercado** (2025-12-02 → 2026-08-01, 243 días sin huecos > 2
días) en tres exports, y **31.078 tasas oficiales** del BCV (2020-03-30 → 2026-08-03).
La idempotencia está probada en vivo: el export del 2026-08-01 traía 28.823 filas y
solo 2.951 eran nuevas. Python 3.12,
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
- **Mapas por banco en dos formas**: plana (`{:Banesco 396.79 (lower liquidity)}`) y
  **anidada** (`{:Banesco {:volume …, :averageRate …}}`). La anidada se mapea por
  CONTENIDO, no por el nombre de la columna: `InforPerBank` no lleva ninguna palabra de
  volumen y es justo donde viaja el volumen por banco.
- **`cargar --rellenar-vacios`**: reparación explícita de filas ya cargadas a las que
  les falta un campo que el export sí trae. Única excepción a la inmutabilidad de la
  tabla; la guarda vive en SQL y **nunca sobrescribe** un valor existente, así que es
  idempotente.
- Persistencia: [historical_market_snapshots](../tables/historical_market_snapshots.md).
- **Tasas oficiales del BCV** (`cargar-oficiales`, RF-6, 2026-08-01): carga
  `bcv_fx_historico.csv` en [official_rates](../tables/official_rates.md) —la misma
  tabla que el `ingestor-bcv` en vivo, ver la enmienda de ADR-0013—, idempotente por
  `(captured_at, currency)`. Toma la columna **ASK** (verificada contra la serie viva:
  coincidencia exacta en las 75 combinaciones solapadas) en escala **BsD** (absorbe la
  redenominación del 2021-10-01), con `captured_at` = hora de publicación del BCV en
  zona de Venezuela. `source` distingue la procedencia; las jornadas sin hora en el XLS
  van marcadas aparte. Filtro opcional `--monedas`.
- 138 tests (unit + integración contra TimescaleDB real, incluidas las tablas de
  los servicios vecinos), 97,22 % de ramas sobre `src/` (medido 2026-08-04;
  umbral Gate 2: 80 %).

## Pendientes
- Usar la serie como línea base de varianza para los umbrales de señales: la fase 2 del
  engine y el motor de reglas (ADR-0015) se entregaron **sin** consumirla — el motor no
  referencia `historical_market_snapshots`. Sigue como mejora para la recalibración HITL.
  (El PRD fue **aprobado HITL el 2026-07-11** — Gate 0 incremental cerrado para esta
  funcionalidad.)
