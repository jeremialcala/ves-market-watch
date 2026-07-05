# Diseño — indicator-engine

## Capas
- **Dominio:** `Indicador`, `Señal`, `PrecioReferencia`, `Profundidad`; cálculos puros y testeables.
- **Casos de uso:** `ProcesarSnapshotP2P`, `ProcesarTasaOficial`, `EvaluarReglasSeñal`.
- **Puertos:** `EventConsumer`, `EventPublisher`, `IndicatorRepository`, `RuleConfigSource`.
- **Adaptadores:** AMQP (consume+publish), TimescaleDB, config de reglas desde repo (YAML versionado).

## Propiedades clave
- **Idempotencia:** deduplicación por `event_id`; nunca doble señal.
- **Backpressure:** coalescing — ante backlog se procesa el último snapshot por lado.
- **Confianza:** > 30 % outliers en snapshot → `low_confidence`, señales suprimidas.
- **Degradación:** tasa oficial `stale` → brecha marcada `official_stale=true`.

## Pendiente (fase 03)
- `<TODO: calibrar umbrales de señales con datos reales (HITL)>`
- `<TODO: definir formato YAML de reglas y su validación>`
