# PRD — Análisis comprensivo (vista `AnalysisView`)

- **Estado:** cerrado — determinación aplicada; la vista se disolvió el 2026-09-07
- **Fecha:** 2026-09-07
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 01-requirements
- **Versión:** Unreleased
- **Gate:** 0 (incremental)
- **Feature ID:** analisis-comprensivo

La vista de Análisis es la única del producto que sigue llevando el sello
`demo · sin fuente`, y lo lleva **dos veces**. Este documento determina qué dato
haría falta para retirar cada sello, qué hay ya en la plataforma y qué no.

Las cifras se midieron contra la base de desarrollo el **2026-09-07**.

> **Desenlace (2026-09-07).** Los tres bloques siguieron caminos distintos y
> conviene no confundirlos: los **riesgos** pasaron a dato servido, los
> **escenarios** se retiraron por inconstruibles, y la **presión de liquidez**
> se mudó junto a la profundidad del dashboard. Con dos bloques que no eran
> análisis del mercado, la pestaña dejó de justificarse y **la vista se
> disolvió**: RF-8 queda absorbido en RF-2, no retirado. Nada medido se perdió.

## Qué hay hoy en la vista

Tres bloques, no dos:

| Bloque | Estado | Fuente |
|---|---|---|
| **Presión de liquidez** | ✅ real | `p2p_liquidez_{buy,sell}` vía `/indicators/current` |
| **Riesgos que vigilar** | ✅ real *(2026-09-07)* | `risks` de `/analysis/current`, cortes en `riesgos.v1.yaml` |
| ~~**Escenarios**~~ | ⛔ retirado *(2026-09-07)* | inconstruible: ver abajo |

Los dos bloques sellados no son el mismo problema y **no deben tratarse juntos**:
uno es ensamblaje sobre dato que ya existe; el otro no se puede hacer como está
especificado. Tratarlos como una sola deuda es lo que ha mantenido parados a los
dos.

## Bloque 1 — «Riesgos que vigilar»: el dato ya está entero

Los cuatro riesgos redactados nombran condiciones **concretas y medibles**. No
son prosa: cada tarjeta ya cita su propio umbral. Los cuatro tienen fuente hoy.

| Riesgo | Dato requerido | ¿Existe? | Dónde | Valor hoy |
|---|---|---|---|---|
| Libro concentrado | `p2p_merchants_pct_{buy,sell}` vigente | ✅ | `/indicators/current` | **60,50 %** (buy) |
| Rancidez de la oficial | `official_stale` | ✅ | `/analysis/current`, campo de primer nivel | — |
| Umbrales sin recalibrar | `ruleset_version` + emisiones por regla | ✅ | `/analysis/current` + `/signals` | ver abajo |
| Calidad del snapshot | `confidence` + `p2p_outliers_pct_{buy,sell}` | ✅ | `/analysis/current` + `/indicators/current` | **0,00 %** |

**Lo que falta no es dato: es la regla que convierte el valor en nivel.** Las
tres etiquetas (`alto` / `medio` / `bajo`) necesitan cortes declarados y
versionados, con la misma disciplina con que `senales.v1.yaml` versiona los
suyos. Un nivel calculado con constantes escritas dentro del componente sería
demo otra vez, solo que sin sello — que es peor.

**Al conectarlo, el bloque va a contradecir su propia redacción**, y eso es
justamente la razón de conectarlo:

- «Libro concentrado» está pintada en nivel `alto`, con el texto «una proporción
  alta de merchants». El valor real es **60,50 %** contra su propio umbral
  declarado de 80 %. Hoy no es alto.
- «Umbrales sin recalibrar» dice «tres reglas, una con una sola aparición
  histórica». La realidad es **peor**: de las tres reglas declaradas,
  `arranque_alcista` lleva 55 emisiones, `correccion_inminente` 3 y
  **`techo_inminente` no ha emitido ni una sola vez** en los 42 días que lleva
  corriendo el motor de reglas.
- «Calidad del snapshot» dice «Confianza: normal» y acierta: outliers al 0,00 %
  contra un corte de confianza baja en el 30 %.

El vocabulario del tercer riesgo **ya está escrito** y no hay que inventarlo:
`lib/historialReglas.ts` clasifica cada regla en `sin-casos` / `hipotesis` /
`indicativa` con un mínimo de 6 casos. Ese criterio es el que debe gobernar su
nivel.

> **Restricción de contrato, heredada.** El PRD del motor prohíbe el «N de M»
> agregado porque se lee como tasa de acierto. Un riesgo que dijera «la regla X
> acierta el 40 %» viola eso. Lo que sí se puede decir es **cuánta evidencia
> tiene** cada regla: es un hecho de completitud, no un juicio sobre ninguna.

## Bloque 2 — «Escenarios»: no se puede como está especificado

Cada tarjeta afirma una **probabilidad** (62 % / 24 % / 14 %) y un **rango de la
brecha a 72 h** (12,5–14,2 %). Eso es un pronóstico.

Hay dos razones independientes para no construirlo así. La segunda sobrevive
aunque se decidiera levantar la primera.

### Razón 1 — el contrato lo prohíbe, con su propio texto

La ficha de `analysis.updated` lo dice sin rodeos:

> **Qué NO es**: un pronóstico. `summary` es aritmética sobre el estado presente,
> **sin probabilidades ni horizontes**.

Y sobre el régimen: «**Qué NO es**: régimen predictivo». El no-objetivo del PRD
del motor es no insinuar capacidad predictiva. Publicar un 62 % a 72 h la
insinúa de la forma más directa que existe.

### Razón 2 — el dato no lo soporta, y no por falta de meses

Aunque se levantara la restricción, **la variable condicionante no persiste lo
suficiente para condicionar nada**. El `regime` de `reading` es la única
descripción de estado que la plataforma produce, y dura esto:

| Régimen | Episodios | Duración media | Máxima |
|---|---|---|---|
| `lateral_estable` | 396 | 0,99 h | 36,9 h |
| `lateral_ampliando` | 179 | 0,72 h | 6,3 h |
| `lateral_comprimiendo` | 159 | 0,86 h | 16,0 h |
| `subiendo_estable` | 121 | 0,55 h | 4,5 h |
| `bajando_estable` | 102 | 0,26 h | 3,7 h |
| `subiendo_ampliando` | 53 | 0,89 h | 5,2 h |
| `bajando_comprimiendo` | 44 | 0,48 h | 3,2 h |
| `bajando_ampliando` | 37 | 0,22 h | 1,8 h |
| `subiendo_comprimiendo` | 32 | 0,25 h | 1,4 h |

**1 123 episodios en 38 días: el régimen cambia unas 30 veces al día.** El
horizonte de la tarjeta es 72 h — entre 72 y 300 veces la duración típica del
estado sobre el que pretende condicionar. A la tercera hora el régimen ya ha
cambiado varias veces, así que «dado que hoy estamos en X, a 72 h…» se queda sin
sujeto.

Esto **no se arregla esperando**. Acumular un año daría más episodios de un
minuto, no episodios largos. Haría falta un estado *definido para durar*
—resolución diaria, o histéresis como la que ya usan los cruces del Intradía—, y
eso es una decisión de diseño, no una espera.

A eso se suman los límites de cobertura, que conviene tener a la vista:

| Serie | Filas | Desde | Nota |
|---|---|---|---|
| `official_rates` | 44 224 | 2020-03-30 | 6 años |
| `indicators` · `p2p_brecha_*_sell` (cv 0) | 30 772 | 2025-12-02 | **la única serie larga** |
| `indicators` · todo lo demás (cv 1) | ~1,39 M | 2026-07-20 | microestructura: 49 días |
| `indicator_analysis` (régimen) | 88 896 | 2026-08-01 | 37 días |
| `signals` | 58 | 2026-07-27 | 2 reglas de 3 han emitido |

De la microestructura que **define** el régimen hay 49 días. Antes del
2026-07-20 solo existe la brecha del lado venta, derivada del backfill.

### Qué sí soporta el dato

La distribución **incondicional** del movimiento de la brecha a 72 h, sobre los
9 meses de serie de venta:

| Tramos de 72 h | Mediana | Mínimo | Máximo | < 1 pp | ≥ 3 pp |
|---|---|---|---|---|---|
| 277 | −0,17 pp | −76,52 pp | +46,18 pp | 62 (22 %) | 101 (36 %) |

Es historia observada, no pronóstico — el mismo movimiento que ya hace
«Episodios comparables» en Histórico. Nótese la cola: la mediana es casi cero y
el recorrido va de −76 a +46 pp. **Un rango «12,5–14,2 %» con un 62 % detrás no
tiene de dónde salir.** Lo honesto que se puede afirmar es que en 9 meses solo 22
de cada 100 tramos de 72 h se movieron menos de 1 pp.

## Lo que falta, en concreto

Ordenado por lo que desbloquea:

1. ~~**Cortes de nivel para los riesgos**, declarados y versionados en config
   del motor, no como constantes del componente.~~ **Hecho el 2026-09-07**:
   `apps/indicator-engine/config/riesgos.v1.yaml` (v1) y el bloque `risks` de
   `analysis.updated`, con cada corte justificado por su distribución medida.
   **Conectada la vista el mismo día**: `PanelRiesgos` lee `risks` y el bloque
   perdió su sello `demo · sin fuente`.
2. ~~**`GET /api/v1/analysis/history`.**~~ **Descartado el 2026-09-08, con la
   razón medida.** No es deuda pendiente: es una decisión.

   - **No puede servir documentos.** 2 344 revisiones/día a ~4 KB cada una. Un
     solo día son 9 MB; noventa, unos 840 MB. Tendría que ser una proyección.
   - **Agregado al vuelo rompe un SLO firmado.** Un `time_bucket` de 1 h sobre
     90 días tarda **4,57 s** —y eso con solo 39 días en la tabla—, contra un
     SLO de histórico de **≤ 2 s** (medido en 757 ms). Cumplirlo exigiría un
     **continuous aggregate**, mecanismo que el proyecto no usa en ninguna parte.
   - **La retención ya lo acota a 90 días** (`drop_after: 90 days` sobre
     `indicator_analysis`). El endpoint nunca podría ofrecer más ventana que la
     que el tope de rango ya permite: los dos límites coinciden.
   - **Y se quedó sin consumidor.** El argumento original era que ningún bloque
     que mirase el pasado del análisis era construible sin él. Al disolverse la
     vista de Análisis, no queda quien lo pida.

   Lo que cierra el caso: el único uso que sobrevivía —la distribución
   descriptiva de la brecha a 72 h— lee de `indicators`, **no** de
   `indicator_analysis`. Lo desbloquea el punto 3, no este.

   Si algún día vuelve a hacer falta, el trabajo real no es el endpoint sino el
   continuous aggregate que lo sostenga dentro del SLO.
3. ~~**Decisión sobre el techo de 90 días.**~~ **Resuelto el 2026-09-08.** No
   subiendo el techo, sino **cambiando lo que mide**: el rango de
   `/indicators/history` se acota por **filas** —`(to − from) / interval`, tope
   26 000 buckets— y no por días de calendario.

   El criterio viejo era ciego al intervalo, y eso acotaba el eje equivocado:

   | Petición | Filas | En la DB | Regla vieja |
   |---|---|---|---|
   | 279 d a `1d` | 279 | 38,9 ms | **bloqueada** |
   | 90 d a `5m` | 25 920 | 78,9 ms + 52 páginas | permitida |

   **El peor caso no se relaja, se conserva**: 26 000 es justo lo que ya
   permitía la escala más fina (90 d a `5m` = 25 920). Lo que cambia es que ese
   presupuesto se reparte según lo que cuesta cada bucket. Los 9 meses de brecha
   derivada quedan alcanzables a granularidad diaria.
4. **Definición de un estado que dure**, si algún día se quiere algo
   condicionado. No es un problema de datos sino de diseño, y merece su ADR.

## Recomendación

Separar los dos sellos en dos trabajos distintos:

- ~~**«Riesgos que vigilar» → hacerlo real ahora.**~~ **Hecho el 2026-09-07.**
  Al conectarlo pasó lo previsto: «Libro concentrado» dejó de decir `alto`. Y
  apareció un quinto estado que la redacción no tenía — **`sin medir`**, para el
  riesgo cuyo indicador no está vigente, que no se degrada a `bajo`.
- ~~**«Escenarios» → no hacerlo como está.**~~ **Retirado el 2026-09-07.** De
  las dos salidas que este documento planteaba —sustituirlo por lo que la brecha
  hizo en su historia, o quitarlo— se eligió quitarlo. Mantenerlo con sello era
  la peor: el sello explicaba que el número era de ejemplo, pero no que fuera
  **inconstruible**, y esa diferencia es justo la que importa.

  Si algún día se quiere el bloque descriptivo, el material sigue aquí: la
  distribución incondicional a 72 h de la tabla de arriba, sin probabilidades ni
  condicionamiento. Necesitaría además levantar el techo de 90 días (punto 3).

## Trazabilidad

- Contrato del análisis: `schemas/analysis.v1.json`, `knowledge/events/analysis-updated.md`
- Lectura de mercado y régimen: ADR-0021, `knowledge/metrics/lectura-de-mercado.md`
- Lectura por medidor: ADR-0019, RF-6
- Ruleset y sus umbrales: `apps/indicator-engine/config/senales.v1.yaml` (v1)
- Prohibición del contador agregado: `apps/web-spa/src/lib/historialReglas.ts`
- Techo de rango: `apps/api-gateway/src/api_gateway/domain/paginacion.py`
