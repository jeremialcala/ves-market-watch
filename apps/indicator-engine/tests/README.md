# Tests — indicator-engine (pirámide AI-DLC)

Suite: **170 tests** — cubre las fases 1 y 2, el motor de señales (RF-4, ADR-0015) y
el análisis de la revisión (RF-6, ADR-0019).

- `unit/` — cálculos puros (brecha, variación), referencia P2P (mediana/VWAP),
  casos de uso (dedup, `official_stale`, `process_p2p_snapshot`), reglas de señal
  (`test_reglas.py` — ruleset `config/senales.v1.yaml`, cooldown, y la proximidad
  k/n de RF-6), validación de eventos contra el schema compartido, dominio del
  análisis (`test_analisis.py` — bandas, degradación de escala, posiciones,
  desempates y el canario del umbral del 30 %) y el cache de distribuciones con
  reloj inyectado (`test_cache_distribuciones.py`).
- `integration/` — consumo AMQP real: evento válido → indicador + publicación;
  duplicado ignorado; inválido → DLQ; persistencia de señales
  (`test_signals_repository.py`, hypertable `signals`); percentiles con
  `percentile_disc` devolviendo `Decimal` exacto
  (`test_distribuciones_timescale.py`) y payload verbatim en `indicator_analysis`
  (`test_analysis_repository.py`).
- `contract/` — lo emitido cumple `schemas/indicators.v1.json`, `schemas/signal.v1.json`
  y `schemas/analysis.v1.json` (productor validado en `test_signal_event_schema.py` y
  `test_analysis_event_schema.py`).
- `e2e/` — dos eventos `official.rate.updated` → variación calculada, persistida y
  publicada contra RabbitMQ/TimescaleDB reales del `docker compose` raíz; y
  `p2p.snapshot` → `analysis.updated` al bus y a su tabla
  (`test_flujo_snapshot_a_analisis.py`, que baja `muestras_minimas` para ejercitar
  el camino de percentiles sin esperar el arranque en frío).

```sh
python -m pytest -m "not integration and not e2e"   # sin infraestructura
docker compose up -d --wait && python -m pytest      # suite completa
```

Fase 2, señales y análisis cubiertos por la suite (verificados e2e, 2026-07-22 y
2026-08-01). Pendiente: recalibración HITL de los umbrales del ruleset con datos de
producción, y medir con `EXPLAIN ANALYZE` la consulta de percentiles con la tabla en
régimen.
