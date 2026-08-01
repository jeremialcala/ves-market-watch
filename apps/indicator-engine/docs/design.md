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
- **Dominio del análisis** (`domain/analisis.py`, RF-6/ADR-0019): puro y sin IO.
  `ConfigAnalisis` (cargada estricta del YAML versionado), `Distribucion` (lo que
  devuelve el puerto), `Escala`/`Corte`, `LecturaIndicador`, `Sintesis` y `Analisis`.
  `elegir_escala` decide percentiles vs. respaldo y **la elección viaja en el payload**;
  `posicion_en_escala` interpola a trozos entre los cortes publicados (coordenada de
  dibujo, NO percentil empírico); `clasificar_banda` devuelve `unscaled` cuando no hay
  distribución que sostenga una banda. El mapeo indicador→reglas se **deriva** del
  ruleset (`reglas_que_alimenta`), nunca se declara.
- `domain/reglas.py` gana la función hermana `evaluar_proximidad` —k de n condiciones y
  cuál bloquea— **sin tocar `evaluar_reglas`**: una decide qué se emite, la otra solo
  describe.
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
  - `analizar_revision.py` — `AnalizarRevision`, colaborador de `ProcesarSnapshotP2P`
    para que el caso de uso no engorde: pide las distribuciones (cacheadas), llama al
    dominio y publica/persiste **el mismo documento**. Va después de las señales (para
    que `summary.rules_met` describa la misma evaluación) y antes de `marcar_procesado`,
    envuelto en `try/except`: un fallo del análisis no manda el snapshot a la DLQ.
  - `domain/reglas.py` — ruleset + evaluación pura (AND de condiciones; operadores
    `gt/gte/lt/lte`); `cargar_ruleset` estricto (YAML inválido ⇒ el motor no arranca).
  - Puertos: `EventPublisher` (`publish_indicators_updated`, `publish_signal_emitted`,
    `publish_analysis_updated`), `IndicatorRepository` (`indicador_asof` para ventanas;
    `senal_reciente`/`guardar_senales` para señales; `guardar_analisis`),
    `DistribucionRepository` (separado a propósito: consulta agregada cara, con su propia
    política de cache y su propio doble en memoria), `AlertNotifier`.
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
  - `timescale/repository.py` (cont.) — `TimescaleDistribucionRepository`: **una sola
    consulta** para los seis medidores con la forma multi-fracción de `percentile_disc`
    (numeric exacto y valores realmente observados; `percentile_cont` castearía a float y
    violaría ADR-0017). `guardar_analisis` escribe el payload **verbatim** en JSONB.
  - `timescale/distribuciones.py` — `DistribucionesConTTL`, decorador del mismo puerto:
    TTL de 15 min (la consulta barre ~1,5 M filas y el motor procesa ~2 snapshots/min),
    `asyncio.timeout`, y ante fallo sirve lo cacheado aunque esté vencido o `{}` — que
    degrada al respaldo, **visible en el payload**. La ventana `desde` queda fuera de la
    clave de cache a propósito: si no, el TTL no serviría de nada.
  - `memory.py` — adaptadores para unit tests.
  - Config: `config/senales.v1.yaml` (ruleset RF-4) y `config/analisis.v1.yaml`
    (ventana, cortes, mínimo de muestras y dominios de respaldo, RF-6), ambas versionadas
    en repo y cargadas al arrancar. Ventana y mínimo van en el YAML porque son parte de
    la definición publicada (viajan en el payload); TTL y timeout van en env por ser
    operativos.

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
- **Escala declarada, nunca supuesta** ✔ (RF-6) — `scale.source` distingue percentiles
  reales de respaldo del ruleset, y `scale.computed_at` declara el desfase del cache.
  Sin dispersión que sostenga una banda se emite `unscaled` en vez de inventarla.
- **El análisis no puede tumbar el pipeline** ✔ — su fallo se registra y se sigue;
  indicadores y señales quedan publicados y el evento, procesado.

## Pendiente
- Profundidad por bandas de precio (0,5 %): **hoy la proyecta el api-gateway** desde el
  último crudo P2P (interim de ADR-0016); materializarla aquí (`p2p_top_of_book`) sigue
  pendiente.
- Variación intradía vs. apertura VET: **hoy se deriva en el cliente**
  (`web-spa/src/lib/intradia.ts`, RF-7) sobre `/indicators/history`; persistirla como
  indicador del motor —con su `calc_version`— sigue pendiente.
- Coalescing ante backlog de snapshots (hoy se procesan todos en orden; el volumen
  actual — 2 snapshots/min — no lo requiere).
- Recalibración HITL de los umbrales del ruleset (`config/senales.v*.yaml`) con más
  historia — subiendo la versión del ruleset, sin redeploy.
- ~~Continuous aggregate diario de percentiles~~ — **medido el 2026-08-01 y
  descartado por ahora**: en régimen a 90 días (1.036.800 filas sembradas a la
  densidad real, 256 MB) la consulta tarda **747 ms** con caché caliente, ~7×
  por debajo del timeout de 5 s. Detalle que corrige la suposición del plan: **no
  hay nodo `Sort`** — el índice `(indicator, currency, as_of DESC)` sirve un
  `Merge Append` ya ordenado por indicador, y el único ordenamiento es el interno
  del agregado de conjunto ordenado. Subir `work_mem` para evitar su desborde a
  temporales gana solo ~15 % (798 ms → 679 ms), así que tampoco compensa tocarlo.
  Reabrir si cambia la densidad de captura o la ventana.
- ~~`indicators` sin política de tamaño~~ — **resuelto con COMPRESIÓN, no
  retención** (migración 004, 2026-08-01). Borrar de `indicators` habría sido una
  decisión de producto: `GET /indicators/history` acota el TAMAÑO de cada
  petición a 90 días, no su antigüedad, así que no existe profundidad a partir de
  la cual el dato deje de ser servible. Comprimir no quita nada y midió mejor en
  los dos ejes: **24,9×** en los chunks comprimidos (256 MB → 37 MB en régimen) y
  la consulta de percentiles **más rápida** (747 → 585 ms), porque descomprimir
  cuesta menos que leer 228 MB. Verificados además el histórico del gateway
  (10 ms), el INSERT en chunk vivo, el INSERT retroactivo en chunk comprimido y
  —lo que de verdad importaba— que `ON CONFLICT DO NOTHING` **sigue rechazando
  duplicados sobre chunks comprimidos**: la idempotencia at-least-once descansa
  en esa PK.
- **Retención sigue sin decidirse, y es a propósito**: con compresión el
  crecimiento baja a ~300 MB/año, así que no hay urgencia. Cuando se decida, la
  ventana no puede bajar de lo que necesitan `ultimo_indicador` e
  `indicador_asof` (horas, no días) ni de lo que la API promete poder responder.
- `add_compression_policy` sobre `indicator_analysis` a los 7 días si el volumen
  (~260 k filas / 1-2 GB en 90 d) aprieta.
