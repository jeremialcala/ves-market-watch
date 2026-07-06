# Tests — indicator-engine (pirámide AI-DLC)

- `unit/` — cálculos puros (brecha, variación), caso de uso (dedup, `official_stale`),
  validación de eventos contra el schema compartido.
- `integration/` — consumo AMQP real: evento válido → indicador + publicación;
  duplicado ignorado; inválido → DLQ.
- `contract/` — lo emitido cumple `schemas/indicators.v1.json` (`signal.v1` llega con
  las señales en fase 2).
- `e2e/` — dos eventos `official.rate.updated` → variación calculada, persistida y
  publicada contra RabbitMQ/TimescaleDB reales del `docker compose` raíz.

```sh
python -m pytest -m "not integration and not e2e"   # sin infraestructura
docker compose up -d --wait && python -m pytest      # suite completa
```

Pendiente fase 2 (requiere `p2p.snapshot`): outliers/confianza, reglas de señal.
