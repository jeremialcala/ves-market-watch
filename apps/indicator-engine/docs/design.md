# Diseño — indicator-engine

- **Estado:** approved (fases 1, 2-P2P y motor de reglas de señales RF-4 implementadas)
- **Fecha:** 2026-07-22
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 03-implementation
- **Versión:** 0.3.0

## Capas (hexagonal)
- **Dominio** (`src/indicator_engine/domain/`): `Indicador` (nombre, moneda, valor,
  as_of, calc_version), `AnuncioP2P` (proyección mínima del evento) y cálculos puros
  en `calculos.py`: `calcular_variacion`, `calcular_brecha`
  (`knowledge/metrics/brecha-cambiaria.md`), `calcular_referencia_p2p` (mediana/VWAP
  sobre no-outliers, top of book sin filtrar, `confianza_baja` > 30 % outliers),
  `calcular_spread_pct` y `calcular_ratio_oferta_demanda`
  (`knowledge/metrics/microestructura-p2p.md`).
- **Aplicación** (`src/indicator_engine/application/`):
  - `contracts.py` — `ValidadorDeContratos`: todo evento consumido se valida contra
    `schemas/<evento>.v1.json` (raíz del repo) antes de tocar lógica (A05/A08);
    inválido → `EventoInvalido` → DLQ.
  - `process_official_rate.py` — caso de uso `ProcesarTasaOficial`: dedup por
    `event_id` → calcular solo indicadores afectados (RF-2) → persistir → publicar
    `indicators.updated` (`triggered_by` = evento origen) → marcar procesado.
    Semántica at-least-once: se marca al final; la persistencia es idempotente por PK.
  - `process_p2p_snapshot.py` — caso de uso `ProcesarSnapshotP2P` (misma semántica):
    referencia del lado + brecha as-of (ADR-0009) con bandera `official_stale`
    (ADR-0007) + microestructura con el último lado opuesto **fresco** (≤ 15 min;
    más viejo = otra época del mercado, se omite) + ventanas móviles contra el propio
    histórico (momentum bid 3 h / drenaje oferta 6 h; hueco de captura > ventana + 1 h
    ⇒ no comparable, se omite). Con `confianza_baja` solo se publican referencia y
    `p2p_outliers_pct` — supresión de señales con rastro, nunca silenciosa.
  - `process_p2p_snapshot.py` (cont.) — tras publicar los indicadores, el **motor de
    reglas** (RF-4, ADR-0015) evalúa el ruleset versionado sobre la vista de indicadores
    vigentes (lote + histórico fresco ≤ `SIGNALS_MAX_AGE_MIN`), aplica dedup por cooldown
    y emite/persiste `signals.emitted` con evidencia. Nunca bajo `confianza_baja`.
  - `domain/reglas.py` — ruleset + evaluación pura (AND de condiciones; operadores
    `gt/gte/lt/lte`); `cargar_ruleset` estricto (YAML inválido ⇒ el motor no arranca).
  - Puertos: `EventPublisher` (`publish_indicators_updated`, `publish_signal_emitted`),
    `IndicatorRepository` (`indicador_asof` para ventanas; `senal_reciente`/`guardar_senales`
    para señales), `AlertNotifier`.
- **Adaptadores** (`src/indicator_engine/adapters/`):
  - `amqp/consumer.py` — declara la topología (exchange `market.events`, cola durable
    propia con `x-dead-letter-exchange` → `market.events.dlx` → `market.events.dlq`),
    bindings `official.rate.updated` + `p2p.snapshot`, despacho por `event_type`.
    `procesar_disponibles()` drena y retorna (determinista, tests y `--drain`);
    `run_forever()` es el daemon. Prefetch configurable (backpressure).
  - `amqp/publisher.py` — `indicators.updated` con confirms y sobre estándar; valores
    en punto fijo (`format(v, "f")`) para cumplir el patrón del contrato.
  - `timescale/repository.py` — hypertables `indicators` (formato largo) y `signals`
    (evidencia JSONB) + `processed_events`; `ON CONFLICT DO NOTHING` hace la reentrega
    inocua; `indicador_asof` resuelve ventanas móviles con un índice (indicator, currency,
    as_of DESC) sin cargar series; `senal_reciente` implementa el cooldown por `as_of`.
  - `memory.py` — adaptadores para unit tests.
  - Config: `config/senales.v1.yaml` (ruleset RF-4, versionado en repo) cargado al arrancar.

## Propiedades clave
- **Idempotencia** ✔ — dedup por `event_id` persistente (escenario negativo 2).
- **Validación de esquema + DLQ** ✔ — escenario negativo 4; alerta en cada descarte.
- **Degradación `official_stale`** ✔ — tasa más vieja que `STALE_THRESHOLD_HOURS`
  (6 h, ADR-0007) al momento del cálculo → bandera en el payload; sin tasa conocida
  no se publica brecha y la bandera va en true; nunca se inventa dato (A10).
- **Degradación `confianza_baja`** ✔ — > 30 % outliers ⇒ señales suprimidas con
  rastro (`p2p_outliers_pct`), referencia publicada marcada.
- **Estado del motor = su histórico** — último valor y as-of se leen de la propia
  hypertable; sin estado en memoria (sobrevive reinicios).
- **Reproducibilidad** ✔ — `calc_version` en cada fila y en el evento (RF-3).
- **Coherencia temporal** ✔ — spread/ratio solo entre lados frescos; ventanas
  móviles omitidas ante huecos de captura.

## Pendiente
- Profundidad por bandas de precio (0,5 %) y variación intradía vs. apertura VET.
- Coalescing ante backlog de snapshots (hoy se procesan todos en orden; el volumen
  actual — 2 snapshots/min — no lo requiere).
- Recalibración HITL de los umbrales del ruleset (`config/senales.v*.yaml`) con más
  historia — subiendo la versión del ruleset, sin redeploy.
