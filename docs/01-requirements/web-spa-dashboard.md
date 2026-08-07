# PRD — Dashboard web (front-end/SPA `apps/web-spa`)

- **Estado:** accepted — en implementación (fase 03)
- **Fecha:** 2026-07-31
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 01-requirements
- **Versión:** Unreleased (se sincroniza al próximo corte)
- **Gate:** 0 (incremental — enmienda HITL del charter 2026-07-27, ADR-0017)
- **Feature ID:** web-spa-dashboard

Primera app consumidora de la plataforma: dashboard web autenticado (React,
ADR-0017) que muestra en tiempo casi real la brecha cambiaria, la referencia
P2P, la microestructura y las señales, con vista de histórico. Consume
exclusivamente los contratos públicos del api-gateway
(`apps/api-gateway/docs/openapi.yaml` y `asyncapi.yaml`); no habla con la DB ni
con el bus. El flujo de autenticación (login Auth0 → REST → WSS → expiración)
está especificado en el journey del PRD `api-streaming.md` §journey — este PRD
lo **referencia** y no lo duplica.

## Usuarios
Personas autenticadas vía Auth0 (roles `viewer`/`operator`, ambos con los 5
permisos de lectura/streaming hoy). Sin usuarios anónimos: solo la pantalla de
login y el estado de salud son visibles sin sesión.

> Enmienda 2026-07-31 (ADR-0018): el dashboard adopta el sistema de diseño
> Higerotech y suma tres capacidades que este PRD no contemplaba — vista de
> análisis, idioma ES/EN y tema claro/oscuro (RF-8 a RF-10). Se añade además la
> regla de presentación de bloques sin fuente de datos, que es RF-5 aplicada al
> diseño.

> Enmienda 2026-08-01 (ADR-0020): **RF-1 gana criterios verificables.** Decía
> «tokens solo en memoria; renovación silenciosa; logout», que no permite
> distinguir un login que funciona de uno roto. Se añade: la recarga **no muestra
> login** mientras viva la sesión SSO; **todo fallo de autenticación ofrece
> reintento** (nunca un estado terminal); y los estados de sesión se **distinguen
> entre sí** (comprobando / redirigiendo / error). El escenario de abuso 4 se
> amplía con el *callback envenenado*: un `?code=` inválido en la URL no puede
> dejar al usuario encerrado.

> Enmienda 2026-08-01 (ADR-0019): el motor ya calcula la lectura de los
> medidores (RF-6 del PRD del motor), así que el panel de instrumentos deja de
> ser un bloque demo y pasa a explicarse en ES/EN con dato servido — **RF-11**,
> más la enmienda correspondiente a «RF-5 ampliado».

> Enmienda 2026-08-01 (ADR-0021): el motor ya produce la lectura del mercado
> como un todo (RF-7 del PRD del motor), así que la tarjeta «Lectura de hoy»
> deja de ser maqueta — **RF-12**, con su enmienda a «RF-5 ampliado». Quedan
> **dos** sellos demo: escenarios con probabilidades y riesgos redactados, que
> siguen sin fuente porque hacerlos reales exigiría pronosticar.

## Requisitos funcionales
- **RF-1 — Login y sesión**: Auth Code + PKCE contra Universal Login (ADR-0012);
  tokens solo en memoria; renovación silenciosa por refresh rotation; logout.
  La recarga de página re-autentica **en silencio** (iframe `prompt=none` con la
  cookie SSO — sin storage persistente ni login visible, T12).
- **RF-2 — Vista en vivo (dashboard)**: tasa oficial multi-moneda
  (USD/EUR/CNY/TRY/RUB) con bandera `stale`; referencia P2P de ambos lados con
  `confidence` visible (low resaltado); brecha (`gap_abs`/`gap_pct`, lado buy) y
  `spread_pct`; microestructura (ratio oferta/demanda, momentum 3 h, drenaje
  6 h, liquidez, merchants %, outliers %); profundidad por bandas; feed de
  señales con su evidencia (`rule` + `inputs`, trazabilidad T10) accesible.
- **RF-3 — Tiempo real**: suscripción WSS a los 4 tópicos; la UI refleja un push
  en < 1 s desde su recepción; reconexión automática con backoff y **reposición
  del estado por REST** en cada (re)conexión (el push es best-effort,
  ADR-0016); renovación del token del WSS antes de `exp` sin interacción.
- **RF-4 — Histórico**: series de tasa oficial (por `value_date`) y de
  indicadores (bucket 5m/1h/1d) con rango máximo de 90 días validado en
  cliente, paginación transparente (`has_more`) con progreso y cancelación.
- **RF-5 — Honestidad del dato**: los 404 de los endpoints «current» se muestran
  como «sin datos frescos» (nunca error); los null de brecha/spread como «—»;
  decimales renderizados desde el string exacto del contrato (nunca float para
  lógica); frescura relativa visible por fuente (P2P 20 min, oficial 6 h).
- **RF-6 — Estado de la conexión**: indicador visible de WSS
  (conectado/reconectando), cuota `X-RateLimit-Remaining` y salud del gateway.
- **RF-7 — Intradía (día operativo VET)**: parrilla con **todos** los indicadores
  disponibles del día operativo de Venezuela (00:00 VET → ahora; UTC−4 fijo),
  agrupados por oficial / compra / venta / microestructura. Cada panel muestra el
  último valor, su serie del día y la **variación intradía** — Δ absoluta y
  porcentual contra la **apertura** del día, según la define el glosario. La Δ se
  calcula sobre el string decimal exacto (sin float); si la apertura es cero, el
  porcentaje se muestra «—», nunca ∞ ni NaN. Un indicador nuevo del motor aparece
  sin cambios en el front. Refresco manual y automático cada 5 min.

  **Ampliación 2026-08-06 — la vista se lee de arriba abajo.** La parrilla es el
  detalle; delante y detrás van tres bloques que la ponen en contexto, y los tres
  se **derivan del dato**:

  1. **«Lectura de la sesión»**, bloque rector: qué dice el ruleset AHORA — qué
     regla está más cerca, cuántas condiciones cumple y cuál la bloquea. Sale de
     `analisis` (`summary` + `rule_proximity`); la regla más cercana la elige el
     motor vía `summary.closest_rule`, **nunca el SPA**. Absorbe la frase de día
     operativo, con la apertura de la sesión y lo transcurrido. «Exportar sesión»
     vuelca cada bucket con el valor exacto; «Vigilar esta regla» va
     **deshabilitada y explicándose**, igual que «Crear alerta» (ADR-0021).
  2. **«Qué se movió desde la apertura»**: las cuatro series que explican la
     sesión. El criterio **se calcula**: `z = |último − apertura| / σ₇d`, con σ
     sobre los valores de los últimos 7 días. Normalizar es lo que permite
     comparar unidades distintas — sin ello la liquidez copaba las cuatro
     tarjetas por el mero tamaño de la cifra. Una serie sin historia queda fuera
     del ranking (no hay con qué compararla) y una que llevaba 7 días quieta y
     hoy se mueve va arriba del todo. La frase «el resto se mantuvo dentro de su
     rango normal» **se cuenta**, no se cablea: el primer día en producción había
     10 series fuera de rango y la frase habría sido falsa.
  3. **«Compra vs. venta, métrica por métrica»** sustituye a las dos parrillas
     de lado: la pregunta útil no es cómo va la liquidez de venta sino en qué se
     diferencian los dos lados, y eso exige la misma fila. Las filas se
     **derivan** de las series —una lista fija habría roto la promesa de este
     mismo RF de que un indicador nuevo aparece sin tocar el front—; el orden sí
     es declarado. Un lado sin serie **se dice**, no se rellena con el otro ni
     con un cero. Dentro del bloque el lado lo dice la COLUMNA, así que el color
     pasa a codificar la dirección de la Δ; como comparte tonos con las
     cabeceras, el signo va siempre escrito.
  4. **«Cronología de la sesión»**: apertura, cruces de umbral del ruleset,
     saltos de liquidez sobre 2σ y último recálculo. Nada que no se pueda señalar
     en una serie. Los cruces llevan **histéresis por permanencia** —el estado
     nuevo tiene que aguantar 15 minutos— porque sin ella un indicador que oscila
     junto a su umbral generaba un evento por temblor: 50 líneas, 48 de ellas
     cuatro indicadores vibrando. La ventana de referencia de 7 días se pide
     **aparte y en bucket de 1 h**, no en el del selector: a 5 min son más de
     40 000 filas.

- **RF-8 — Vista de análisis** (2026-07-31, ADR-0018): lectura del mercado con
  escenarios y riesgos. Los números que la plataforma sirve (presión de liquidez,
  merchants, spread) son reales; la prosa, las probabilidades y los umbrales de
  ejemplo van **marcados como sin fuente** (ver RF-5 ampliado).
- **RF-9 — Idioma ES/EN**: toda cadena de interfaz se muestra en el idioma
  elegido, que se recuerda entre sesiones. NO se traducen los nombres canónicos
  de indicadores ni de reglas de señal: son vocabulario del contrato. Los
  decimales se formatean con los separadores del idioma (es-VE `1.234,56` ·
  en-US `1,234.56`) desde el string exacto, nunca desde float.
- **RF-10 — Tema claro/oscuro**: el tema es explícito (oscuro por marca, no
  `prefers-color-scheme`), se cambia desde la barra y se recuerda. Ambos temas
  se pintan con los mismos tokens del sistema de diseño.
- **RF-11 — Explicación de los medidores (ES/EN)** (2026-08-01, ADR-0019): cada
  medidor del panel debe decir **qué mide**, **qué dice ahora** y **a qué aviso
  alimenta**, en los dos idiomas, a partir de la lectura que sirve el gateway
  (`GET /api/v1/analysis/current` y tópico WSS `analysis`).

  - El pie de la tarjeta muestra la escala **real** contra la que se compara: los
    cortes publicados, o el contador de muestras cuando todavía se está en
    respaldo.
  - La barra se rellena en la posición del contrato y lleva **una marca por cada
    regla** que el medidor alimenta (hay indicadores que alimentan tres). Si el
    contrato no trae posición, **no se dibuja relleno**.
  - El SPA no calcula nada de esto: banda, posición, posición de umbral,
    distancia y estado de cada umbral vienen del motor. La única aritmética
    permitida es convertir la fracción [0,1] a un ancho CSS.
  - Registro **didáctico**, no de mesa de operaciones: las frases describen el
    presente y nunca el futuro, ninguna dice «percentil X» (una sola cadena, en
    el desplegable, explica cómo se lee la escala) y «señal» se dice **aviso**.
    **Enmienda 2026-08-02:** la aclaración deja de ESCRIBIRSE en la interfaz. La misma advertencia salía tres veces en el mismo dashboard y repetida tres veces deja de leerse; además la tarjeta debe describir el mercado en lenguaje llano, no describirse a sí misma. Lo que el requisito protege —que la prosa no aconseje ni prediga— **no se relaja**: sigue vigilado por la batería de expresiones prohibidas contra el texto renderizado, ahora en los dos idiomas y sin el apaño de recortar el pie antes de buscar dentro de él.
  - Estados degradados explícitos y distinguibles entre sí: sin análisis, medidor
    sin lectura en esta revisión, sin valor vigente, escala en respaldo,
    confianza baja y tasa oficial rancia.

- **RF-12 — Lectura del mercado (ES/EN)** (2026-08-01, ADR-0021): la tarjeta de
  cabecera debe decir **qué está haciendo el mercado ahora**, en lenguaje llano y
  en los dos idiomas, a partir del campo `reading` que sirve el gateway.

  - El titular es el **régimen** que publica el motor, no una cadena de ejemplo.
    Sin régimen resoluble se dice, en vez de inventar medio titular.
  - La prosa es **una frase por afirmación, en el orden que manda el motor**. El
    SPA no reordena ni decide qué contar: si lo hiciera, habría dos fuentes de
    verdad sobre la lectura.
  - **Describe, no aconseja ni predice.** Nada imperativo («deberías», «hoy no hay
    nada que ejecutar») ni predictivo («va a subir», «se espera»). Lo que orienta
    va en **condicional** («si tienes que comprar, hoy…»).
    **Enmienda 2026-08-02:** la aclaración deja de ESCRIBIRSE en la interfaz. La misma advertencia salía tres veces en el mismo dashboard y repetida tres veces deja de leerse; además la tarjeta debe describir el mercado en lenguaje llano, no describirse a sí misma. Lo que el requisito protege —que la prosa no aconseje ni prediga— **no se relaja**: sigue vigilado por la batería de expresiones prohibidas contra el texto renderizado, ahora en los dos idiomas y sin el apaño de recortar el pie antes de buscar dentro de él.
  - Los **chips** salen del análisis: frescura, reglas disparadas, medidores cerca
    de su umbral y confianza con su valor real. No hay barra de confianza: el
    contrato la da binaria (`normal|low`) y una barra continua fingiría precisión.
  - Estados degradados explícitos: sin lectura, sin régimen, confianza baja
    (encabeza y desplaza al régimen), oficial rancia (sin atribución) y escala en
    respaldo (sin la frase de banda).

  **Ampliación 2026-08-01 — la descomposición de la brecha compara ambos lados.**
  La tarjeta muestra compra y venta, cada uno contra su propia historia, y:

  - **rotula el tramo REAL** de cada ventana cuando la serie no la alcanza
    («Promedio 12 d de 30»), y pasa sola a la etiqueta nominal cuando la serie
    crece. Antes decía «Promedio 30 días» sobre 12 días: el número era real y la
    ventana no;
  - **la cifra que cita la prosa tiene que estar a la vista**. Si el motor afirma
    una distancia contra una referencia, esa referencia se muestra: una afirmación
    incomprobable es tan mala como una falsa. Hay un test que lo fija;
  - no recalcula nada: las referencias llegan del contrato (`gap_history`).

  El **mapa de calor** pasa a mirar el lado **venta**, que es el que tiene historia
  real; con el de compra las primeras filas quedaban vacías. Codifica **dos cosas
  distintas de dos maneras distintas**: la magnitud, con una rampa secuencial de un
  solo tono hasta el p90 —se lee de tenue a intensa—; y el **exceso** sobre ese p90,
  con coral, que no es la continuación de la rampa sino una **categoría**. Sus
  percentiles son de los 14 días que se están pintando y el subtítulo lo dice:
  el lado venta **no es medidor del panel** y no tiene percentiles publicados que
  citar. Las horas sin bucket quedan vacías y **se distinguen por forma** (un filete
  interior), no por color: no se interpola para rellenar bonito. Cada vista que muestre
  una serie de brecha **declara qué lado mira**: con dos series en la app, callarlo
  es ambiguo. La **sparkline de 24 h** pinta los dos lados,
  con **escala Y compartida** —sin ella cada serie se normaliza sola y la más baja
  puede quedar dibujada por encima— y distinguibles por **forma además de color**.

- **RF-5 ampliado — bloques sin fuente**: todo bloque que el diseño pida y la
  plataforma no calcule debe distinguirse del dato servido **a simple vista**
  (sello `demo · sin fuente` + explicación en la sección). Un ejemplo que se lee
  igual que un dato del gateway es una violación de RF-5, no un detalle estético.

  **Enmienda 2026-08-01 (ADR-0019): el panel de medidores deja de ser bloque
  demo.** Lo que se marcaba —la escala percentil, el relleno, la marca de umbral
  y la nota— ya lo calcula el motor por revisión, así que el sello se **retira**
  del panel: mantenerlo sobre dato real sería tan deshonesto como no ponerlo
  sobre un ejemplo. El sello sigue en el régimen de mercado y en la vista de
  análisis, que continúan sin fuente.

  **Enmienda 2026-08-01 (ADR-0021): la tarjeta de régimen deja de ser bloque
  demo.** El titular, la prosa y los chips salen ahora de `reading`, así que el
  sello se retira también de ahí: quedan **dos**, ambos en la vista de análisis.
  Los **escenarios con probabilidades** (62/24/14 %) y los **riesgos redactados**
  conservan el suyo, y no por falta de tiempo: hacerlos reales exigiría
  pronosticar, que es lo que el proyecto declaró no-objetivo. Que el sello no baje
  de dos es la señal de que la frontera sigue en pie.

## Requisitos no funcionales
- Cobertura de ramas ≥ 80 % (criterio Gate 2, suite vitest sin infraestructura).
- Bundle servible como estático (nginx) sin config en runtime: toda la
  configuración es pública y horneada (`VITE_*`); cero secretos en el bundle.
- Accesible sin datos: cada panel tiene estado vacío/degradado explícito.

## Escenarios de abuso (superficie browser)
1. **Robo de token por XSS (T12)**: script inyectado intenta leer el token →
   mitigación: tokens solo en memoria del SDK (no localStorage/sessionStorage),
   vida 900 s, refresh rotation (un refresh token robado se invalida al rotar),
   CSP del nginx sin `unsafe-inline`, dependencias con lockfile (SCA en CI,
   Gate 2). Verificación: test + revisión de `AuthProvider` + DevTools en e2e.
2. **Origen web no autorizado (T15)**: una página de terceros intenta consumir
   la API con el token de un usuario → CORS por allowlist en el gateway (solo
   orígenes del despliegue); el WSS queda fuera de CORS por diseño del browser
   (hardening futuro: validar `Origin` en el handshake).
3. **Clickjacking**: el dashboard embebido en un iframe hostil → cabeceras del
   nginx (`frame-ancestors 'none'` en CSP).
4. **Token expirado/alterado**: el gateway responde 401 genérico → el SPA
   fuerza refresh una sola vez y, si falla, vuelve al login; nunca muestra
   diagnóstico interno (escenarios 1 y 3 de `api-streaming.md`).
5. **Agotamiento del cupo WSS (1008)**: múltiples pestañas del mismo usuario →
   singleton por pestaña + guard HMR; ante 1008, reintento con delay largo y
   aviso «¿múltiples pestañas?» (elección de líder queda para v2).
6. **Degradación silenciosa**: gateway `degraded`/datos rancios → la UI lo
   pinta (RF-5/RF-6); jamás presenta dato viejo como vigente.

## Trazabilidad
- ASVS: **V3** (gestión de sesión: vida corta, rotación, sin storage
  persistente), **V50/V5** (salida codificada por React + CSP, anti-XSS),
  **V4** (control de acceso: scopes/permisos del token).
- Amenazas: T12 (implementación aquí), T15 (CORS), T4 (límites respetados por
  el cliente), T10 (evidencia de señales visible).
- Contratos: `openapi.yaml` (tipos generados y verificados en compilación),
  `asyncapi.yaml` (protocolo del StreamClient).
- Decisiones: ADR-0012 (auth), ADR-0016 (semántica del push), ADR-0017 (este
  producto).

## Métricas de éxito
- Push → UI < 1 s (heredada de `api-streaming.md`); reconexión con estado
  coherente < 10 s tras recuperar red/gateway; cero tokens en storage
  persistente (verificable en DevTools); suite en verde con ≥ 80 % de ramas.
