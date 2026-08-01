# ADR-0021: Lectura del estado de mercado — régimen descriptivo por revisión

- **Estado:** accepted
- **Fecha:** 2026-08-01
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 03-implementation
- **Versión:** Unreleased (se sincroniza al próximo corte)
- **Controles OWASP afectados:** A05 (honestidad de la presentación), A08 (config
  versionada), A09/T10 (trazabilidad: la versión de umbrales viaja en el payload)

## Contexto

La tarjeta «Lectura de hoy» del dashboard era **100 % maqueta**: el titular del
régimen, la prosa y hasta la barra de confianza (`width: "68%"` escrito a mano)
eran literales de `MarketRegimeCard.tsx`. Llevaba el sello `demo · sin fuente`
porque la plataforma no calculaba nada de eso.

ADR-0019 dejó los seis medidores leídos mecánicamente contra percentiles reales,
pero un panel de seis barras sigue exigiendo que quien lo mira sepa qué mirar. El
charter apunta a quien administra su presupuesto mensual, no a una mesa de
operaciones. Falta la frase que responde «¿qué está haciendo el mercado ahora?».

## La frontera, que es lo que decidió el diseño

La maqueta mezclaba **cuatro registros** y dos chocaban con límites que el propio
repositorio ya se había puesto:

| Frase de la maqueta | Registro | Veredicto |
|---|---|---|
| «el lado buy está en su tercio más barato de los últimos 90 días» | hecho | ✅ ya se calculaba (`band`) |
| «la brecha se cierra porque sube la oficial, no porque caiga el paralelo» | atribución causal | ✅ calculable, faltaba cablearlo |
| «si tienes que convertir, …» | condicional orientativo | ✅ informa sin ordenar |
| «no se reabre cuando el paralelo despierte» | **predicción** | ❌ ADR-0019 pto. 9: «ni pronósticos» |
| «Hoy no hay nada que ejecutar» | **consejo** | ❌ PRD motor: «recomendaciones financieras personalizadas» es no-objetivo |

Se implementan los tres primeros. No es una restricción traída de fuera: son los
límites que el proyecto se puso a sí mismo, y el registro elegido sigue cubriendo
todo lo que la maqueta hacía bien.

## Decisión

1. **Régimen DESCRIPTIVO, no predictivo — y por eso ADR-0019 queda enmendado.**
   Su punto 9 dice «ni detección de régimen». Lo que excluía era el régimen
   *predictivo* (anticipar el siguiente estado, con probabilidades y horizontes);
   esto clasifica el **presente** con umbrales de config versionada, que es
   aritmética de la misma clase que las bandas que 0019 sí introdujo. Sin esta
   enmienda explícita el repositorio se contradice a sí mismo.

2. **Dos ejes mecánicos, no un modelo.** Movimiento del paralelo (desde
   `p2p_momentum_bid_3h_pct`) × dinámica de la brecha (Δ`p2p_brecha_pct_buy` sobre
   6 h), cada uno partido en tres tramos simétricos. El régimen es la celda:
   `lateral_comprimiendo`, `subiendo_ampliando`, … Nueve celdas, ningún ajuste, y
   cada clasificación se puede reproducir a mano desde el payload.

3. **Si un eje no resuelve, NO hay régimen.** Publicar «lateral» a secas cuando la
   brecha no se pudo medir daría a entender que la brecha está quieta, y no se
   sabe. Los ejes que sí resolvieron viajan igual (`axis_movement`, `axis_gap`):
   se omite la clasificación, no el dato.

4. **Campo `reading` ADITIVO en `analysis.v1.json`, no un evento nuevo.** Al revés
   que en ADR-0019, aquí la lectura **cita las cifras del propio análisis**
   (bandas, distancias, regla más cercana), así que tiene que ser atómicamente
   coherente con él: en dos eventos separados el SPA podría pintar una lectura que
   contradice sus propios medidores. El coste asumido es que, con
   `additionalProperties: false`, el gateway se despliega antes que el engine — con
   `docker compose up --build` ambos salen a la vez, así que hoy es una nota para
   despliegues escalonados que no existen.

5. **El engine CLASIFICA, el SPA REDACTA** (igual que ADR-0019 pto. 2). El evento
   lleva códigos neutros de idioma y sus cifras; la prosa ES/EN vive en el
   diccionario tipado del SPA. Una frase en el payload ataría el contrato a un
   idioma y partiría la redacción en dos sitios.

6. **Afirmaciones ORDENADAS, y el orden es semántico.** `claims` es una lista, no
   un conjunto: lo que invalida al resto va primero (`confianza_baja`, luego
   `oficial_rancia`). El cliente concatena una frase por código sin decidir nada.
   Evita la explosión combinatoria de redactar 9 regímenes × 5 estados degradados.

7. **La atribución causal se apoya en una identidad exacta, no en una
   correlación.** `Δbrecha_abs = Δparalelo − Δoficial`. Los tres términos salen de
   `indicador_asof`, que ya existía y es agnóstico del nombre, así que no hubo SQL
   nuevo. Cuando un lado aporta ≥ 80 % del movimiento total se lleva la
   atribución; por debajo, `ambos`.

8. **La guarda de hueco de captura NO se aplica a `official_rate`, y es
   deliberado.** Las series `p2p_*` se persisten en cada revisión: una fila vieja
   significa hueco de captura y la variación no es comparable. `official_rate` se
   persiste **solo cuando la tasa cambia** (ADR-0008), así que una fila de hace
   tres días no es un hueco: es una meseta, y `Δoficial = 0` es **evidencia
   positiva** de que el movimiento fue del paralelo. Aplicarle la guarda apagaba
   la atribución casi siempre — que es justo el caso que esta lectura existe para
   describir. Lo que sí invalida esa serie —que el BCV lleve demasiado sin
   publicar— ya lo cubre `official_stale`, y con él la atribución se calla entera.

9. **Solo se comentan las bandas EXTREMAS.** «De lo más barata en 90 días» solo es
   cierto en `very_low`/`very_high`. En `low`/`high` la frase saldría igual de bien
   redactada y sería falsa, y con `unscaled` no hay escala empírica que la
   sostenga.

10. **Umbrales medidos, no elegidos a ojo.** `movimiento: 0.5` es exactamente el
    umbral con el que `arranque_alcista@v1` considera que el momentum significa
    algo — reutilizarlo evita que el producto tenga dos definiciones de «sube».
    `brecha: 0.5` pp es la variación absoluta media a 6 h observada en la serie
    real: **0,55 pp**, con el intercuartílico en **[0,21 – 0,76]** (274 ventanas,
    remedido el 2026-08-01). El umbral cae dentro de ese rango, cerca del centro:
    «estable» significa «se movió menos que un movimiento típico de 6 h». Ambos
    quedan sujetos a recalibración, viven en config versionada y la versión viaja
    en `reading.version`.

11. **`proximidad_umbral` en coordenadas de dibujo [0,1], no en unidades crudas.**
    Es lo único que hace comparable un porcentaje de brecha con un ratio de
    oferta/demanda. 0,1 significa «a una décima del ancho de su propia escala».

12. **Fuera la barra de confianza del 68 %.** No hay ningún dato continuo que la
    sostenga: `confidence` es binario (`normal|low`). La maqueta además decía
    «Confianza media» con 0,50 % de outliers, y «media» no existe en el contrato.
    Se sustituye por chips con el valor real.

13. **Ampliación (2026-08-01): la brecha contra su propia historia.** Se añaden
    tres afirmaciones —`brecha_vs_historia`, `brecha_extremo` e
    `historia_parcial`— y un bloque aditivo `gap_history` con media, extremos y,
    lo decisivo, **los días realmente cubiertos** de cada ventana.

    `days_covered` es el mecanismo, calcado de `scale.samples`/`min_samples`: una
    ventana de 30 días con 12 de serie **se publica igual**, declarando su
    alcance, para que el cliente rotule el tramo verdadero. La tarjeta llevaba
    meses diciendo «Promedio 30 días» sobre 12 días de historia — el número era
    real y la etiqueta no.

    Se emite **una comparativa por lado**, contra la ventana COMPLETA más ancha:
    tres ventanas × dos lados serían seis frases y ninguna se leería. Los números
    de las demás viajan igual en `gap_history`. Y si ninguna ventana está
    completa, se emite `historia_parcial` **en lugar** de la comparativa: citar
    una media de 12 días como referencia de 90 sería el fallo que esto corrige.

14. **La media se promedia POR HORA, no por muestra**, y esto no es refinamiento
    estadístico: es corrección de un sesgo medido. El histórico derivado
    (ADR-0013 RF-7) tiene una fila cada 10 min y la serie del motor una cada
    ~30 s, así que un `avg()` plano pondera 6× el tramo reciente. Sobre la brecha
    de venta a 90 días: **20,37 % plana contra 25,81 % ponderada — 5,42 pp**. Los
    tres métodos ponderados convergen (hora 25,81, día 25,79, hora-luego-día
    25,77); la plana es la que se sale. El sesgo es < 0,2 pp en las otras cinco
    combinaciones lado×ventana: solo aparece donde la ventana cruza la unión del
    backfill.

    Los **extremos siguen siendo por muestra**: son valores realmente observados
    y promediarlos por hora escondería justo el pico que interesa.

15. **La cifra que cita la prosa tiene que estar a la vista.** Regla de
    presentación con test propio, aprendida de un defecto real: la tarjeta decía
    «7,70 puntos por debajo de su promedio de 90 días» mientras esa fila mostraba
    el MÁXIMO. La media citada no aparecía, así que la afirmación era
    incomprobable — y restar el máximo daba otro número, con lo que la tarjeta
    parecía contradecirse.

16. **Qué NO se hace:** ni pronósticos, ni probabilidades, ni horizontes, ni
    consejo imperativo. Lo que orienta va en **condicional** («si tienes que
    comprar, hoy…»), que informa sin ordenar. Los escenarios con probabilidades
    (62/24/14 %) y los riesgos redactados **conservan su sello demo**: hacerlos
    reales exigiría pronosticar. Esta entrega retira **un** sello de tres.

## Alternativas consideradas

- **Un evento `reading.updated` propio**: descartado por el punto 4 — la lectura
  cita cifras del análisis y separarlos permite incoherencia visible.
- **Redactar la prosa en el engine**: descartado, ataría el contrato a un idioma.
- **Un tercer eje (liquidez / volumen)**: descartado por ahora. Con 3 ejes son 27
  celdas y el titular deja de ser legible; además el drenaje de oferta ya aparece
  como medidor propio.
- **Umbrales adaptativos (percentiles de la propia variación)**: descartado como
  prematuro. Haría el régimen irreproducible a mano y opaco: «lateral» pasaría a
  significar cosas distintas según la ventana.
- **Persistir Δbrecha y Δoficial como indicadores nuevos**: descartado. Son
  insumos de presentación de la lectura, que ya se persiste verbatim en
  `indicator_analysis`; persistirlos obligaría a meterlos en el panel, subir
  `calc_version` y ampliar el contrato de indicadores sin que nadie los pida.

## Consecuencias

- (+) La tarjeta deja de ser maqueta: titular, prosa y chips salen del análisis
  de la revisión. El SPA pasa de **3 sellos demo a 2**.
- (+) La atribución causal responde a la pregunta que el panel no respondía: no
  solo «la brecha se cerró», sino **qué lado la cerró**.
- (+) El régimen es reproducible a mano desde el payload: dos umbrales, dos
  cifras y una tabla de nueve celdas.
- (−) **Un régimen con nombre pegadizo invita a citarlo fuera de contexto.** El
  pie de aclaración es obligatorio y no se retira «por limpieza visual» — hay un
  test que lo exige.
- (−) **La prosa compuesta puede leerse como narrativa causal más fuerte de lo que
  es.** El orden de los claims lo decide el motor y se revisó con datos reales,
  pero es una lectura que hay que volver a mirar cuando el mercado cambie de cara.
- (−) Con `confidence: low` el motor no calculó la microestructura, así que la
  lectura se apoya en valores de hasta 20 min o no resuelve. Se dice en la tarjeta.
- (−) Los umbrales son de v1 y saldrán de recalibración, igual que el ruleset.
- (−) La guarda asimétrica del punto 8 es una regla que hay que **recordar** al
  añadir series: si mañana entra otro indicador publicado-solo-en-cambio, habrá
  que declararlo. Está anotado en el propio código y con un test que lo nombra.
- (−) **El muestreo dejó de ser uniforme** al empalmar el histórico derivado con
  la serie del motor. Toda agregación futura sobre `indicators` que cruce el
  2026-07-20 tiene que ponderar por tiempo; un `avg()` plano se inclina hacia el
  tramo más denso. Hay un test de integración que lo reproduce con datos
  sembrados (6/h contra 120/h) y exige la media honesta.
- (−) **Los campos aditivos con enum cerrado obligan a desplegar el gateway
  ANTES que el motor**, y el punto 4 ya lo advertía. Al añadir los claims nuevos
  se desplegó al revés y el gateway descartó cada `analysis.updated` («no es uno
  de […]») hasta ampliar el enum. El pipeline estuvo degradado unos minutos: la
  advertencia estaba escrita y aun así se incumplió, así que conviene tratarla
  como paso del despliegue y no como nota.

## Verificación

- **Engine: 244 tests** (+62 en esta entrega). `domain/lectura.py` al **100 %** de
  líneas. Destacan: los tres tramos de cada eje con el valor exacto en el umbral,
  el régimen `null` con un eje sin resolver, la atribución con `Δoficial = 0` y
  con el BCV publicando, los silencios (sin atribución con la oficial rancia, sin
  banda con escala en respaldo, sin proximidad con confianza baja), las 12
  variantes de config que abortan el arranque, y la **asimetría de la guarda de
  hueco** con su propio test nominal.
- **Contrato: 6 tests nuevos** sobre `analysis.v1.json` — el evento con `reading`
  valida, el evento sin `reading` también (la aditividad es lo que permite el
  despliegue escalonado), las cifras en punto fijo, y 6 variantes inválidas
  rechazadas, entre ellas un claim predictivo fuera del enum y prosa en el evento.
- **SPA: 230 tests, 88,2 % de ramas** (umbral Gate 2: 80 %). La suite nueva
  `lectura.test.tsx` comprueba, además de que pinte, que **no aconseja ni
  predice**: batería de expresiones prohibidas contra el texto renderizado, y la
  aclaración obligatoria presente.
- **En vivo (2026-08-01, compose)**: régimen `lateral_comprimiendo` persistido por
  revisión, coherente con los medidores. Medición real ejecutada contra la base:
  `Δbrecha = −1,168 pp`, `Δparalelo = −8,749 VES`, `Δoficial = 0` exacto ⇒
  atribución `paralelo`. **Antes del arreglo del punto 8 ese `Δoficial` salía
  `None`** y la atribución no se emitía nunca.
- **No verificable hoy**: la atribución `oficial`/`ambos` con el BCV publicando
  dentro de la ventana. El 2026-08-01 es sábado y el BCV no publica en fin de
  semana, así que `official_stale` suprime la atribución por diseño. Cubierto por
  test unitario; queda pendiente de contraste en vivo un día hábil.
