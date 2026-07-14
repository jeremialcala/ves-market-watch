---
type: Service
title: ingestor-historico
description: Carga batch idempotente de históricos de precio USDT/VES desde exports CSV y varianza histórica vía CLI — implementado.
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

Proceso **batch por demanda** (CLI `cargar` / `stats`), sin scheduler y **sin publicar
al bus** (ADR-0013): el histórico se consulta, no se reproduce como eventos.

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
- 39 tests (unit + integración contra TimescaleDB real).

## Pendientes
- Engine fase 2: usar la serie como línea base de varianza para umbrales de señales.
  (El PRD fue **aprobado HITL el 2026-07-11** — Gate 0 incremental cerrado para esta
  funcionalidad.)
