# ADR-0014: Cálculo y publicación de la microestructura P2P (fase 2 del engine)

- **Estado:** accepted
- **Fecha:** 2026-07-20
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 03-implementation
- **Controles OWASP afectados:** A08 (integridad de datos), A04 (diseño seguro), A09 (trazabilidad)

## Contexto
La fase 2 del `indicator-engine` incorpora el consumo de `p2p.snapshot` (un evento por
lado del mercado, ~2/min) y calcula, además de la referencia del lado (mediana, VWAP,
mejor precio, liquidez, merchants%, outliers%), la microestructura que en el backtest
resultó *anticipatoria*: spread BUY↔SELL, ratio oferta/demanda, momentum del bid (3 h) y
drenaje de oferta (6 h) — el tablero que alimentará el motor de reglas de señales (RF-4).

Esto abre varias decisiones de diseño no triviales: cómo se transportan estos indicadores
al bus, dónde vive el estado necesario para las ventanas móviles, cómo se cruzan dos
snapshots de lados distintos que llegan por separado, y qué hacer cuando la calidad del
snapshot es baja. Ninguna estaba cubierta por un ADR previo.

## Decisión
1. **Reutilizar `indicators.updated` (`schemas/indicators.v1.json`); no se crea un evento
   nuevo para los indicadores P2P.** El schema ya es un array `{indicator, currency,
   value}` con `indicator` como string libre, así que los nombres canónicos P2P entran
   sin ruptura de contrato (`schema_version` sigue en 1). Un evento por snapshot procesado,
   con `triggered_by` = `event_id` del snapshot (trazabilidad, A09).
2. **Formato largo, lado en el nombre del indicador.** Los indicadores por lado llevan
   sufijo `_buy`/`_sell` (`p2p_mediana_buy`, `p2p_brecha_pct_sell`, …); la microestructura
   entre lados es un solo valor sin sufijo (`p2p_spread_pct`, `p2p_ratio_oferta_demanda`,
   `p2p_momentum_bid_3h_pct`, `p2p_drenaje_oferta_6h_pct`). Una fila por
   `(as_of, indicator, currency)`, consistente con la hypertable `indicators` de fase 1.
3. **Ventanas móviles sobre el propio histórico del motor, no en memoria.** Momentum (3 h,
   al procesar SELL) y drenaje (6 h, al procesar BUY) se calculan consultando el punto
   histórico del indicador base vía el puerto de repositorio (`indicador_asof`). El motor
   sigue sin estado en memoria y sobrevive reinicios (coherente con ADR-0009 en espíritu).
   Ante un **hueco de captura** (el punto más cercano es más viejo que la ventana + 1 h de
   holgura) la ventana se **omite**: una variación sobre datos no contiguos no es
   comparable y sería engañosa (A08).
4. **Cruce entre lados con frescura del lado opuesto (≤ 15 min).** Spread y ratio requieren
   el último snapshot del lado contrario; si ese lado es más viejo que la tolerancia
   (p. ej. tras una pausa de captura), pertenece a otra época del mercado y ambos
   indicadores se **omiten** en lugar de mezclar precios no coetáneos.
5. **`confianza_baja` (> 30 % outliers) suprime las señales, nunca en silencio.** Bajo
   confianza baja solo se publican la referencia y `p2p_outliers_pct`; la brecha, la
   microestructura y las ventanas se omiten. El propio `p2p_outliers_pct` deja el rastro
   del porqué (A09) — no se inventan datos degradados (A10).
6. **Las señales (`signals.emitted` / `signal.v1`) se difieren a una fase posterior.** La
   fase 2 entrega los **insumos** de la señal (la microestructura) como indicadores, con
   umbrales empíricos documentados en `knowledge/metrics/microestructura-p2p.md`, pero
   **no** el evento de señal ni el motor de reglas (RF-4): su vocabulario y sus umbrales
   requieren calibración HITL y un contrato propio. Separar ambos scopes deja la
   microestructura verificable de inmediato sin bloquearla en la definición de señales.

## Alternativas consideradas
- **Evento nuevo `p2p.indicators` separado de `indicators.updated`**: daría un tópico
  dedicado, pero duplicaría el sobre, el consumidor y los contract tests para datos que
  son indicadores como los demás; el api-gateway ya consume `indicators.updated`.
  Descartada por no aportar sobre el string libre de `indicator`.
- **Estado de ventanas en memoria (buffers por lado)**: lecturas más rápidas, pero
  introduce estado volátil que se pierde al reiniciar y hay que re-hidratar; contradice
  el principio "el estado del motor es su histórico". Descartada.
- **Publicar spread/ratio con el lado opuesto sin importar su antigüedad**: más cobertura,
  pero produce microestructura falsa tras huecos de captura (mezcla épocas). Descartada a
  favor de omitir con rastro en log.
- **Entregar señales dentro de la misma fase 2**: unificaría el trabajo, pero acopla la
  entrega verificable de la microestructura a la calibración HITL de umbrales, que es un
  proceso aparte. Descartada; señales quedan como fase propia.

## Consecuencias
- (+) Contrato de eventos estable: el api-gateway consume la microestructura sin cambios
  de schema ni un nuevo binding.
- (+) Indicadores de ventana reproducibles y sin estado frágil; los huecos de captura son
  visibles (omisión + log) en lugar de producir variaciones espurias.
- (+) La microestructura queda entregada y verificada (49 tests) sin esperar a la
  definición de señales.
- (−) Consultar el histórico por cada ventana añade lecturas a TimescaleDB por snapshot
  (2/min); aceptable al ritmo actual, revisable si la cadencia sube.
- (−) La semántica de cada indicador vive en el nombre string (convención), no en el
  schema: el catálogo canónico se mantiene en `knowledge/metrics/` y en
  `domain/models.py`, no en `indicators.v1.json`.
- (−) El evento `signals.emitted` sigue sin existir: `api-contracts.md`, la OpenAPI del
  gateway y la futura AsyncAPI arrastran ese `<TODO>` hasta la fase de señales.
