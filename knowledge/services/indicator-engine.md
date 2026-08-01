---
type: Service
title: indicator-engine
description: Motor reactivo que consume eventos de mercado y produce indicadores, señales y la lectura del panel — fases 1 (tasas oficiales), 2 (P2P/microestructura), motor de reglas (RF-4), análisis de la revisión (RF-6) y lectura del estado de mercado (RF-7) implementados.
resource: ../../apps/indicator-engine/
tags: [python, implementado, indicadores, señales, análisis]
timestamp: 2026-08-01T00:00:00Z
---

# indicator-engine

**Fases 1 y 2 implementadas.** Consumidor de
[official.rate.updated](../events/official-rate-updated.md) (fase 1) y de
[p2p.snapshot](../events/p2p-snapshot.md) (fase 2, 2026-07-20), despachados por
`event_type`. Valida cada evento contra su schema, deduplica por `event_id`, persiste en
[indicators](../tables/indicators.md) con `calc_version` y publica
[indicators.updated](../events/indicators-updated.md) con `triggered_by` (trazabilidad).
De la tasa oficial deriva `official_rate` y su variación abs/%; de cada snapshot P2P, la
[referencia del lado](../metrics/precio-referencia-p2p.md) (mediana, VWAP, mejor precio,
liquidez, merchants%, outliers%), la [brecha](../metrics/brecha-cambiaria.md) as-of y la
[microestructura](../metrics/microestructura-p2p.md) (spread, ratio O/D, momentum, drenaje).
Sobre esa microestructura, el **motor de reglas** (RF-4, ADR-0015) evalúa el ruleset
versionado (`config/senales.v1.yaml`) y emite
[signals.emitted](../events/signals-emitted.md) a la tabla [signals](../tables/signals.md).
Por cada revisión emite además el **análisis** (RF-4bis/RF-6, ADR-0019): la
[lectura de cada medidor](../metrics/lectura-de-indicadores.md) contra los percentiles
reales de su ventana de 90 días y contra los umbrales del ruleset →
[analysis.updated](../events/analysis-updated.md) y tabla
[indicator_analysis](../tables/indicator_analysis.md). Dentro de ese mismo evento
viaja la [lectura del mercado](../metrics/lectura-de-mercado.md) como un todo
(RF-7, ADR-0021): el régimen de dos ejes y la atribución de quién movió la brecha.
Python 3.12, hexagonal, mismas convenciones que [ingestor-bcv](ingestor-bcv.md).

## Propiedades implementadas
- Idempotencia por `event_id` persistente (tabla `processed_events`).
- Schema inválido o fallo de procesamiento → DLQ `market.events.dlq` + alerta (A05/A08).
- `official_stale=true` si la captura supera 6 h (`STALE_THRESHOLD_HOURS`, ADR-0007).
- Estado del motor = su propio histórico (sin estado en memoria; sobrevive reinicios).
  Los indicadores de ventana (momentum 3 h, drenaje 6 h) se calculan sobre ese histórico
  vía repositorio, no en memoria (ADR-0014).
- Microestructura entre lados con frescura del lado opuesto (≤ 15 min); `confianza_baja`
  (> 30 % outliers) suprime las señales dejando rastro en `p2p_outliers_pct` (ADR-0014).
- Motor de reglas (RF-4, ADR-0015): ruleset YAML versionado, evaluación por nivel sobre la
  vista de indicadores vigentes (lote + histórico fresco), dedup por cooldown (60 min por
  tipo) y evidencia (regla + insumos) en cada señal. Ruleset inválido aborta el arranque.
- Análisis de la revisión (RF-6, ADR-0019): config YAML versionada
  (`config/analisis.v1.yaml`), percentiles reales con `percentile_disc` (numeric exacto,
  nunca float) cacheados con TTL de 15 min, y **respaldo visible** por los umbrales del
  ruleset cuando falta historia (`scale.source` viaja en el payload). El documento se
  publica y se guarda verbatim. Un fallo del análisis NO manda el snapshot a la DLQ:
  indicadores y señales siguen publicados.
- Lectura del estado de mercado (RF-7, ADR-0021): config YAML versionada
  (`config/lectura.v1.yaml`) con los umbrales de los dos ejes; atribución sobre la
  identidad exacta `Δbrecha = Δparalelo − Δoficial` medida con `indicador_asof`, sin SQL
  nuevo. **La guarda de hueco de captura NO se aplica a `official_rate`**: esa serie se
  persiste solo al cambiar (ADR-0008), así que una fila vieja es una meseta y `Δ = 0` es
  evidencia positiva, no dato faltante. Sin config, el análisis se publica igual sin
  `reading`.
- CLI: `python -m indicator_engine [--drain]`. 244 tests (unit/contract/integration/e2e);
  RF-4, RF-6 y RF-7 verificados e2e en vivo (snapshot → `signals.emitted` y
  `analysis.updated` al bus y a sus tablas).

## Referencias
- PRD: `../../docs/01-requirements/motor-indicadores.md` · Diseño: `../../apps/indicator-engine/docs/design.md`
- Contratos: `../../schemas/` · ADR-0014 (microestructura P2P) · ADR-0015 (motor de reglas) · ADR-0019 (análisis de indicadores) · ADR-0021 (lectura del estado de mercado) · Amenazas T2, T5, T10.

## Pendiente
- Profundidad por bandas de precio: la proyecta el api-gateway desde el crudo P2P
  (interim, ADR-0016); materializar `p2p_top_of_book` aquí sigue pendiente.
- Variación intradía vs. apertura VET: se deriva en el `web-spa` (RF-7, 2026-07-29);
  persistirla como indicador del motor sigue pendiente.
- Recalibración HITL de los umbrales del ruleset con más historia (subir la versión del
  ruleset, sin redeploy).
- Continuous aggregate diario de percentiles si la consulta de distribuciones supera su
  timeout con la tabla en régimen (evolución prevista, no bloqueo: el respaldo cubre el
  fallo de forma visible).
