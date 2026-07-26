# Tests — indicator-engine (pirámide AI-DLC)

Suite: **77 tests** — cubre las fases 1 y 2 y el motor de señales (RF-4, ADR-0015).

- `unit/` — cálculos puros (brecha, variación), referencia P2P (mediana/VWAP),
  casos de uso (dedup, `official_stale`, `process_p2p_snapshot`), reglas de señal
  (`test_reglas.py` — ruleset `config/senales.v1.yaml`, cooldown), validación de
  eventos contra el schema compartido.
- `integration/` — consumo AMQP real: evento válido → indicador + publicación;
  duplicado ignorado; inválido → DLQ; persistencia de señales
  (`test_signals_repository.py`, hypertable `signals`).
- `contract/` — lo emitido cumple `schemas/indicators.v1.json` y `schemas/signal.v1.json`
  (productor validado en `test_signal_event_schema.py`).
- `e2e/` — dos eventos `official.rate.updated` → variación calculada, persistida y
  publicada contra RabbitMQ/TimescaleDB reales del `docker compose` raíz.

```sh
python -m pytest -m "not integration and not e2e"   # sin infraestructura
docker compose up -d --wait && python -m pytest      # suite completa
```

Fase 2 y señales ya cubiertas por la suite (verificadas e2e, 2026-07-22). Pendiente:
recalibración HITL de los umbrales del ruleset con datos de producción.
