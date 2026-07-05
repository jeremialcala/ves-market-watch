# Tests — indicator-engine (pirámide AI-DLC)

- `unit/` — cálculos de indicadores con snapshots sintéticos (incl. manipulados/outliers),
  reglas de señal, idempotencia.
- `integration/` — consumo AMQP con eventos duplicados/fuera de orden/inválidos → DLQ.
- `contract/` — eventos emitidos cumplen `indicators.v1` y `signal.v1`.
- `e2e/` — snapshot + tasa → indicador y señal persistidos y publicados.
