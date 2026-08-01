---
type: AMQP Event
title: analysis.updated
description: Lectura mecánica de los seis medidores del panel en cada revisión — banda dentro de su propia historia y proximidad a las reglas del ruleset. Implementado (RF-6).
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
summary}` (contrato `schemas/analysis.v1.json`). El `occurred_at` del sobre es
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

Definición de la lectura y sus reglas: [lectura de
indicadores](../metrics/lectura-de-indicadores.md).
