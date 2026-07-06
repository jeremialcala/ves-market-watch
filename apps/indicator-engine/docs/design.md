# Diseño — indicator-engine

## Capas (hexagonal)
- **Dominio** (`src/indicator_engine/domain/`): `Indicador` (nombre, moneda, valor,
  as_of, calc_version) y cálculos puros en `calculos.py`: `calcular_variacion` (activo)
  y `calcular_brecha` (fórmula canónica de `knowledge/metrics/brecha-cambiaria.md`,
  se activa en fase 2 con la referencia P2P).
- **Aplicación** (`src/indicator_engine/application/`):
  - `contracts.py` — `ValidadorDeContratos`: todo evento consumido se valida contra
    `schemas/<evento>.v1.json` (raíz del repo) antes de tocar lógica (A05/A08);
    inválido → `EventoInvalido` → DLQ.
  - `process_official_rate.py` — caso de uso `ProcesarTasaOficial`: dedup por
    `event_id` → calcular solo indicadores afectados (RF-2) → persistir → publicar
    `indicators.updated` (`triggered_by` = evento origen) → marcar procesado.
    Semántica at-least-once: se marca al final; la persistencia es idempotente por PK.
  - Puertos: `EventPublisher`, `IndicatorRepository`, `AlertNotifier`.
- **Adaptadores** (`src/indicator_engine/adapters/`):
  - `amqp/consumer.py` — declara la topología (exchange `market.events`, cola durable
    propia con `x-dead-letter-exchange` → `market.events.dlx` → `market.events.dlq`),
    despacha por routing key (mapa extensible; fase 2 suma `p2p.snapshot`).
    `procesar_disponibles()` drena y retorna (determinista, tests y `--drain`);
    `run_forever()` es el daemon. Prefetch configurable (backpressure).
  - `amqp/publisher.py` — `indicators.updated` con confirms y sobre estándar.
  - `timescale/repository.py` — hypertable `indicators` (formato largo) +
    `processed_events`; `ON CONFLICT DO NOTHING` hace la reentrega inocua.
  - `memory.py` — adaptadores para unit tests.

## Propiedades clave (estado fase 1)
- **Idempotencia** ✔ — dedup por `event_id` persistente (escenario negativo 2).
- **Validación de esquema + DLQ** ✔ — escenario negativo 4; alerta en cada descarte.
- **Degradación `official_stale`** ✔ — captura más vieja que `STALE_THRESHOLD_HOURS`
  (6 h, ADR-0007) → bandera en el payload; nunca se inventa dato (A10).
- **Estado del motor = su histórico** — el último `official_rate` por moneda se lee
  de la propia hypertable; sin estado en memoria (sobrevive reinicios).
- **Reproducibilidad** ✔ — `calc_version` en cada fila y en el evento (RF-3).
- Backpressure/coalescing de snapshots y `low_confidence` — fase 2 (son propiedades
  del flujo P2P).

## Pendiente (fase 2 — requiere ingestor-binance)
- `p2p.snapshot`: outliers (MAD/IQR), precio de referencia (mediana/VWAP top-N),
  brecha, spreads, volúmenes, profundidad, coalescing.
- Motor de reglas de señales (config YAML versionada) y `signals.emitted` (RF-4).
- Calibrar umbrales de señales con datos reales (HITL).
