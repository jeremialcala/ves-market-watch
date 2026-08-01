---
type: AMQP Event
title: analysis.updated
description: Lectura mecánica de los seis medidores del panel en cada revisión —banda dentro de su propia historia y proximidad a las reglas del ruleset— más la lectura del mercado como un todo. Implementado (RF-6 y RF-7).
resource: ../../schemas/analysis.v1.json
tags: [análisis, indicadores, implementado]
timestamp: 2026-08-01T00:00:00Z
---

# analysis.updated

Productor: [indicator-engine](../services/indicator-engine.md) · Consumidor:
[api-gateway](../services/api-gateway.md). **Implementado (ambos lados,
2026-08-01):** el motor lo emite junto a cada `indicators.updated` (RF-6,
ADR-0019); el gateway lo valida, hace push WSS al tópico `analysis` y lo sirve
por `GET /api/v1/analysis/current` desde la tabla
[indicator_analysis](../tables/indicator_analysis.md).

Payload: `{as_of, currency, calc_version, analysis_version, ruleset_version,
confidence, official_stale, triggered_by, indicators[], rule_proximity[],
summary, reading?, gap_history?}` (contrato `schemas/analysis.v1.json`). El `occurred_at` del sobre es
la hora de emisión; `as_of` es el instante del dato de mercado de la revisión.

**Qué es**: por cada medidor con valor vigente, en qué **banda** cae dentro de
una escala de percentiles reales de la ventana de 90 días, su **posición** de
dibujo sobre esa escala con los cortes que la generan, y a cuánto está de cada
umbral del ruleset que lo consume. Más `rule_proximity`: k de n condiciones por
regla y cuál bloquea.

**Qué NO es**: un pronóstico. `summary` es aritmética sobre el estado presente,
sin probabilidades ni horizontes. `summary.rules_met` NO implica emisión — el
cooldown pudo suprimirla; la emisión real vive en
[signals.emitted](signals-emitted.md).

Vocabulario neutro de idioma (el engine clasifica, el cliente redacta):

| Campo | Valores | Nota |
|---|---|---|
| `band` | `very_low` <p10 · `low` [p10,p50) · `high` [p50,p90) · `very_high` ≥p90 · `unscaled` | `unscaled` cuando la escala es el respaldo: sin distribución empírica no hay alto/bajo |
| `scale.source` | `percentiles` \| `ruleset` | La degradación viaja en el payload, nunca es silenciosa |
| `confidence` | `normal` \| `low` | `low` = > 30 % de outliers ⇒ ninguna regla es evaluable |

Un indicador **sin valor vigente no aparece** en `indicators`, y una condición
cuyo indicador no está vigente lleva `value: null` — jamás el último conocido
rancio. `position: null` significa que no hay escala dibujable: cero píxeles
inventados.

## `reading` — la lectura del mercado (RF-7, ADR-0021, desde 2026-08-01)

Campo **opcional y aditivo**: un productor sin config de lectura publica el mismo
evento sin él, y por eso el gateway puede desplegarse por delante del motor pese
al `additionalProperties: false`.

Va **dentro** de este evento, no en uno propio, por una razón concreta: la
lectura cita las cifras del propio análisis (bandas, distancias, regla más
cercana), así que tiene que ser atómicamente coherente con él. En dos eventos
separados el cliente podría pintar una lectura que contradice sus propios
medidores.

`{version, window_hours, regime, axis_movement, axis_gap, gauges_near_threshold,
claims[]}`.

| Campo | Valores | Nota |
|---|---|---|
| `regime` | `<axis_movement>_<axis_gap>` \| `null` | `null` si CUALQUIER eje no resolvió: media clasificación no se publica |
| `axis_movement` | `subiendo` \| `lateral` \| `bajando` \| `null` | Desde `p2p_momentum_bid_3h_pct`, umbral ±0,5 % |
| `axis_gap` | `ampliando` \| `estable` \| `comprimiendo` \| `null` | Δ brecha sobre `window_hours`, umbral ±0,5 pp |
| `gauges_near_threshold` | entero ≥ 0 | Distancia medida en coordenadas de dibujo [0,1]: en unidades crudas no se podría comparar un % de brecha con un ratio |
| `claims[].code` | `confianza_baja` · `oficial_rancia` · `brecha` · `atribucion` · `medidor_en_banda` · `regla_cerca` | Lista **ORDENADA**: lo que invalida al resto va primero |
| `claims[].data` | `{clave: string}` | Cifras como string exacto, en punto fijo |

**Los silencios también son contrato**: `atribucion` no aparece si la oficial
está rancia (la brecha se calculó contra una tasa vencida), `medidor_en_banda` no
aparece con banda intermedia ni con escala en respaldo, y `regla_cerca` no
aparece con confianza baja.

**Qué NO es**: régimen predictivo. Clasifica el presente con umbrales de config
versionada; ADR-0019 pto. 9 quedó enmendado para acotar el término. Ninguna
afirmación dice qué hacer.

## `gap_history` — la brecha contra su historia (RF-7, desde 2026-08-01)

Segundo bloque **aditivo y opcional**, en el mismo evento y por la misma razón que
`reading`: la tarjeta cita a la vez el valor de hoy y sus referencias.

`{sides: [{side, current, references: [{days_configured, days_covered, samples,
mean, max, min}]}]}`.

**`days_covered` es lo que hay que mirar.** Menor que `days_configured` ⇒ la serie
no alcanza la ventana pedida; se publica igual, declarándolo, y la UI rotula el
tramo real. Mismo mecanismo que `scale.samples`/`min_samples`.

`mean` va **ponderada por hora**, no por muestra: la serie derivada
([indicators](../tables/indicators.md), `calc_version 0`) tiene una fila cada 10 min
y la del motor una cada ~30 s. `max`/`min` sí son por muestra.

Definición de la lectura y sus reglas: [lectura de
indicadores](../metrics/lectura-de-indicadores.md) (por medidor) y [lectura de
mercado](../metrics/lectura-de-mercado.md) (el mercado como un todo).
