---
type: Metric
title: Lectura de mercado — régimen, atribución y afirmaciones
description: Cómo se clasifica el estado del mercado en cada revisión con dos ejes mecánicos, y a quién se atribuye un movimiento de la brecha. Describe el presente; no aconseja ni pronostica.
tags: [análisis, régimen, implementado, p2p, brecha]
timestamp: 2026-08-01T00:00:00Z
---

# Lectura de mercado

Lo que el indicator-engine produce por cada revisión (RF-7, ADR-0021) en el campo
`reading` de [analysis.updated](../events/analysis-updated.md). Un escalón por
encima de la [lectura de indicadores](lectura-de-indicadores.md): aquella lee
**cada medidor** contra su historia; esta lee el **mercado como un todo**.

Tampoco es un indicador nuevo, y no se persiste como serie: vive dentro del
documento del análisis, que ya se guarda verbatim en `indicator_analysis`.

## El régimen: dos ejes, nueve celdas

| Eje | Fuente | Umbral | Valores |
|---|---|---|---|
| Movimiento del paralelo | `p2p_momentum_bid_3h_pct` | ±0,5 % | `subiendo` · `lateral` · `bajando` |
| Dinámica de la brecha | Δ`p2p_brecha_pct_buy` sobre 6 h | ±0,5 pp | `ampliando` · `estable` · `comprimiendo` |

El régimen es el par: `lateral_comprimiendo`, `subiendo_ampliando`, … La prosa
(«Lateral en compresión») la redacta el cliente; el evento lleva el código.

Los umbrales viven en `apps/indicator-engine/config/lectura.v1.yaml` y la versión
viaja en `reading.version`, así que cualquier lectura publicada es reproducible
contra los umbrales que la generaron. **No son elección a ojo:**

- `0,5 %` de movimiento es *exactamente* el umbral con el que `arranque_alcista@v1`
  considera que el momentum significa algo. Reutilizarlo evita que el producto
  tenga dos definiciones de «sube».
- `0,5 pp` de brecha es la variación absoluta media a 6 h medida sobre la serie
  real (0,56 pp; rango p25–p75 ±0,5). «Estable» significa «se movió menos que un
  movimiento típico de 6 h».

### Si un eje no resuelve, no hay régimen

`regime: null`, y los ejes que sí resolvieron se publican igual. Decir «lateral»
a secas cuando la brecha no se pudo medir daría a entender que la brecha está
quieta, y no se sabe. Se omite la clasificación, no el dato.

## La atribución: quién movió la brecha

Sobre una identidad **exacta**, no una correlación:

```
Δbrecha_abs = Δparalelo − Δoficial
```

Los tres términos salen de `indicador_asof` sobre la hypertable
[indicators](../tables/indicators.md). Cuando un lado aporta ≥ 80 % del
movimiento total (`|Δparalelo| + |Δoficial|`) se lleva la atribución; por debajo,
`ambos`. Si nada se movió, no hay nada que atribuir.

### El detalle que la hace honesta

El BCV se sondea cada 30 min y **solo se persiste fila cuando la tasa cambia**
(ADR-0008). En una ventana de 6 h, `indicador_asof` devuelve la misma fila en
ambos extremos la mayoría de las veces, así que `Δoficial = 0` **exactamente**.
Esa ausencia de cambio es **evidencia positiva** de que el movimiento fue del
paralelo, no un dato que falta.

Por eso la **guarda de hueco de captura no se aplica a `official_rate`**, y es la
asimetría más importante de este cálculo: en las series `p2p_*`, que se persisten
en cada revisión, una fila vieja significa hueco de captura y la variación no es
comparable; en `official_rate` significa meseta. Aplicarle la guarda apagaba la
atribución casi siempre. Lo que sí invalida esa serie —que el BCV lleve demasiado
sin publicar— lo cubre `official_stale`, y con él la atribución se calla entera.

## Las afirmaciones (`claims`)

Una lista **ordenada**, no un conjunto: lo que invalida al resto va primero.

| Código | Cuándo aparece | Datos |
|---|---|---|
| `confianza_baja` | `confidence: low` | — |
| `oficial_rancia` | `official_stale` | — |
| `brecha` | el eje de brecha resolvió | `direccion`, `delta_pp`, `horas` |
| `atribucion` | la brecha se movió **y** la oficial no está rancia | `responsable`, `paralelo`, `oficial` |
| `medidor_en_banda` | `p2p_brecha_pct_buy` en banda **extrema** con escala empírica | `indicador`, `banda`, `dias` |
| `regla_cerca` | hay regla evaluable **y** la confianza no es baja | `regla`, `cumplidas`, `totales` |

El motor no redacta: cada código tiene una frase por idioma en el diccionario del
[web-spa](../services/web-spa.md), que concatena en este orden sin decidir nada.

## La frontera

Es lo que define la métrica tanto como la fórmula:

- **Describe el presente.** Ni pronósticos, ni probabilidades, ni horizontes.
- **No aconseja.** Lo que orienta va en condicional («si tienes que comprar,
  hoy…»). Es el no-objetivo «recomendaciones financieras personalizadas»
  aplicado, y hay un test del SPA que lo comprueba contra el texto renderizado.
- **Solo se comentan las bandas extremas.** En `low`/`high` la frase orientativa
  saldría igual de bien redactada y sería falsa; con `unscaled` no hay escala
  empírica que la sostenga.
- La aclaración de que no es consejo ni pronóstico es **obligatoria** en la UI.
