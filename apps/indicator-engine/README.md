# indicator-engine

Motor reactivo de indicadores: consume eventos de mercado y produce indicadores y señales.

**Fase 1 implementada** — primer consumidor de `official.rate.updated`. Lo P2P
(brecha, spreads, volúmenes, profundidad) y las señales llegan con `ingestor-binance`.

## Qué hace (fase 1)
- Consume `official.rate.updated` de `market.events` con cola durable propia
  (`indicator-engine.market.events`), validación contra `schemas/official-rate.v1.json`
  y DLQ (`market.events.dlq`) para eventos inválidos o fallidos (ADR-0004, A05/A08).
- Idempotencia por `event_id` (tabla `processed_events`): la reentrega no reprocesa.
- Calcula por moneda: `official_rate`, `official_rate_change_abs/pct` (vs. último
  conocido); la fórmula de la brecha BCV↔P2P ya vive en el dominio, lista para fase 2.
- Marca `official_stale=true` si la captura supera `STALE_THRESHOLD_HOURS` (6, ADR-0007).
- Persiste en la hypertable `indicators` con `calc_version` (RF-3, reproducibilidad) y
  publica `indicators.updated` con `triggered_by` = evento origen (trazabilidad V16).

## Ejecutar

```sh
pip install -e .[dev]

# Daemon consumidor (requiere docker compose up -d --wait en la raíz):
python -m indicator_engine

# Procesar lo encolado y salir (verificación / lotes):
python -m indicator_engine --drain
```

Configuración por entorno: `AMQP_URL`, `AMQP_EXCHANGE` (`market.events`), `QUEUE_NAME`,
`DLX_NAME`, `DLQ_NAME`, `PREFETCH` (10), `DATABASE_URL`, `CALC_VERSION` (1),
`STALE_THRESHOLD_HOURS` (6), `SCHEMAS_DIR`. Secretos por entorno (A02).

## Tests

```sh
python -m pytest -m "not integration and not e2e"   # sin infraestructura
docker compose up -d --wait                          # desde la raíz del repo
python -m pytest                                     # suite completa
```

## Requisitos y diseño
- PRD: `../../docs/01-requirements/motor-indicadores.md`
- Diseño: `docs/design.md` · Contratos: `../../schemas/`
- Amenazas T2, T5, T10 en `../../docs/02-design/threat-model.md`

## Pendiente (fase 2 — requiere ingestor-binance)
- `p2p.snapshot`: filtrado de outliers, precio de referencia, brecha, spreads,
  volúmenes, profundidad, coalescing ante backlog.
- Motor de reglas de señales (`signals.emitted`, config YAML versionada, RF-4).
