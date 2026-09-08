---
type: Metric
title: Lectura de indicadores — bandas, escala y proximidad a las reglas
description: Cómo se lee cada medidor del panel contra su propia historia de 90 días y contra los umbrales del ruleset. Es descripción del presente, no pronóstico.
tags: [análisis, indicador, implementado, p2p]
timestamp: 2026-08-01T00:00:00Z
---

# Lectura de indicadores

Lo que el indicator-engine calcula por cada revisión (RF-6, ADR-0019) y publica
en [analysis.updated](../events/analysis-updated.md). No es un indicador nuevo:
es la **lectura** de los que ya existen —
[microestructura P2P](microestructura-p2p.md), [brecha](brecha-cambiaria.md) y
[precio de referencia](precio-referencia-p2p.md)— contra dos referencias.

## Referencia 1 — su propia historia (la escala)

Los cortes son los **percentiles reales** de la ventana declarada en
`apps/indicator-engine/config/analisis.v1.yaml` (90 días, p10/p50/p90),
calculados con `percentile_disc` sobre la hypertable
[indicators](../tables/indicators.md) — valores realmente observados en la
serie, en `numeric` exacto, nunca interpolados ni pasados por float (ADR-0017).

| Banda | Condición | Se lee como |
|---|---|---|
| `very_low` | valor < p10 | de los más bajos de la ventana |
| `low` | p10 ≤ valor < p50 | por debajo de lo normal |
| `high` | p50 ≤ valor < p90 | por encima de lo normal |
| `very_high` | valor ≥ p90 | de los más altos de la ventana |
| `unscaled` | — | no hay escala empírica que lo sostenga |

`position` es una **coordenada de dibujo** en [0,1], interpolada linealmente
entre los cortes publicados: NO es el percentil empírico del valor. El payload
lleva los cortes que la generan, así que es reproducible.

### Cuándo NO hay banda

La escala de percentiles se usa solo si hay **muestras suficientes**
(`muestras_minimas: 200`, ~100 min de captura), el dominio tiene dispersión
(min < max) y los **cortes son estrictamente crecientes**. Si falla cualquiera
de las tres, se cae al respaldo del ruleset y la banda es `unscaled`.

Lo tercero no es remilgo: `p2p_outliers_pct_buy` tiene su distribución
concentrada en cero (p10 = p50 = p90 = 0 con 14 000 muestras), y con cortes
coincidentes un snapshot impecable —0 % de outliers— salía clasificado
`very_high`, «de lo más alto de los últimos 90 días». Sin dispersión entre los
cortes no hay alto ni bajo que declarar.

## Referencia 2 — los umbrales del ruleset (la proximidad)

Por cada condición del ruleset versionado que consume el indicador se publica su
umbral, su operador, si está cumplida y la **distancia**: cuánto debe moverse el
valor *en la dirección exigida* (`umbral − valor` con gt/gte, `valor − umbral`
con lt/lte). ≤ 0 significa satisfecha.

El mapeo indicador→reglas **no se declara**: se deriva del ruleset cargado, para
que no pueda desincronizarse. Un indicador puede alimentar varias condiciones —
`p2p_ratio_oferta_demanda` alimenta las tres reglas de `senales.v1.yaml`.

`rule_proximity` agrega eso por regla: k de n condiciones cumplidas y cuál
bloquea (la no cumplida de mayor distancia; empate por orden alfabético). Una
regla con algún indicador no vigente **no es evaluable**, mismo criterio por el
que no dispararía.

## La línea que no se cruza

Todo lo anterior describe el presente. **No hay pronóstico, ni régimen, ni
probabilidad, ni horizonte temporal.** `summary.rules_met` lista las reglas con
todas sus condiciones cumplidas y se llama así, no «señales activas», porque el
cooldown de 60 min pudo suprimir la emisión: lo que se emitió de verdad vive en
[signals.emitted](../events/signals-emitted.md).

Con `confidence: low` (> 30 % de outliers) las señales se suprimen y **ninguna
regla es evaluable**: la lectura de cada medidor sigue siendo válida, pero
hablar de proximidad cuando los avisos están apagados engañaría.

El cliente ([web-spa](../services/web-spa.md)) redacta la prosa ES/EN desde
estos códigos; ninguna cadena de la interfaz dice «percentil X» — dicen la banda.
