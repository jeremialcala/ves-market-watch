# indicator-engine

Motor reactivo de indicadores: consume eventos de mercado y produce indicadores y señales.

**Implementado extremo a extremo** — consume `official.rate.updated` **y** `p2p.snapshot`;
por cada ingesta recalcula y publica los indicadores afectados y, sobre la microestructura,
evalúa el motor de reglas (RF-4) y emite `signals.emitted`. Pendiente menor: profundidad por
bandas, variación intradía y la recalibración HITL de umbrales.

## Qué hace
- Consume `official.rate.updated` y `p2p.snapshot` de `market.events` con cola durable
  propia (`indicator-engine.market.events`), validación contra `schemas/*.v1.json`
  y DLQ (`market.events.dlq`) para eventos inválidos o fallidos (ADR-0004, A05/A08).
- Idempotencia por `event_id` (tabla `processed_events`): la reentrega no reprocesa.
- Por `official.rate.updated`: `official_rate`, `official_rate_change_abs/pct` por moneda.
- Por `p2p.snapshot` (lado BUY o SELL): referencia del lado (`p2p_mediana`, `p2p_vwap`,
  `p2p_mejor_precio`, `p2p_liquidez`, `p2p_merchants_pct`, `p2p_outliers_pct`, sufijo
  `_buy`/`_sell`), brecha BCV↔P2P as-of (`p2p_brecha_abs/pct_{lado}`, ADR-0009) y
  microestructura: `p2p_spread_pct` y `p2p_ratio_oferta_demanda` (con el último lado
  opuesto ≤ 15 min) más ventanas móviles `p2p_momentum_bid_3h_pct` (SELL) y
  `p2p_drenaje_oferta_6h_pct` (BUY). Umbrales de señal derivados del backtest en
  `knowledge/metrics/microestructura-p2p.md`.
- Con > 30 % de outliers en el snapshot la confianza es baja: se publican solo la
  referencia y `p2p_outliers_pct` — las señales se suprimen, nunca en silencio.
- Marca `official_stale=true` si la tasa oficial supera `STALE_THRESHOLD_HOURS` (6,
  ADR-0007) al momento del cálculo.
- Persiste en la hypertable `indicators` con `calc_version` (RF-3, reproducibilidad) y
  publica `indicators.updated` con `triggered_by` = evento origen (trazabilidad V16).
- **Señales (RF-4, ADR-0015):** evalúa el ruleset versionado (`config/senales.v1.yaml`)
  sobre la microestructura vigente, deduplica por cooldown (60 min/tipo) y emite
  `signals.emitted` (`signal.v1`) con evidencia (regla + insumos) a la hypertable `signals`.

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
`STALE_THRESHOLD_HOURS` (6), `SCHEMAS_DIR`, `SIGNALS_RULESET_PATH`
(`config/senales.v1.yaml`), `SIGNALS_MAX_AGE_MIN` (20). Secretos por entorno (A02).

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

## Pendiente
- Profundidad por bandas de precio (0,5 %) y variación intradía vs. apertura VET.
- Coalescing ante backlog de snapshots (hoy se procesan todos en orden).
- Recalibración HITL de los umbrales del ruleset con más historia (subir su versión).
