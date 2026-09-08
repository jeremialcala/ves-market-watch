# Diseño — web-spa

- **Estado:** review — implementado 2026-07-27; login sin fricción verificado en vivo 2026-08-01 (ADR-0020)
- **Fecha:** 2026-07-31
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 03-implementation
- **Versión:** Unreleased (se sincroniza al próximo corte)

Primera app consumidora de la plataforma (enmienda HITL del charter, ADR-0017):
SPA React que consume EXCLUSIVAMENTE los contratos públicos del api-gateway —
`docs/openapi.yaml` (REST) y `docs/asyncapi.yaml` (WSS). Sin acceso a DB ni bus.

Desde 2026-07-31 viste el **sistema de diseño Higerotech** (ADR-0018), importado
del proyecto de diseño `Rediseño dashboard Higerotech`.

## Sistema de diseño (ADR-0018)
- **`ds/tokens/`** — los tokens del sistema, copiados literales: color (escala
  oscura + acentos teal/coral/salvia), tipografía (Space Grotesk display + Inter
  UI), espaciado, efectos y la variante clara. `theme-light.css` no crea nombres
  nuevos: **reasigna los mismos tokens** bajo `data-theme="light"`, así que todo
  componente funciona en claro sin tocar su código.
- **`ds/assets/fonts/`** — Inter y Space Grotesk **autoalojadas** (OFL 1.1,
  idénticas byte a byte a las del sistema): la CSP es `default-src 'self'` y no
  se abre para ningún CDN.
- **`ds/components/`** — `Button` (primary/secondary/nav), `Tag`, `Pill`,
  `Stat`, `Icon` y `Container` portados a TSX tipado desde el bundle React del
  editor de diseño.
- **`theme/`** — el tema es explícito, no `prefers-color-scheme`: el sistema es
  oscuro por marca y el usuario lo cambia en la barra; la elección se recuerda.
- **`i18n/`** — diccionario ES/EN tipado: `EN` es `Record<Clave, string>` sobre
  las claves de `ES`, de modo que **olvidar una traducción no compila**. No se
  traducen los nombres canónicos de indicadores y señales (vocabulario del
  contrato). Los decimales se formatean desde el string exacto con los
  separadores del idioma, sin pasar por float.
- **`index.css`** — las clases `vmw-*` de la app, construidas SOLO con tokens
  del sistema (el diseño importado resuelve todo con estilos en línea porque es
  un archivo de la herramienta; aquí se traduce a clases).

## Paleta de datos (resuelta 2026-07-31)
Los acentos de marca visten el **cromo**; las marcas de **dato** llevan slots
propios, validados con el validador del skill dataviz. Mezclarlos fue el error
del rediseño: en tema claro el par compra/venta daba ΔE 5,9 bajo protanopia,
por debajo del piso de 6 donde ni el rótulo visible lo excusa.

**Categórico** (compra ↔ venta), medido contra la superficie de tarjeta:

| Tema | Compra | Venta | CVD peor caso | Resto |
|---|---|---|---|---|
| claro (`#FFFFFF`) | `#10846e` | `#cf4946` | **ΔE 8,1** (deutan) ✔ | banda, croma y contraste ✔ |
| oscuro (`#2D3134`) | `#8ad6cc` | `#f97171` | **ΔE 13,2** (deutan) ✔ | contraste ✔; banda y croma quedan fuera |

El claro se movió lo mínimo: 4,1 de desvío OKLab respecto de los acentos de
marca — imperceptible al lado, suficiente para cruzar el umbral. El oscuro se
deja en los acentos: separa de sobra y es el aspecto aprobado; sus avisos de
banda y croma son de estilo de paleta, no de lectura.

**«Sin lado» no es una tercera categoría**, es la AUSENCIA de lado (tasa
oficial, microestructura): va en tinta neutra. Un tercer tono competía con el
par y el salvia de marca leía gris igualmente (croma 0,046).

**Rampa del mapa de calor**: magnitud ⇒ **secuencial de un solo tono**, con
luminosidad monótona y el extremo cercano a la superficie por encima de 2:1.
Antes era salvia → teal → coral con los valores del tema oscuro escritos a
fuego: no monótona (así no se lee una magnitud) y en claro su extremo bajo
quedaba a 1,67:1 sobre blanco, o sea invisible. Desde entonces son cinco pasos
por tema (`--calor-1` … `--calor-5`) de un tono que sube oscureciendo en claro y
aclarando en oscuro — por eso la rampa nunca se rotula por su luminosidad.

**Dos codificaciones, dos preguntas (2026-08-02).** La rampa cubre del p10 al
p90 y el coral (`--calor-alto-1`, `--calor-alto-2`) marca lo que los supera. No
es la continuación del degradado: la rampa dice *cuánta* brecha y el coral dice
*otra cosa* —que se salió del rango habitual de la propia ventana—, y por eso
cambia de tono en vez de seguir subiendo de intensidad. El corte es estricto
(`> p90`): con una serie plana el p90 es el valor de todas las celdas y un `>=`
habría pintado el mapa entero como exceso.

El tramo va del p10 al p90 y no de mínimo a máximo porque **una sola hora
extrema comprimía la rampa entera**: con min/max un pico aislado dejaba al resto
repartido entre dos escalones. Los percentiles son de los 14 días pintados y la
leyenda lo rotula así — el lado venta no es medidor del panel, así que no tiene
percentiles publicados que citar. Son discretos (ADR-0017): valores realmente
observados, que es lo mínimo cuando se escriben en la leyenda.

La rampa teal **no pasó por el validador** (no está instalado): se derivó
igualando escalón por escalón el contraste de la coral que sí validó, y se midió
lo que el cambio ponía en riesgo — ΔE2000 mínimo entre escalones 7,32 (oscuro) y
8,56 (claro), contra 6,96 / 8,86 de la coral. El número que sostiene el diseño
es el salto teal→coral: **ΔE 14,0 bajo protanopia**, el doble de lo que separa
dos escalones, así que la categoría sobrevive al daltonismo. Aun así el exceso
se dice también en el tooltip: una categoría no debe vivir solo en el tono.

El canario `tests/unit/paleta.test.ts` fija estos valores: si alguien cambia un
slot, el test falla y pide volver a pasar el validador. Lo que se rompió esta
vez fue precisamente que el color cambió y la palabra «validada» se quedó.

## El panel de instrumentos, sin banda de cabecera (2026-08-03)
La cabecera queda en **una línea**: `h3` en Space Grotesk `clamp(20px, 2.4vw, 24px)`
en caja de oración y una bajada de 13,5 px `--text-dim` con cuántos medidores hay
y en qué orden. Fuera la banda «Qué dice el panel» — decía lo mismo que
«Distancia al disparo», que es la tarjeta que existe para eso, y su contenido
explicativo vive en «Ver explicación».

Cada medidor: radio 22 sobre `--dark-3` con hairline al 8 %, nombre a 12,5 px en
mayúsculas por CSS y cifra Space Grotesk 30 px.

**La barra lleva tres cosas y cada una con SU tratamiento**, que es el punto:

| qué | cómo | por qué |
|---|---|---|
| tramo normal | superficie, blanco al 10 % | es contexto, no una marca |
| valor de hoy | pastilla teal 3×14 px | la posición que se lee |
| umbral | línea coral de 1,5 px | otro color **y** otra forma |

Si los tres se dibujaran igual no se sabría cuál es cuál. Debajo, la escala
rotulada con **palabras** —bajo/normal/alto— a 12 px, con el valor exacto de cada
corte en el `title`; nunca «percentil X» (ADR-0019).

«Ver explicación» pasa a botón de texto **teal** con `arrowRight` de 16 px y
**44 px de alto**: es un objetivo táctil, no un enlace de 14 px que haya que
acertar. La flecha gira al abrir, así que el mismo glifo dice las dos direcciones.

**Sin historia suficiente no se pinta cifra**: se dice «sin historia suficiente» y
la barra va vacía y punteada. Es una decisión con coste — el valor medido ES real
— pero la tarjeta es comparativa, y un número sin escala empírica solo invita a
compararlo con una referencia que todavía no existe.

## Separación entre bloques: 24 px uniformes (2026-08-03)
`.vmw-vista > .vmw-contenedor > * + * { margin-top: 24px }`.

Lo que había era `.vmw-seccion + .vmw-seccion { 46px }`, y esa regla **solo
aplicaba entre dos `.vmw-seccion` adyacentes**: bastaba con que se colara un
`.vmw-grid` entre medias —la fila de la brecha, la de referencia P2P— para que
la cadena se rompiera y los bloques quedaran **pegados**. Medido en el dashboard
antes del cambio, la escalera real era `0 · 0 · 46 · 46 · 0 · 0 · 46`.

El selector va por **hijo directo del contenedor**, así que abarca todo bloque de
primer nivel —sección, rejilla o tarjeta— sin depender de que lleve una clase
concreta. Verificado en vivo: los 8 saltos del dashboard a 24 px exactos.

Las vistas de Análisis e Intradía conservan algunos márgenes **en línea** (14, 18,
40 y 12 px) que ganan a la regla. Son deliberados de sus propios bloques y se
dejan; unificarlos es una decisión aparte. `tests/unit/separacion.test.ts` fija la
regla —no los píxeles, que jsdom no resuelve—.

## La tarjeta de brecha como bloque rector (2026-08-03)
Radio 28, `linear-gradient(160deg, --dark-3, --dark-2)`, hairline al 8 % y un
**halo radial teal al 13 %** desbordado por la esquina superior derecha, que
recorta el `overflow: hidden` de la tarjeta.

**El halo no contradice la regla de una sola superficie con tinte**: «Lectura de
hoy» tiene el FONDO teñido (`--teal-tint-strong`), esta tiene fondo neutro con un
acento encima, y por eso va más flojo (13 % contra 14 %).

Cifra en Space Grotesk `clamp(46px, 8.5vw, 78px)`, `line-height .9`, −0,035em,
blanca; a su derecha y anclados a la **línea de base**, el equivalente en VES y
el delta a 7 días — **salvia si comprime, coral si abre**. El signo va escrito en
el número, así que el color refuerza y no codifica solo.

Gráfico de 24 h con **eje Y de tres marcas rotuladas**, fuera del SVG: el
`preserveAspectRatio="none"` que lo estira al ancho deformaría cualquier texto de
dentro. Banda de rango en teal al 12 %, compra en teal 2 px y **venta en teal al
45 % — el coral queda reservado para el disparo**. Bajo el eje, mín y máx **con su
hora**: un mínimo de las 03:00 y uno de hace diez minutos dicen cosas distintas.
Cierra una regla al 8 % y tres metadatos a 13,5 px.

**La venta deja de ser coral, y eso toca el par validado.** Se midió antes de
cambiarlo: teal 100 % contra teal 45 % separa ΔE 30–34 bajo protan/deutan —a la
altura del par teal/coral en protanopia (29,7)— porque separa por **luminosidad**
(7,85:1 contra 2,82:1 sobre la tarjeta), que es justo lo que el daltonismo no
altera. Y la venta conserva su trazo discontinuo: una tercera pista que no
depende del color en absoluto. Hay test que prohíbe el coral en las series.

**Dos defectos propios, cazados verificando en pantalla:** el halo heredaba
`position: relative` de `.vmw-hero > *:not(.vmw-hero__brillo)` —la lista de
excluidos no lo nombraba—, entraba en el flujo y empujaba la tarjeta 380 px; y el
pie del gráfico, con cuatro rótulos repartidos a los extremos, se solapaba consigo
mismo.

## «Lectura de hoy»: la única superficie con tinte (2026-08-02)
Radio 28 px, `linear-gradient(160deg, --teal-tint-strong, --dark-2)`, borde
`--teal-line`, padding 24/28. **Que sea la única es lo que la hace funcionar**:
dos superficies teñidas compiten y ninguna destaca, así que se retiró el brillo
teal de `GapPanel` —conserva su degradado NEUTRO, que es superficie y no acento—
y hay un test que lo fija.

El teal del texto se reserva para el eyebrow, que marca la superficie. El sello
de frescura y la nota metodológica van a 13 px y `--text-dim`: **no** teal, para
que no compitan con el titular.

Titular como `h2` de verdad —es el encabezado de la vista y un lector de pantalla
tiene que poder saltar a él—, con punto luminoso de 10 px, Space Grotesk
`clamp(24px, 3.4vw, 34px)` a −0,03em. Prosa Inter 16/1,6 acotada a **780 px** con
`text-wrap: pretty`: más largo que eso, la vista pierde el renglón al volver.

Los chips van en **dos grupos separados a la vista** porque responden preguntas
distintas —de qué material está hecha la lectura (frescura, reglas disparadas) y
a qué conclusión llega (medidores cerca del umbral, confianza)—; en una sola fila
había que leerlos todos para saber cuál era cuál. El de riesgo va en coral.

**Las dos acciones de la cabecera**, 40 px y radio 100:

- **«Exportar CSV» funciona.** Vuelca la lectura de la revisión con los decimales
  exactos del contrato —sin `toFixed` ni `Number`—, con CRLF y BOM porque es lo
  que Excel espera. Es dato que ya está en el cliente: no necesita servidor.
- **«Crear alerta» va deshabilitada y lo explica en su `title`.** ADR-0021 la dejó
  fuera de alcance porque no es un botón: exige persistencia por usuario,
  evaluación en el motor y un canal de aviso. Pintarla activa y que no hiciera
  nada sería peor que no pintarla.

## La barra de navegación (2026-08-02)
76 px **fijos**, pegajosa, `rgb(21 24 27 / 82%)` con `blur(16px)` y hairline
inferior al 8 %. Marca con isotipo de 26 px y nombre en Space Grotesk 18/700 a
−0,02em en blanco; pestañas en Inter 14,5 px, la activa con pastilla
`--teal-tint` + `--teal-line` y texto teal a radio 100 px, las inactivas en
`--text-muted` sin fondo y hover a teal sin subrayado.

Casi todo eso ya salía de los tokens portados en ADR-0018 (`--nav-height`,
`--nav-bg`, `--blur-nav`, `--border`, `--fs-body-sm`). Lo que se desviaba era:

- **`min-height` + `flex-wrap: wrap`**, o sea 76 px de mínimo, no de alto. Con un
  nombre de usuario largo la barra crecía a dos filas — y una barra pegajosa que
  cambia de alto mueve todo el contenido bajo ella. Ahora `height` fijo,
  `nowrap`, y el nombre con elipsis a 22 ch.
  - **Efecto colateral, detectado y corregido en el despliegue del 2026-08-02:**
    con la barra ya fija, la tira de pestañas —que sí envolvía— dejó de hacer
    crecer la barra y pasó a **salirse** de ella. Medido en la escalera: a
    1000 px eran dos filas y a 820 px tres, desbordando. Las pestañas pasan a
    `nowrap` con desplazamiento horizontal (sin barra visible) y ni la marca ni
    cada pestaña ceden ancho. Verificado a 1400/1200/1000/900/820/780 px: una
    fila y sin desborde en todas.
- **El hover de la pestaña iba a `--text`**, no a teal.
- **`Button variant="nav"` era coral SÓLIDO con sombra**, que es el tratamiento
  del CTA. En la barra ese peso convertía «Salir» —la acción que menos se quiere
  pulsar— en lo más llamativo de la pantalla, y gastaba el coral, que en este
  producto significa alerta. Ahora comparte tratamiento con el conmutador de
  idioma y el botón de tema: pastilla sobre `--overlay-soft` que se aclara al
  pasar por encima. Hay dos tests que impiden que el coral vuelva.

## La tira de estado es estado, no diagnóstico (2026-08-02)
Una sola línea (`7px 24px` sobre `--dark`, Inter 12,5 px, `letter-spacing .06em`,
mayúsculas por CSS, `--text-muted`) con lo que responde **«¿puedo fiarme de lo
que veo ahora?»**: el Tag salvia del stream, el último evento, las suscripciones
vivas y —empujado a la derecha con `flex: 1`— el sello de frescura «datos al
2 ago · 22:50 VET». Los `·` van al 40 %: se lee la pausa, no el punto.

**Salieron** `flujo /ws/v1`, la cuota REST y `calc/ruleset`. Son diagnóstico: no
cambian la lectura del mercado y competían por el único renglón con lo que sí.
Siguen accesibles en el tooltip del punto de conexión, en «Calidad y procedencia»
y, en compacto, en la línea meta del menú — que es donde vive el reparto porque
la tira ahí no existe.

Dos detalles que decidieron la forma: `flex-wrap: nowrap`, porque con `wrap` la
tira se partía en dos en cuanto entraba un dato más (que es lo que la volvía un
panel); y el Tag se comprime a 2 px verticales **en este uso** —no en el
componente del sistema, que otras superficies usan con su aire— porque sus 7 px
sumados a los 7 de la tira la dejaban en 51 px, una banda y no un renglón. Con
esto son 41.

El sello sale del `as_of` del análisis —el instante del DATO, no el de la
entrega— y si no hay análisis no se escribe: inventar una hora sería lo contrario
de lo que el sello existe para dar.

## Shell responsive (2026-07-31)
El diseño declara la tira de estado dentro de `isWide`: **en compacto no
existe**, y su información se reparte en vez de perderse. La escalera, medida en
el navegador (las media queries no corren en jsdom):

| Ancho | Barra | Tira de estado | Vista actual |
|---|---|---|---|
| ≥ 1080 px | ancha, 1 fila | completa (estado · último evento · suscripciones · sello de frescura) | — |
| 760–1079 px | ancha, 1 fila | se repliegan las suscripciones; el resto no cede | — |
| 480–759 px | compacta | ausente → punto + antigüedad en la barra; el detalle **y el diagnóstico** (suscripciones, calc/ruleset) en la línea meta del menú | visible |
| < 480 px | compacta | ídem | retirada |
| < 360 px | compacta, título con elipsis | ídem | retirada |

La tira se esconde **por dos vías a la vez**: `StatusStrip` devuelve `null`
cuando el ancho es compacto, y el CSS la oculta bajo 760 px. No es redundancia
gratuita — el estado de React llega un tic tarde, así que con solo la primera la
tira alcanzaba a pintarse un fotograma en móvil, con su salto de layout. El
ancho se mide además de forma **síncrona** en el estado inicial del hook, para
que el primer render ya sea el correcto. El 759 del CSS y el `ANCHO_COMPACTO`
del hook no pueden compartir constante (TS y CSS plano): lo que impide que se
separen es `tests/unit/compacto.test.ts`.

Lo que **nunca** se repliega es el estado del stream: en ancho va como `Tag`, en
compacto como punto + antigüedad, y en ambos casos es región viva (`role=status`,
`aria-live="polite"`) con el estado en texto accesible — el color del punto no
codifica solo. La etiqueta de vista lleva `flex: none` a propósito: sin él, flex
la estruja a 0 px mucho antes de su punto de corte y el texto queda partido a
media palabra; o entra entera, o se retira.

## Bloques sin fuente de datos (regla RF-5 aplicada al rediseño)
El diseño pide secciones que la plataforma **no calcula**: régimen de mercado,
escenarios con probabilidades y riesgos. Se implementan —el dueño del producto
lo pidió así para poder evaluar el diseño completo— y **cada una lleva el sello
`demo · sin fuente`** (`components/DemoBadge.tsx`) más la explicación en la
bajada de la sección. Lo que sí se deriva de verdad se deriva: sparkline de 24 h,
mapa de calor de 14 d × hora (VET) y comparativas 7/30/90 d salen de
`/indicators/history` (`state/useHistorialBrecha.ts`, dos llamadas filtradas por
indicador y moneda); la descomposición reparte el precio P2P con la tasa oficial
vigente y el VWAP.

**El panel de medidores salió de esta lista el 2026-08-01** (ADR-0019): lo que
llevaba sello —la escala percentil, el relleno, la marca de umbral y la nota— ya
lo calcula el motor por revisión. Mantener el sello sobre dato real sería tan
deshonesto como no ponerlo sobre un ejemplo.

**El régimen de mercado salió el mismo día** (ADR-0021): titular, prosa y chips
salen ahora del campo `reading` del análisis. **Quedan dos sellos**, los dos en la
vista de Análisis: escenarios con probabilidades y riesgos redactados. Se quedan
a propósito — hacerlos reales exigiría pronosticar, que es no-objetivo declarado
del proyecto. Que la cuenta no baje de dos es la señal de que la frontera sigue
en pie.

## Panel de instrumentos (RF-11, 2026-08-01)
Cada medidor pinta lo que trae `analysis.updated` / `GET /analysis/current`
(`state/reducers.ts` → `EstadoMercado.analisis`), y **nada más**:

- **Pie**: los cortes reales de su ventana (`escala.percentiles`) o el contador
  de muestras cuando la escala es el respaldo (`escala.ruleset`).
- **Barra**: relleno en `position` y **una marca por regla** (`rules.map`) —
  `p2p_ratio_oferta_demanda` alimenta tres condiciones, y antes se dibujaba una
  sola marca fija. `position === null` ⇒ no se dibuja relleno: cero píxeles
  inventados.
- **Nota**: la frase de la banda del indicador, tipada como
  `Record<Banda, Clave>` sobre el **enum generado** del contrato — si el motor
  añade una banda, esto deja de compilar en vez de callarse.
- **Detalle desplegable** (patrón de `SignalsFeed`: `aria-expanded` +
  `role="region"`): qué mide, qué dice ahora + cómo se lee la escala, y una línea
  por regla con cuánto falta. El estado de cada umbral va **también en texto**:
  el color nunca es la única codificación.
- **Síntesis** donde estaba el sello: regla más cercana e indicador bloqueante,
  con precedencia deliberada —confianza baja gana a todo, porque si los avisos
  están suprimidos hablar de proximidad engaña—. **Sin pie de aclaración**: se
  retiró de las tres tarjetas el 2026-08-02, porque la misma advertencia repetida
  tres veces deja de leerse y porque el panel describe el mercado, no se explica a
  sí mismo. El control pasa a ser el registro, verificado contra el texto
  renderizado en los dos idiomas.

`src/lib/escala.ts` es el **único punto de aritmética** del panel: convierte la
fracción [0,1] del contrato a un ancho CSS. Banda, posición, posición de umbral,
distancia y `met` vienen calculados; el SPA no reclasifica nada.

## Lectura del mercado (RF-12, 2026-08-01)
`MarketRegimeCard` consume `analisis.reading` y **nada más**:

- **Titular**: el código de régimen traducido (`regimen.<codigo>`). Sin régimen
  resoluble se dice; no se compone medio titular.
- **Prosa**: una frase por claim, **en el orden que manda el motor**. `fraseDe`
  es un `switch` sobre el código que interpola las cifras del claim; el SPA no
  reordena ni decide qué contar. El orden es semántico: lo que invalida al resto
  va primero (confianza baja, luego oficial rancia).
- **Chips**: frescura, reglas disparadas, medidores cerca de su umbral y
  confianza con su valor real. **No hay barra de confianza**: el contrato la da
  binaria (`normal|low`) y una barra continua fingiría una precisión que no
  existe — la maqueta la tenía al 68 % escrito a mano, y encima rotulada
  «Confianza media», valor que no existe en el contrato.
- **Sin aclaración escrita** desde el 2026-08-02: la tarjeta describe el mercado
  en lenguaje llano, no se describe a sí misma, y la misma advertencia salía tres
  veces en la misma pantalla. El control pasó a ser el registro, verificado por
  test — ver abajo.

El registro está **acotado por test**, no solo por convención:
`tests/component/lectura.test.tsx` comprueba contra el texto renderizado que no
aparece nada imperativo («deberías», «nada que ejecutar») ni predictivo («va a
subir», «se espera», «probabilidad»), y que lo que orienta va en condicional.
Esa suite es la que defiende la frontera cuando alguien reescriba una frase.

## Capas
- **`lib/` (puro)**: `decimal.ts` — comparación/signo/formato es-VE **y aritmética
  exacta con `BigInt`** (`restarDecimales`, `porcentajeRelativo`) sobre el string
  exacto del contrato, sin float (única excepción: `toChartNumber` para coordenadas
  de gráfico); `freshness.ts` — umbrales espejo del backend (P2P 20 min, oficial 6 h);
  `intradia.ts` — día operativo VET (UTC−4 fijo) y Δ contra la apertura (RF-7).
- **`api/`**: `types.gen.ts` generado por `openapi-typescript` desde el
  `openapi.yaml` del gateway y **commiteado** (el `.dockerignore` excluye
  `docs/` del contexto de build; el diff de tipos delata cambios de contrato);
  check de frescura en `npm test`. Cliente `openapi-fetch` con fetch perezoso
  (respeta interceptores), Bearer por request, problem+json → `ApiError`,
  404 de los «current» = «sin datos frescos» (null), captura de `X-RateLimit-*`,
  paginación transparente con validación de rango ≤ 90 días en cliente.
- **`auth/`**: `Auth0Provider` con `cacheLocation: "memory"` y
  `useRefreshTokensFallback: true` — al recargar, re-autenticación **silenciosa
  por iframe** (`prompt=none` con la cookie SSO; requiere Allowed Web Origins
  en el tenant), sin tocar storage (T12); `tokenProvider` como puente hacia los
  módulos planos (REST/WSS); guard `RequireAuth` (redirect a Universal Login
  solo sin sesión SSO; error visible sin bucle).
- **`ws/`**: `StreamClient` **singleton** (límite de 5 conexiones por usuario)
  con políticas puras (`politicas.ts`): backoff exponencial con jitter 1→30 s,
  watchdog de 75 s sin mensajes, decisión por cierre (4401 → refresh forzado y
  reconexión · 4403 → detener · 1008 → espera larga con aviso de pestañas),
  renovación proactiva a `exp − 60 s` y resync REST en cada (re)conexión;
  `useStream` con guard de HMR y `beforeunload`.
- **`state/`**: `marketStore` (useSyncExternalStore, sin dependencias) +
  reducers puros: dedupe por `event_id`, proyección del formato largo de
  `indicators` a las vistas (mismo criterio que el gateway: confianza low
  > 30 % outliers, brecha lado buy), señales con tope de 50; el resync REST es
  autoritativo. `p2p.snapshot` no toca la UI: invalida la profundidad (refetch).
- **`components/`/`views/`**: cuatro vistas — **dashboard** (titular de la brecha
  como cifra héroe con su sparkline de 24 h **de los dos lados**, panel de
  instrumentos, descomposición, mapa de calor **del lado venta**, referencia P2P,
  microestructura, tasas oficiales, cronología de señales con la evidencia
  desplegable **en línea** y profundidad), **análisis**
  (ADR-0018: escenarios y riesgos sellados como demo; presión de liquidez real),
  **histórico** con Recharts, e **intradía** (2026-07-29, RF-7): parrilla de small
  multiples con todos los indicadores del día operativo VET agrupados por oficial /
  compra / venta / microestructura, cada panel con último valor, sparkline con la
  apertura marcada y la variación intradía (Δ abs y %). El color sigue codificando
  UNA sola cosa —el lado del mercado—, ahora mapeado a los acentos de marca (teal
  compra / coral venta / salvia sin lado); el signo de la Δ va en glifo + texto; un
  solo eje por gráfico; tooltips con el string exacto.

## Sesión y login (ADR-0020)
El guard `auth/RequireAuth.tsx` distingue **cuatro estados disjuntos** —
comprobando sesión · error **con botón de reintento** · redirigiendo · dentro —
y las cuatro cadenas se traducen (antes estaban a fuego en español, con las
claves `auth.*` del diccionario sin usar).

El reintento **limpia el `?code=&state=` de la URL** antes de relanzar, y eso no
es cosmética: cuando `handleRedirectCallback` falla, el `onRedirectCallback` que
limpia la URL no llega a correr, así que cada recarga vuelve a entrar por el
mismo camino y vuelve a fallar. Sin ese botón el estado es **terminal**: solo se
sale editando la URL a mano.

La sesión persiste entre recargas gracias al **dominio propio**
(`auth.higerotech.com`), que hace la cookie SSO de primera parte — no gracias a
guardar nada en el navegador.

## Seguridad (T12 aplicado)
- Tokens nunca en localStorage/sessionStorage (verificable en DevTools).
- Refresh rotation + access token de 900 s (tenant); reconexión WSS con token
  renovado; el token solo viaja en la URL del handshake WSS (mandato del
  contrato; el gateway lo redacta en sus logs).
- nginx: CSP sin `unsafe-inline` para scripts, `frame-ancestors 'none'`
  (clickjacking), `nosniff`, `connect-src` limitado a gateway + tenant y
  **`frame-src` del tenant** — el SDK re-autentica en silencio con un iframe
  `prompt=none`, y sin esa directiva cae en `default-src 'self'`, se bloquea y
  cada recarga acaba en Universal Login visible.
- **`worker-src 'self' blob:`** (añadido 2026-08-01, ADR-0020). No es opcional:
  con `useRefreshTokens` y caché en memoria, `auth0-spa-js` canjea el código en
  un Web Worker que crea desde un `blob:`. Sin la directiva cae en
  `default-src 'self'`, el worker **construye pero muere al cargar** —sin
  excepción, sin log y sin petición de red— y **el login se cuelga por
  completo**. Amplía lo mínimo: un blob solo puede llevar código del propio
  origen y `script-src 'self'` queda intacto.
- Las cabeceras viven en `nginx-security-headers.conf.template` y se **incluyen
  en cada `location` que declare `add_header` propio**: nginx no las hereda si el
  location define los suyos, y por eso el sitio estuvo sirviéndose sin ninguna
  cabecera de seguridad pese a estar escritas en la config.
- **La CSP es plantilla, no literal**: las `${VITE_*}` las sustituye `envsubst`
  en el build con los MISMOS `ARG` que hornean el bundle, así que el dominio de
  la política y el del bundle **no pueden divergir** — si divergieran, el
  navegador bloquearía justo lo que el SDK necesita, con la cabecera escrita y
  aparentemente correcta. Lo vigila `tests/unit/csp.test.ts`: invariantes de
  T12, que cada variable de la plantilla esté en la lista de `envsubst`, que el
  build aborte si queda alguna sin sustituir, y que los defaults de los `ARG`
  coincidan con los de `src/config.ts`.
- Lockfile commiteado (SCA en CI — Gate 2); cero secretos en el bundle.

## Verificación
- **339 tests** (unit / component / contract) con **87,1 % de ramas** (umbral
  Gate 2: 80 %): decimal exhaustivo (incl. la aritmética `BigInt` y el borde de
  medianoche del día operativo VET), reducers, políticas WSS, StreamClient
  contra servidor WS mockeado, endpoints contra MSW, paneles con fixtures
  `satisfies` los tipos del contrato, HistoryView/IntradayView con recharts
  stubbeado, y —desde ADR-0018— diccionario completo en ambos idiomas,
  componentes del sistema por variante/tono, shell ancho y compacto, sellos de
  demo y las derivaciones de series (extremos exactos, parrilla VET, colores). Wiring (App/AuthProvider/useStream/main) excluido de cobertura:
  lo verifica el e2e en vivo.
- `tests/e2e/live-gateway.test.ts` (`npm run test:e2e:live`): token M2M real →
  REST + WSS contra el gateway vivo; skip elegante sin credenciales.
- Build de producción y contenedor nginx verificados (compose, puerto 8080).

## Pendiente
- Topología de **despliegue real** (producción/staging): los túneles de
  Cloudflare son solución de desarrollo, no de despliegue (ADR-0020 lo deja
  explícitamente abierto).
- Multi-pestaña (BroadcastChannel) y code-splitting del Histórico (v2) — el
  bundle pasó de 500 kB al entrar el rediseño.
- Los dos `demo · sin fuente` que quedan (escenarios con probabilidades y
  riesgos redactados) **no son deuda pendiente**: hacerlos reales exigiría
  pronosticar. Los medidores se retiraron con ADR-0019 y el régimen con
  ADR-0021.
- Subir el par categórico del **tema oscuro** a la banda de luminosidad y al
  piso de croma del validador (hoy pasa CVD con holgura pero queda fuera en esas
  dos, que son de estilo). Implica oscurecer los acentos en gráfico: es cambio
  de aspecto, decisión de diseño.
