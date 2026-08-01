# ADR-0019: Módulo de análisis de indicadores — lectura mecánica del panel

- **Estado:** accepted
- **Fecha:** 2026-08-01
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 03-implementation
- **Versión:** Unreleased (se sincroniza al próximo corte)
- **Controles OWASP afectados:** A05 (validación y honestidad de la
  presentación), A01 (permiso reutilizado, mínimo privilegio), A08 (config
  versionada, idempotencia at-least-once), A09/T10 (trazabilidad de la lectura)

## Contexto

El «Panel de instrumentos» del dashboard (ADR-0018) mostraba el **valor real**
de seis medidores, pero todo lo que los rodeaba era fijo: la escala percentil
(`"p12 · 90 d"`), el ancho del relleno (`"38%"`), la marca de umbral (`"70%"`) y
la nota eran literales de `dict.ts`, escritos a mano y **ajenos al valor que se
estaba mostrando**. Por eso el panel entero llevaba el sello `demo · sin fuente`
y por eso el `design.md` del SPA dejaba anotado *«retirar los bloques demo a
medida que el indicator-engine calcule lo que representan»*.

Este trabajo calcula lo que representan. Por **cada revisión** —cada lote de
indicadores que el engine emite ante un `p2p.snapshot`— se produce una lectura
mecánica de los seis medidores: en qué banda cae el valor dentro de una escala
de percentiles **reales** de la historia, y a cuánto está de cada umbral del
ruleset de señales (ADR-0015).

**Frontera explícita:** esto no pronostica. La síntesis del panel es proximidad
aritmética a reglas ya versionadas (`k` de `n` condiciones y cuál bloquea), no
un régimen ni una probabilidad. El proyecto marca como demo todo lo que no
calcula (RF-5), y esta entrega no cruza esa línea: la respeta.

## Decisión

1. **Evento NUEVO, no `indicators.v2`.** `indicators.v1.json` declara
   `schema_version: {const: 1}` y el gateway descarta lo que no valide, así que
   un v2 obligaría a desplegar engine y gateway en el mismo instante y rompería
   el `ws/messages.ts` del SPA. Aditivo no rompe a nadie, y hay precedente:
   `signals.emitted` ya es un segundo evento del mismo caso de uso.

2. **El engine CLASIFICA, el SPA REDACTA.** El engine publica vocabulario neutro
   de idioma (`band: very_low|low|high|very_high|unscaled`, `source`,
   `direction`) exactamente como ya hace con `type`/`direction` de las señales;
   la prosa ES/EN la escribe el diccionario tipado del SPA. Poner las frases en
   el engine ataría el contrato a un idioma; calcular las bandas en el SPA
   abriría una segunda fuente de verdad sobre la lectura.

3. **Percentiles reales, con respaldo VISIBLE.** La escala son los p10/p50/p90
   observados en la ventana de 90 días de la hypertable `indicators`. Cuando no
   hay historia suficiente (`samples < min_samples`), se cae a un respaldo
   construido con los **umbrales reales** del ruleset versionado — y la elección
   viaja en el payload (`scale.source`), que la UI escribe en el pie del medidor.
   Degradar en silencio sería exactamente el problema que este trabajo resuelve.

4. **`percentile_disc`, nunca `percentile_cont`.** PostgreSQL no tiene sobrecarga
   `numeric` de `percentile_cont`: sus firmas son `double precision` e
   `interval`, así que sobre una columna `numeric(24,8)` haría un cast implícito
   a float y devolvería `float8`. Eso metería un float justo en el número que
   acaba en la UI, contra ADR-0017. `percentile_disc` es polimórfico, devuelve
   `numeric` exacto **y** el corte es un valor realmente observado en la serie.

5. **`unscaled` en vez de una banda inventada.** Con solo umbrales del ruleset no
   existe una noción empírica de alto/bajo; lo único real es *cruzado / no
   cruzado*, que ya viaja en `rules[].met` y `.distance`. Emitir ahí una banda
   tipo percentil sería inventar dato.

   **Enmienda del mismo día, encontrada con datos reales:** la escala de
   percentiles exige cortes **estrictamente crecientes**, no solo monótonos. Con
   14 039 muestras de `p2p_outliers_pct_buy` casi todas en cero, p10 = p50 = p90
   = 0, y un snapshot impecable (0 % de outliers) salía clasificado `very_high`
   —«de lo más alto de los últimos 90 días»— porque la igualdad cuenta hacia
   arriba. Ninguna regla de desempate lo arregla: usar `<=` en los cortes bajos
   invierte el error en una serie saturada por arriba. Cuando los cortes
   coinciden, la respuesta honesta es que **no hay banda que sostener** — y el
   respaldo además dibuja el umbral real del 30 %, que es la referencia útil de
   ese medidor.

6. **Payload verbatim en JSONB.** `indicator_analysis.payload` guarda el
   documento publicado tal cual: el GET del gateway devuelve exactamente lo que
   salió por el exchange y los decimales siguen siendo strings exactos, sin
   round-trip por `numeric` (mismo criterio que `signals.evidence`). `as_of`,
   `confidence` y `scale_source` se promueven a columna para poder responder
   «¿cuánto tiempo estuvimos en respaldo?» sin abrir el JSONB.

7. **`read:indicators` REUTILIZADO.** Un `read:analysis` nuevo exigiría
   aprovisionarlo en el tenant Auth0 (HITL bloqueado) y daría 403 a todo token
   ya emitido. El análisis es la lectura de esos mismos indicadores, así que el
   permiso encaja. Decisión consciente: segregarlo mañana obliga a tocar el
   tenant.

8. **Naming mixto, deliberado.** Los códigos de escala van en inglés
   (`percentiles`, `ruleset`, `very_low`) porque son vocabulario de contrato
   junto a `confidence: low`; los conceptos de negocio siguen en español
   (`direction: alcista`, nombres de reglas). Es la convención que ya existía en
   `signal.v1.json`, no una excepción nueva.

9. **Qué NO se hace, y no por falta de tiempo:** ni pronósticos, ni detección de
   régimen, ni probabilidades, ni horizontes temporales. `summary.rules_met` se
   llama así y no «señales activas» precisamente porque el cooldown de 60 min
   pudo suprimir la emisión, y afirmar que se emitió sería falso: la emisión
   real vive en `signals.emitted`.

## Alternativas consideradas

- **Ampliar `indicators.updated` con los campos de análisis**: descartado por el
  `const: 1` del schema y el despliegue acoplado que forzaba.
- **Calcular bandas y posiciones en el SPA**: descartado — pondría aritmética
  financiera en el cliente y crearía una segunda fuente de verdad frente a la
  que se persiste.
- **Continuous aggregate desde el principio**: descartado como prematuro. La
  consulta con cache de 15 min cumple hoy; si el coste aprieta, el CAGG diario
  ya está anotado como evolución (`knowledge/tables/index.md`).
  *Confirmado con medición el 2026-08-01: en régimen a 90 días (1.036.800 filas)
  la consulta tarda 747 ms, ~7× por debajo del timeout. La decisión de no
  adelantar el CAGG era correcta.*
- **Publicar el análisis solo bajo demanda (calcularlo en el GET)**: descartado
  — haría el endpoint caro e impredecible y dejaría el push WSS sin contenido.
- **Un `read:analysis` propio**: descartado por el HITL del tenant (ver 7).

## Consecuencias

- (+) El panel deja de ser demo: cada medidor explica qué mide, qué dice ahora y
  a qué regla alimenta, en ES y EN. El `DemoBadge` se retira del panel.
- (+) La proximidad a las reglas se hace observable sin exponer el ruleset: el
  usuario ve cuánto falta, no los umbrales como catálogo.
- (+) `scale.source` convierte el arranque en frío en información, no en un bug
  reportable.
- (−) **`dominio_respaldo` son números escritos a mano** — la única constante
  inventada del sistema. Existe solo para cerrar los extremos de una barra sin
  percentiles: vive en config versionada, viaja en `scale.domain`, aplica solo
  con `source: ruleset` (que la UI declara) y **nunca clasifica**.
- (−) `summary` invita a leerse como predicción. Mitigado con la aclaración
  siempre presente en la UI, la descripción del schema y el naming de
  `rules_met`.
- (−) La distribución cacheada envejece hasta el TTL: la ventana se desliza a
  saltos, no continuamente. Se declara con `scale.computed_at`.
- (−) `indicator_analysis` crece ~260 k filas y 1-2 GB en 90 d; si aprieta,
  `add_compression_policy` a los 7 días.
- (−) El refactor de `_vista_vigente` es el único cambio sobre el camino de
  emisión de señales en producción. Blindado con
  `test_la_vista_ampliada_no_cambia_las_senales_emitidas`, que compara las
  señales emitidas con y sin análisis lado a lado.

## Arranque en frío (comportamiento correcto, no un bug)

`muestras_minimas: 200` con 2 snapshots/min por serie ⇒ **~100 minutos** hasta
que un indicador entra en régimen de percentiles, y no todos a la vez (los de
ventana móvil solo se emiten en su lado). Mientras tanto los seis salen en
respaldo del ruleset: cifras reales, pie con el contador de muestras, marcas de
umbral donde las haya, y sin relleno donde no hay cortes.

Para ejercitar el camino de percentiles sin esperar: bajar `muestras_minimas` en
la config versionada (es lo que hace el test e2e), correr el
`ingestor-historico`, o dejar el compose ~2 h. Documentado también en el plan de
pruebas: si no, la primera persona que levante el compose reportará «las barras
no se llenan».

## Verificación

- **Engine: 170 tests** (152 unit/contract sin infra + integration/e2e).
  Destacan: las cuatro bandas sin huecos con el valor exacto en el corte, la
  degradación por muestras insuficientes / serie constante / cortes coincidentes,
  el canario de que el `30` del YAML es el mismo `UMBRAL_CONFIANZA_OUTLIERS_PCT`
  de `calculos.py`, los desempates deterministas, el cache con reloj inyectado, y
  `percentile_disc` devolviendo `Decimal` contra TimescaleDB real.
- **Gateway: 103 tests** — payload servido verbatim, rancio no se sirve, tópico
  en la whitelist, contract REST contra `IndicatorAnalysis` (percentiles y
  respaldo), consumidor descartando un evento inválido, y el frame WSS de punta
  a punta.
- **SPA: 210 tests, 88,7 % de ramas** (umbral Gate 2: 80 %) — fixtures con doble
  `satisfies` (REST y WSS), reemplazo completo en el reducer, y la suite nueva
  `medidores.test.tsx`: pie con percentiles reales, relleno del contrato, una
  marca por regla, respaldo sin relleno, desplegable con teclado, **ausencia del
  sello demo**, y ambos idiomas.
- **Compose end-to-end**: binding `analysis.updated` declarado, seis medidores
  persistidos por revisión, cinco en percentiles reales sobre ~28 000 muestras y
  outliers en respaldo por la enmienda del punto 5.
- ~~**Pendiente HITL**: la revisión visual del panel con login real sigue
  bloqueada por el `client_id` del tenant (F1 de ADR-0017), igual que en 0018.~~
  **Desbloqueado el mismo día (ADR-0020)**: el `client_id` ya estaba
  aprovisionado desde el 2026-07-27 —esta línea heredó una afirmación desfasada
  de 0018— y el login quedó operativo al arreglar la CSP y adoptar el dominio
  propio. La revisión visual del panel en vivo ya no está bloqueada.
