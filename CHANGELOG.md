# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
y el proyecto se adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!--
Convención de mantenimiento (inventario por ejecución):
- Cada ejecución/sesión de trabajo agrega sus cambios bajo [Unreleased],
  usando las categorías estándar: Added, Changed, Deprecated, Removed, Fixed, Security.
- Al cerrar un hito (p. ej. un gate AI-DLC o un release), se corta una versión:
  se renombra [Unreleased] a [X.Y.Z] - AAAA-MM-DD y se abre un nuevo [Unreleased].
- Guía de versiones mientras no haya código en producción: 0.x.y
  (minor = nueva funcionalidad o gate completado, patch = correcciones/ajustes de docs).
-->

## [Unreleased]

### Added

- **El respaldo está corriendo de verdad contra Drive (2026-08-31).** Hasta hoy
  el esquema existía, estaba probado y **no se había levantado nunca**: el
  contenedor del perfil `respaldo` ni siquiera existía, y la pata de Google
  Drive —autorización, remoto cifrado, una subida— no se había ejercitado. Las
  cifras del README del 2026-08-24 son reales, pero salieron de una corrida a un
  volumen local (`respaldo_prueba`), no de Drive.
  - **Primer incremental en Drive:** ventana `[2026-08-31T23:55, 2026-09-01T01:00)`
    —65 minutos anclados al filo de la hora, o sea el arreglo de `2de91a4`
    comportándose en producción—, `2 859 317` bytes, código de salida 0. Las seis
    tablas con contenido y ninguna a cero, que es la trampa del `COPY` sobre
    hipertabla. Verificado además desde fuera del script: `gzip -t` en verde y el
    `tar` listado tras descargarlo de Drive.
  - **El cifrado en cliente hace lo que dice.** Lo que Google almacena de ese
    archivo es `hlnj11oq8vjhaknv6tmu6d9k70/crh55afpdubh2te13hcerb4212he2cfuo7rcsglme1aja4l79u6g`:
    nombre de archivo y de carpeta cifrados, no solo el contenido.
- **`RCLONE_CONFIG_PASS` en el servicio `respaldo` del compose.** El
  `rclone.conf` va cifrado con contraseña de rclone y el cron corre desatendido:
  sin la variable, cada ejecución esperaría una contraseña que nadie teclea. El
  comentario del compose deja escrito qué compra —que el volumen por separado no
  sirva de nada— y qué no: `docker inspect` la muestra, igual que el token del
  túnel.

### Changed

- **La puesta en marcha del respaldo, reescrita tras ejecutarla (2026-08-31).**
  Estaba escrita de memoria y no sobrevivió al primer contacto. Cuatro defectos,
  todos del tipo que sale en verde o falla mucho después:
  - **Mandaba al volumen equivocado:** `criterio_rclone` en vez de
    `ves-market-watch_rclone_config`. Autorizarías Google en un volumen que el
    compose no monta, y el fallo aparecería a la hora siguiente.
  - **Configurar rclone dentro de un contenedor no funciona.** El callback del
    OAuth escucha en `127.0.0.1:53682`; publicar el puerto con `-p` no vale
    porque Docker reenvía a la IP del contenedor, no a su loopback. El
    consentimiento se completa, el redirect se pierde y **el remoto queda
    guardado con el token vacío, sin error visible**. Ahora la configuración se
    hace en el host.
  - **El asistente interactivo es una trampa:** en *«Edit advanced config?»* vive
    `service_account_file`, y con ese campo puesto rclone ni intenta el OAuth.
    Los pasos van ahora con `config create` y `clave=valor`, donde esa pregunta
    no existe.
  - **Faltaba la pantalla de consentimiento.** Dejar la app en *Testing* parece
    funcionar y **caduca el refresh token a los 7 días**: el respaldo correría
    una semana y moriría solo. Hay que publicarla — y no dispara verificación de
    Google porque `drive.file` no es un scope sensible.
  - El arranque pasa a `up -d --no-deps respaldo`: sin `--no-deps`, `up` evalúa
    también `timescaledb`, que es exactamente lo que borró la base el
    2026-08-23.

### Fixed

- **Ejecutar el respaldo por primera vez encontró dos cosas (2026-08-24).** El
  esquema se mergeó sin haberse corrido nunca; a la primera ejecución salieron
  las dos.
  - **La ventana del incremental se encogía si el trabajo no arrancaba en
    punto.** Mezclaba dos referencias —`FIN` al filo de la hora, `INICIO` a
    «hace 65 minutos»—, que coinciden solo a las en punto, que es justo cuando
    dispara el cron: habría pasado por bueno durante meses. A y 35 la ventana
    salió de **30 minutos**; a y 55 habrían sido cinco. Y en silencio: el
    archivo se sube, pesa lo suyo y aparece en la lista. Ahora sale entera del
    filo de la hora con aritmética de epoch.
  - **El full pesa 2,3 GB, no los 326 MB documentados.** La cifra vieja se midió
    con `pg_dump ... 2>/dev/null; ls -lh`: con `stderr` tapado y encadenado con
    `;`, un fallo del volcado no se ve y el código de salida es el del `ls`. La
    buena salió de la primera corrida real, con el tamaño releído en destino. No
    es cosmético: 90 días de retención pasan de parecer 30 GB a ser **207**. La
    cadencia se mantiene —el destino tiene 2 TB—, pero ahora la decisión está
    tomada con el número correcto, y el README explica qué hacer si algún día
    estorba la subida.

- **Los errores que gastan cuota ya llevan las cabeceras `X-RateLimit-*`
  (2026-08-23).** El gateway solo las ponía en las respuestas que el handler
  **devolvía**: cuando lanzaba —un 404 de «todavía no hay datos»— la respuesta la
  construía `problem.py` desde cero y las cabeceras se perdían, aunque el
  limitador ya hubiera contado la petición. Ahora viajan por `request.state` y
  los manejadores de 404, 400 y 422 las incluyen.
  - **Importa más de lo que parece:** un cliente que sondea un endpoint todavía
    sin datos gasta su límite sin poder verlo y se estrella contra un 429 que no
    vio venir. Es justo lo que hace el SPA al arrancar un mercado nuevo.
  - **Los 401 y 403 siguen sin llevarlas, a propósito:** el limitador corre
    DESPUÉS de validar token y permiso, así que esas peticiones no gastan cuota y
    darles una cifra sería inventarla.
  - **El contrato se contradecía a sí mismo** y también queda arreglado: la prosa
    prometía las cabeceras en «cada respuesta» mientras el esquema solo las
    declaraba en los 200. Ahora la prosa dice lo que el gateway hace —toda
    respuesta que consuma cuota— y `BadRequest`, `NotFound` y `UnprocessableRange`
    las declaran.
  - **Lo encontró el e2e en vivo la primera vez que corrió en CI.** En desarrollo
    la base siempre tiene datos y ese endpoint nunca devuelve 404; contra una base
    recién creada y vacía, sí. Año y medio invisible por no haber ejecutado nunca
    ese camino contra un entorno limpio.

### Changed

- **El conector del túnel entra en el `docker-compose.yml` (2026-08-23).** Corría
  suelto, fuera del proyecto y en la red `bridge`, así que el ingress de
  Cloudflare no podía nombrar servicios y apuntaba a la **IP de LAN del host**.
  Esa IP es de DHCP y cambió —`192.168.1.43` → `.46`—, llevándose por delante el
  entorno entero: al recomponer las reglas, la del API quedó apuntando al puerto
  del SPA, así que cada llamada del cliente recibía un `index.html`, el preflight
  de CORS moría en 405 y el WSS nunca hacía upgrade. **El gateway no vio una sola
  petición** mientras el dashboard aparecía «congelado» con la base de datos al
  día. Nada de eso se veía en el repositorio.
  - Ahora es un servicio bajo el perfil `tunel` —`docker compose --profile tunel
    up -d`— para no imponérselo a quien no lo use, con la imagen fijada a
    `2026.6.0` y el token por `.env`. Comprobado desde la red del proyecto:
    `http://api-gateway:8000/api/v1/health` responde `200 application/json` y
    `http://web-spa:80/` responde `200 text/html`, que son exactamente los dos
    destinos que el ingress debe declarar.
  - **El compose no basta**: las reglas siguen viviendo en el panel de Cloudflare
    porque el conector arranca con `--token`. Hay que repuntarlas una vez a
    `http://web-spa:80` y `http://api-gateway:8000`; a partir de ahí son inmunes
    al DHCP. Queda escrito en el README, con el `curl` que distingue el fallo en
    un segundo: `application/json` bien, **`text/html` significa que el hostname
    del API está sirviendo el SPA**.

### Added

- **El e2e en vivo entra al pipeline: `e2e-vivo.yml` (2026-08-20).** El trabajo
  levanta `api-gateway` con `docker compose up --wait` en el propio runner —lo que
  arrastra timescaledb, que nace con el esquema por los montajes de initdb, y
  rabbitmq— y corre la suite contra `localhost:8800`. Se descartó apuntar al túnel
  de `criterio-dev`: ese gateway vive en una máquina de desarrollo y ataría el
  verde de CI a que esté encendida.
  - **Los disparadores salen de que las dos suites prueban cosas distintas.** Los
    rechazos prueban **código** —que el 401 sea 401, que el WSS cierre con 4401— y
    eso se rompe con un commit: van en cada PR. El camino feliz prueba la
    **configuración del tenant** —que la app M2M exista, con su grant y sus
    permisos— y eso no se rompe con un commit, sino cuando alguien toca el panel
    de Auth0 un martes cualquiera: va en push a main/develop y en un cron a las
    **06:00 UTC**. En cada PR se ejecutaría cuando no hace falta y no se
    ejecutaría cuando sí.
  - **En CI, «no estaba el entorno» tiene que ser rojo.** El archivo entero está
    construido sobre `skipIf`, correcto en local y del revés aquí: el job monta el
    entorno, así que si algo falta —secreto rotado y no actualizado, contenedor
    que no arrancó— un skip sería verde certificando nada, el mismo fallo que esta
    suite ya tuvo. Con `E2E_LIVE_EXIGIDO=1` el test lo convierte en fallo de
    carga del módulo. Comprobado ejecutándolo en los dos modos de ausencia: sin
    credenciales y contra un puerto muerto, ambos en rojo con el motivo escrito.
  - **Vacío cuenta como ausente, y no es cosmética.** En Actions un secreto que no
    existe interpola a **cadena vacía**, no a variable sin definir: con el
    `=== undefined` anterior, el PR de un fork —que no recibe secretos por ser el
    repo público— habría entrado al camino feliz con credenciales vacías y muerto
    contra el 401 de Auth0, que se lee como «el tenant está mal».
  - **La bandera se escribe con el `'1'` en la rama verdadera** a propósito: la
    forma espejo depende de si Actions considera *truthy* la cadena «0», y si no
    lo es, el `||` se la come y devuelve «1» siempre —exigiendo el secreto también
    en los PR de fork, que nunca lo tienen—.
  - **Lo que este trabajo no cubre:** nginx y el túnel de Cloudflare. El runner
    habla con el contenedor a pelo, así que la corrida manual contra
    `criterio-dev` no desaparece: pasa de ser la única comprobación a ser la del
    despliegue. Y los `schedule` de GitHub solo disparan desde la rama por
    defecto, así que el nocturno no arranca hasta que esto llegue a `main`.

### Fixed

- **`docker compose up -d --wait` mentía sobre el gateway (2026-08-20).**
  `api-gateway` era el único servicio del compose **sin healthcheck**, y compose da
  por bueno un servicio que no lo declara en cuanto el contenedor corre: `--wait`
  devolvía con uvicorn todavía arrancando. Lo pagaba quien encadenara algo detrás
  —el e2e del pipeline lo hace— con un «connection refused» que parecía del
  gateway y era del reloj. Se comprobó en la propia máquina de desarrollo: antes
  `Up 13 hours` sin `(healthy)`; ahora `--wait` espera de verdad. `python -c
  urllib.request…` y no `curl`, que la imagen `python:3.12-slim` no trae.
  - El 503 de `database: down` cuenta como no listo y el 200 de `degraded`
    —broker o JWKS caídos— cuenta como listo, que es la verdad: el REST sirve.

### Security

- **`nanoid` a 3.3.18 (GHSA-2v37-7h3g-55p8, 2026-08-20).** Aviso nuevo, ajeno a
  esta rama: lo destapó el T8 del PR del pipeline, que es para lo que está. Llega
  por `vite → postcss → nanoid` y el arreglo cabía dentro del rango que declara
  postcss, así que **un bump del lockfile de tres líneas** en vez de una excepción
  por escrito. El vector —bucle infinito con un generador propio y `size` cero—
  tampoco era alcanzable, pero una excepción es deuda y el parche era gratis.

- **El e2e en vivo gana la mitad que faltaba: los rechazos (2026-08-07).** La
  suite solo probaba el camino feliz y **nada de lo que debe fallar**. Ahora, sin
  necesidad de credenciales: REST sin token y con token inventado → 401 con
  `problem+json` y **sin revelar qué parte de la validación falló** —eso sería un
  oráculo para quien pruebe el borde—, `health` público, y **WSS con o sin token
  falso cerrando con 4401**.
  - Son las aserciones de T11 y T15, y **solo existían como unit tests**. En vivo
    intervienen nginx, el túnel y el proxy; el `TestClient` de Starlette es
    in-process y con el fallo del handshake puesto los unit tests pasaban. Este
    es el primer sitio donde el 4401 se comprueba contra un handshake real.
  - **La suite reportaba PASSED con el gateway apagado.** Cada test hacía
    `if (!arriba) return`: cinco en verde certificando nada. Comprobado apuntando
    a un puerto muerto. Con `skipIf` ahora salen seis «skipped», que es la verdad.
  - **Aprovisionado y verificado el 2026-08-07: 6/6** contra el tenant y el
    gateway reales. El client M2M es una aplicación **aparte de la del SPA**: el
    primer intento usó el `client_id` del SPA, que es público por diseño y de tipo
    *Single Page Application*, y Auth0 no le permite `client_credentials`. Los
    permisos son los **cinco** reales del gateway: `read:rates`,
    `read:indicators`, `read:signals`, `read:depth` y `stream:events` —no hay
    `read:analysis`, `/analysis/current` reutiliza `read:indicators`—.
  - **El gate de secretos cortó el primer intento**, y con razón: el JWT falso
    escrito como literal disparaba `generic-api-key` con entropía 4,65. Se
    resuelve **construyéndolo en tiempo de ejecución** en vez de añadir una
    excepción a `.gitleaks.toml`: silenciar un hallazgo verdadero-en-forma para
    meter un token de mentira le quita los dientes al gate para el próximo. La
    rama se reescribió para que el literal no quede en el historial, que es lo que
    gitleaks escanea.

- **CVE-2026-59870 (`js-yaml`) aceptado por escrito, con caducidad (2026-08-06).**
  Lo destapó el primer PR de la rama: es un aviso nuevo que llega por
  `openapi-typescript → @redocly/openapi-core → js-yaml@4.x`, no algo que traiga
  el código. Se acepta porque el vector —consumo cuadrático de CPU al resolver
  `!!omap`— **no es alcanzable**: lo único que ese paquete parsea es el OpenAPI
  del propio repo, sin `!!omap` y sin control de terceros, y es dependencia de
  desarrollo que no entra en el bundle.
  - **El arreglo disponible rompe la herramienta.** `js-yaml` solo corrige en 5.x;
    con el override el audit queda en cero y el generador de tipos **revienta**
    (js-yaml 5 retiró `types.merge`). Un gate en verde con la herramienta rota es
    peor que uno en rojo, así que se revirtió.
  - **La excepción caduca sola.** `npm audit` no sabe de allowlists —o pasa
    entero o falla entero—, y bajar el umbral o poner `--omit=dev` habría
    desactivado el control para todo el árbol de desarrollo. En su lugar,
    `scripts/auditar-npm.mjs` solo silencia lo aceptado en
    `scripts/npm-audit-excepciones.json` **y falla también cuando una excepción
    deja de aplicar**, para que se borre el día del arreglo en vez de cubrir en
    silencio lo siguiente. Verificado por mutación en los tres estados.
  - Se retira cuando `openapi-typescript` publique con `@redocly/openapi-core@2.x`.
    Revisión anotada: **2026-09-06**.

- **Ratificado el DREAD de T15, último pendiente de diseño del Gate 1
  (2026-08-04).** Puntuación 2/2/2/2/2 = **10** (Jeremi Alcalá), verificada contra
  el código y no contra la ficha: 14 endpoints, todos `GET`, `allow_methods=["GET"]`,
  **sin `allow_credentials`**, y el WSS con el token en la query.
  - **La ficha atribuía la mitigación a CORS, y CORS es la segunda línea.** La
    primera es que **no hay autoridad ambiental que secuestrar**: cada endpoint
    pide bearer, no hay cookie hacia la API y el token vive en memoria del contexto
    JS del propio SPA (T12). Una página ajena no falla al *leer* la respuesta:
    falla al *autenticarse*. Corregida la fila del threat model.
  - Consecuencia: validar `Origin` en el handshake WSS es **defensa en profundidad,
    no un hueco** — sin token no hay handshake que validar.
  - **Disparador de recálculo escrito:** que la API acepte cookies. Ahí un origen
    ajeno ganaría autoridad ambiental y T15 subiría de golpe; es la misma clase de
    presión que T12 documenta con `localStorage`.
  - Reserva anotada: **Discoverability es el factor más flojo** — un
    `curl -H "Origin: …"` revela la política, lo que argumenta 3 (score 11). Se
    mantiene en 2 por consistencia con T11 y porque no cambia la banda de prioridad.

- **El login estaba roto en el contenedor y la CSP era la causa (2026-08-01,
  ADR-0020).** Faltaba `worker-src 'self' blob:`. Con `useRefreshTokens` y caché
  en memoria, `auth0-spa-js` canjea el código en un Web Worker creado desde un
  `blob:`; sin la directiva cae en `default-src 'self'`, el worker **construye
  pero muere al cargar** —sin excepción, sin log y sin ninguna petición de red— y
  el login se colgaba indefinidamente. Lo introdujo el arreglo del 2026-07-31
  (`798b83b`): mientras la CSP no llegaba al navegador el login funcionaba, y se
  rompió justo cuando la política empezó a aplicarse de verdad. *Una CSP que por
  fin se envía es un cambio funcional, no solo de seguridad.* Canario en
  `tests/unit/csp.test.ts`.
- **Cookie SSO de primera parte con dominio propio** (`auth.higerotech.com`):
  T12 **no se relaja** —los tokens siguen solo en memoria— y de paso desaparece
  la presión de pasar a `localStorage` para ganar comodidad, que era el riesgo
  real que acechaba a ese control. Se descartó explícitamente esa alternativa.
- **`web_origins` estaba vacío en el tenant**: Auth0 rechaza el
  `response_mode=web_message` del iframe sin él, así que la re-autenticación
  silenciosa nunca pudo funcionar. Corregido.

### Fixed

- **La profundidad P2P se anclaba en un anuncio manipulado y enseñaba un libro
  que no existía (2026-08-06).** El lado venta se anclaba en 920,00 —ocho
  anuncios con 2 983 USDT— mientras el libro real vivía entre 841 y 845,5 con
  ~8,3 M USDT; las diez bandas del 0,5 % bajaban hasta 874 sin llegar nunca al
  mercado, y el panel dibujaba diez barras idénticas de 372 USDT que se leían
  como liquidez profunda. **Las cifras eran correctas** —verificadas contra el
  crudo con SQL—: lo que engañaba era el encuadre.
  - Es **T2** —anuncios manipulados distorsionan lo que se publica— sobre una
    superficie donde su control no se aplicaba: el filtro MAD protege mediana,
    VWAP y liquidez en el motor, pero la profundidad la calcula el gateway sobre
    el crudo, **y el crudo no decía qué anuncios eran outliers**.
  - **El ingestor persiste ahora el veredicto** junto a cada anuncio, casado por
    `advNo` y no por posición. La regla sigue viviendo en el servicio que la
    posee: reimplementarla en el gateway habría dado dos versiones que tienen que
    coincidir. Un item **sin** la marca —snapshots anteriores— no se filtra:
    suponerle un veredicto que nadie emitió sería inventarlo.
  - No basta con no anclar en el outlier: tampoco suma al acumulado si cae dentro
    de una banda, que es la cifra que el panel escribe.
  - **`p2p_mejor_precio` del motor se queda sin filtrar, y está bien así**
    (`calculos.py` lo dice desde el principio): es el top of book literal y
    ocultarlo sería ocultar que alguien pide 920. La diferencia es que ahí el
    precio **se muestra**, y aquí **se usa como ancla** de una rejilla.
- **Los dos paneles de profundidad se escalaban cada uno contra su propio total**,
  así que la última barra siempre llenaba el ancho: 651.963 USDT de compra y 372
  de venta salían con la misma pinta. Pasan a **escala compartida** — un *small
  multiple* invita a comparar las barras, no a leer los números. Y un volumen
  despreciable a esa escala conserva un filete de 2 px: «poco» y «nada» tienen
  que verse distinto, la misma regla que el hueco sin dato del mapa de calor.

- **Un fallo transitorio del JWKS dejaba la autenticación muerta 60 s
  (2026-08-06).** En un arranque en frío, una sola descarga fallida —un
  `ConnectError` sin mensaje, DNS todavía sin resolver— provocó **2 224
  respuestas 401 durante 57 segundos**, con tokens perfectamente válidos. Pasaba
  en **cada despliegue**.
  - **El mínimo entre descargas se le cobraba igual a un intento que falló.** Ese
    mínimo existe para que tokens con `kid` basura no martilleen a Auth0, pero una
    descarga que no llegó no ha protegido a nadie: ahora un fallo se reintenta con
    espera creciente desde 1 s, y solo una descarga **correcta** impone el minuto.
  - **El JWKS se precarga al arrancar**, antes de aceptar tráfico: la primera
    petición deja de pagar la resolución DNS y el TLS contra Auth0. Es
    best-effort — si falla, el servicio levanta igual y `/health` lo dice.
  - **`/health` decía `auth: ok` durante la caída**, porque la bandera de fallo
    arranca en `False` y una recuperación posterior la limpiaba: 57 segundos de
    caída total sin rastro. Ahora, sin ninguna clave cargada, el validador reporta
    `degraded`.
  - **El log mandaba a buscar una rotación de claves inexistente.** «kid
    desconocido tras refrescar» se emitía también cuando el refresco se había
    saltado por la pausa; los tres casos —refrescado, en pausa, falló— ahora se
    dicen distintos. Y el aviso nombra el tipo de excepción: `ConnectError("")`
    se logueaba como «fetch de JWKS falló: » a secas, sin un solo síntoma.
  - **Una ráfaga con un `kid` nuevo dispara UNA sola descarga** (candado): antes,
    la primera petición marcaba la pausa y todas las demás la encontraban puesta,
    fallando sin que nadie hubiera refrescado.
  - 10 pruebas nuevas con reloj y cliente HTTP controlados —ninguna duerme—;
    `jwks.py` pasa a 95 % y el gateway de 90,72 % a 93 %.

- **Los códigos de cierre del WSS no llegaban al navegador: el stream se
  reconectaba en bucle sin arreglarse (2026-08-06).** El gateway cerraba la
  conexión **antes** de `accept()` en los tres rechazos —sin token, token
  inválido, sin `stream:events`—, y Starlette convierte eso en un HTTP 403 de
  handshake: el frame de cierre no existe y el navegador solo ve `1006`.
  - **El contrato entero era inalcanzable.** `api-contracts.md` y `asyncapi.yaml`
    especifican 4401/4403, el gateway los enviaba y el SPA tiene una política por
    código en `ws/politicas.ts` —4401 refresca el token y reconecta, 4403 se
    detiene porque reintentar no lo arregla—. Con 1006 todo caía en el `default`:
    esperar con backoff y reintentar **con el mismo token caducado**. Medido en
    vivo: 42 rechazos y 24 aceptaciones en 20 minutos, y solo se recuperaba
    cuando algo ajeno refrescaba el token.
  - Arreglado aceptando el handshake antes de validar. **No relaja nada**: el
    token se valida antes de registrar la conexión en el gestor y antes de enviar
    un solo byte. Lo único que cambia es que el cierre puede llevar su motivo.
  - **Las tres pruebas que cubrían esto afirmaban el código correcto y pasaban
    con el defecto puesto.** El `TestClient` de Starlette es un arnés ASGI en
    proceso: no hace handshake HTTP, así que entregaba un código que sobre el
    cable no llegaba a ninguna parte. Reescritas para exigir que el `with` del
    `websocket_connect` **entre** —si alguien devuelve el `accept()` a su sitio,
    fallan—; verificado por mutación.
  - Verificado en vivo con un cliente real: `sin token → 4401 «token requerido»`,
    `token basura → 4401 «token inválido»`, token válido → conecta y recibe. Tras
    desplegar: 0 rechazos de handshake y el SPA estable en una sola conexión.

- **La cobertura de ramas medida el 2026-08-03 estaba inflada (2026-08-04).** Se
  midió con `--cov` a secas, que mete los propios ficheros de test en el
  denominador; como los tests se ejecutan enteros, tiran del total hacia arriba.
  Medido sobre `src/` —lo que el SPA ya hacía con `include: ["src/**"]`—, **tres de
  los seis servicios están por debajo del 80 % de Gate 2**: `ingestor-bcv` 76 %,
  `ingestor-binance` 76 % e `ingestor-historico` 72 %. Los otros tres cumplen
  (`api-gateway` 91 %, `web-spa` 87,43 %, `indicator-engine` 86 %). El criterio de
  salida 1 de Gate 2 pasa de «cumplido» a **abierto en tres servicios**.
  *Una métrica agregada sin declarar su denominador no es una medición.*
- **3 vulnerabilidades `high` en las dependencias del `web-spa`**, transitivas de
  `openapi-typescript` (`js-yaml`, `brace-expansion`): DoS por consumo de CPU o
  memoria al parsear. Es tooling de generación de tipos y no llega al bundle, pero
  el gate de T8 las habría marcado igual. Cerradas con `npm audit fix` —solo cambia
  el lockfile, `package.json` intacto—; suite y build verificados después.

- **El e2e del motor llevaba rojo desde `e0f5f8b` y nadie lo vio (2026-08-03).**
  ADR-0022 pasó a medir la vigencia por **fecha valor**, y el fixture de eventos
  del `indicator-engine` traía `value_date: "2026-07-06"` congelado: desde ese
  commit todo evento del fixture nacía rancio, y `test_flujo_completo_…` afirmaba
  `official_stale is False` sobre una tasa que el motor consideraba —con razón—
  caducada. El fixture pasa a emitir el **día operativo de hoy**, que es lo que
  significa «una tasa publicada»; quien necesite una rancia la pide explícita.
  *La lección no es el literal: es que la entrega de ADR-0022 se verificó con la
  suite del SPA y las suites de Python no se corrieron.*

- **Tres tarjetas del dashboard llevaban días en blanco por una carrera al montar
  (2026-08-01).** La sparkline de 24 h, las comparativas de la brecha y el mapa de calor
  se alimentan de `useHistorialBrecha`, un efecto de MONTAJE. React ejecuta los efectos
  **de hijo a padre**, así que ese efecto disparaba antes que el del `TokenBridge` que lo
  envuelve: `obtenerToken()` encontraba el proveedor sin registrar y **lanzaba**. El
  `.catch(() => null)` del hook se lo tragaba y, con `deps: []`, no se reintentaba nunca.
  - **Sin un solo error en consola y sin una sola petición en el log del gateway**: 874
    líneas de log con 72 `market/depth` y cero `indicators/history`. Lo que delató la
    causa fue que la app decía «No se pudo cargar» y no «sin serie» — dos mensajes
    distintos a propósito, y esa distinción es la que separó «falló» de «no hay datos».
  - Arreglado en el puente: `obtenerToken` **espera** al registro (con tope de 10 s) en
    vez de fallar. Cubre toda la clase, no solo estas tres tarjetas: cualquier petición
    lanzada al montar caía en lo mismo.
  - Verificado en vivo: de 0 a 12 peticiones a `/indicators/history`, todas 200, y las
    tres tarjetas con dato.

- **`banks[].volume` estaba vacío en 31.461 filas del histórico, con el dato en el
  archivo (2026-08-01).** Los exports desde julio publican el volumen por banco en
  `InforPerBank`, un mapa **anidado** cuyo NOMBRE no contiene ninguna palabra de
  volumen; la heurística buscaba en el nombre, así que la columna caía en `extra` y la
  columna estructurada quedaba nula. Quedaba poblada para un export y vacía para los
  otros dos **dentro de la misma tabla**, donde un `null` se lee como «sin volumen».
  - `detectar_columnas` reconoce ahora los mapas anidados por su **contenido**
    (`claves_anidadas`), no por el nombre. De paso, un export que solo trajera el mapa
    anidado también resolvería las tasas desde él.
  - **`cargar --rellenar-vacios`** repara lo ya cargado: única excepción a la
    inmutabilidad de la tabla, con la guarda en SQL —solo dispara si lo almacenado no
    tiene el campo y lo nuevo sí— y sin sobrescribir jamás un valor existente, así que
    es idempotente.
  - Resultado: **128.962 de 128.962 entradas de banco con volumen (de 15 % a 100 %)**,
    0 filas sin él. `rate`, `available` y `low_liquidity` intactos, verificado fila a
    fila contra el CSV; `InforPerBank` **salió** de `extra` — el dato se movió a la
    columna estructurada, no se duplicó.
  - Suite del servicio: 68 → **80 tests**.

- **La atribución de la brecha no se habría disparado casi nunca (2026-08-01).**
  La guarda de hueco de captura se aplicaba también a `official_rate`, y esa
  serie se persiste **solo cuando la tasa cambia** (ADR-0008): una fila de hace
  tres días no es un hueco, es una meseta, y `Δoficial = 0` es exactamente la
  evidencia que la atribución necesita. Con la guarda puesta, la capacidad
  principal de la feature estaba apagada. Encontrado por un test escrito con la
  expectativa equivocada. Medido en vivo tras el arreglo: `Δbrecha −1,168 pp`,
  `Δparalelo −8,749 VES`, `Δoficial 0` ⇒ atribución `paralelo`.
- **Import circular latente en el engine (2026-08-01).**
  `adapters/amqp/__init__.py` reexportaba `consumer`, cerrando el ciclo
  `analizar_revision → publisher → __init__ → consumer → process_p2p_snapshot →
  analizar_revision`. Solo se disparaba si `analizar_revision` era el primero de
  la cadena en importarse, así que vivió latente hasta que un test lo importó
  directo. Nadie usaba el agregador: todo el repo importa de los submódulos.
- **El fallo de login era un estado terminal.** Cuando `handleRedirectCallback`
  lanzaba, el `onRedirectCallback` que limpia la URL no llegaba a correr, así que
  el `?code=&state=` se quedaba puesto y **cada recarga volvia a fallar igual**:
  solo se salía editando la URL a mano. `RequireAuth` gana un botón de reintento
  que limpia el callback antes de relanzar.
- **El guard mentía durante la comprobación de sesión**: mostraba «Redirigiendo
  al inicio de sesión…» mientras hacía `checkSession()`. Ahora distingue cuatro
  estados disjuntos (comprobando · error con salida · redirigiendo · dentro).
- **Las pantallas de sesión no se traducían**, pese a que `design.md` afirmaba lo
  contrario: las claves `auth.*` existían en ES y EN desde hacía semanas y ningún
  componente las consumía. Cableadas.
- **Documentación que describía un tenant que no era el real**: siete documentos
  declaraban «F1 pendiente» (app SPA y client M2M ya aprovisionados desde el
  2026-07-27) y el design del gateway decía «sin offline access» cuando el tenant
  lo tenía activo, junto con la rotación de refresh tokens. Corregido en todos.

### Added

- **`p2p_mejor_precio_filtrado`: el mejor precio contaba media verdad
  (2026-08-07).** `p2p_mejor_precio` va sin filtrar **a propósito** —es el top of
  book literal y ocultarlo sería ocultar que alguien pide 920—, pero no había con
  qué compararlo, así que un anuncio manipulado se leía como precio de mercado.
  Ahora el motor publica también el mejor de los que sobreviven al filtro y **la
  diferencia entre los dos es el dato**: si coinciden, el escaparate ES el libro;
  si se separan, mide cuánto se aleja.
  - **La magnitud la dio el dato.** Sobre 318 snapshots por lado (6 h): en SELL el
    primer anuncio estaba marcado como outlier en **103 de 318** —un tercio de las
    lecturas— y en BUY en 1 de 318.
  - **Verificado reproduciendo el cálculo sobre un snapshot real** (03:40 VET,
    lado SELL): 871 de escaparate contra 860 de libro, **11 VES** por un anuncio
    de 141 USDT.
  - De paso quedó escrito un supuesto que nadie había documentado: los dos
    dependen de que la fuente ordene «mejor primero» por lado, y **nadie ordena**
    —ni el ingestor ni el motor—. Se sostiene (el primero fue el mínimo en 318/318
    BUY y el máximo en 318/318 SELL), pero ahora está dicho.
  - En el SPA, el sin filtrar **deja de competir** en «qué se movió»: un anuncio
    manipulado no es movimiento de mercado. El filtrado sí compite.
  - Ampliación **compatible**: es un indicador nuevo, ningún consumidor anterior
    se entera.

- **`interval` del historial acepta `15m` (2026-08-06).** Ampliación **compatible**
  del enum del contrato (`5m` / `15m` / `1h` / `1d`), pedida por las tres
  pastillas de granularidad del intradia: sin ella, la del medio se habría ido en
  422. Son tres líneas —mapa de `timedelta`, `Literal` de FastAPI y enum del
  OpenAPI— porque `time_bucket` corre en crudo sobre la hipertabla, sin agregado
  continuo que hubiera que crear.
  - Lo prueban dos tests que antes no existían: **ninguno ejercitaba `interval`**.
    Uno de contrato con los cuatro valores y el rechazo (400 con problem+json, no
    el 422 por defecto de FastAPI) y uno de integración contra TimescaleDB real
    que comprueba que 15 min **agrupa**, contrastando su total con el de 1 h sobre
    las mismas capturas —si el intervalo no llegara al `time_bucket`, los dos
    coincidirían y la prueba no diría nada—.
  - En el SPA, `Intervalo` pasa a **derivarse** de
    `components["parameters"]["Interval"]` en vez de repetirse a mano: estaba
    duplicado y por eso se quedó corto. Es la misma regla que el archivo ya
    aplicaba a `Banda`.

- **El Intradía se reordena entero (2026-08-06, rama `feat-intraday`; ADR-0025).** De la
  parrilla original **solo queda la tasa oficial**: cada familia se fue al bloque
  que responde a su pregunta, y los cinco se **derivan del dato** —ninguno cablea
  lo que afirma—. Cada bloque decide además **qué codifica su color** —lado en la
  parrilla, dirección de la Δ en el enfrentado, estado de la condición en
  microestructura—, y por eso ninguno deja el signo ni el estado solo en el tono.
  - **«Lectura de la sesión»** (bloque rector): qué dice el ruleset ahora — qué
    regla está más cerca, cuántas condiciones cumple y cuál la bloquea. La regla
    más cercana la elige el motor (`summary.closest_rule`), **nunca el SPA**:
    recalcularla aquí crearía la segunda fuente de verdad que `RuleDistance` ya
    documenta. Absorbe la frase de día operativo, que colgaba suelta.
    «Exportar sesión» vuelca cada bucket con el valor exacto; «Vigilar esta
    regla» va **deshabilitada y explicándose**, como «Crear alerta» (ADR-0021).
  - **«Qué se movió desde la apertura»**: las cuatro series que explican la
    sesión, elegidas por `z = |último − apertura| / σ₇d`. Normalizar es lo que
    permite comparar unidades distintas — sin ello la liquidez copaba las cuatro
    tarjetas por el tamaño de la cifra, no por moverse. Sin historia una serie
    queda **fuera** del ranking; con σ = 0 y movimiento va arriba del todo.
  - **«Cronología de la sesión»**: apertura, cruces de umbral, saltos de
    liquidez sobre 2σ y último recálculo, con **histéresis por permanencia** de
    15 minutos en los cruces.
  - **«Compra vs. venta, métrica por métrica»** sustituye a las dos parrillas
    de lado: la pregunta útil es en qué se diferencian, y eso exige la misma
    fila. Las filas se **derivan** de las series —una lista fija de ocho habría
    roto la promesa de RF-7 de que un indicador nuevo aparece sin tocar el
    front—; un lado sin serie se dice en vez de rellenarse. Dentro del bloque el
    lado lo dice la columna, así que el color pasa a la dirección de la Δ: como
    comparte tonos con las cabeceras, el signo va siempre escrito.
  - **«Microestructura» deja de ser parrilla: sus cuatro series no son cifras
    del día sino **condiciones** del ruleset, y lo útil de un vistazo es si están
    cumplidas y a qué distancia quedan de estarlo. Cada tarjeta lleva estado,
    línea de disparo y el nombre de la regla con la posición de la condición. El
    color deja de codificar el lado —estas cuatro no lo tienen— y pasa al estado:
    **coral cumple, teal no**, que es la inversión que se espera aquí (el coral es
    del ruleset, lo que dispara, no lo que va bien).
    - **Cuál de las reglas gobierna a cada indicador hay que elegirlo**: el ratio
      y el momentum son condición de TRES reglas con umbrales distintos, así que
      «cumple» no dice nada sin nombrar la regla. Se prefiere `closest_rule` —la
      que el titular ya destaca— y, sin ella, la primera por orden alfabético:
      sin desempate estable la tarjeta cambiaba de umbral sola entre refrescos.
    - **La línea de disparo entra en el dominio de la chispa** aunque la serie no
      se le acerque: dejarla fuera la recorta del lienzo sin avisar, y una chispa
      sin línea visible se lee como si el disparo estuviera cerca. Que la serie
      salga aplanada contra un borde ES la lectura —hoy no dispara, y por mucho—.
    - **Sin análisis no se pinta ningún estado**: ni coral ni teal, sin pastilla
      y sin línea. Elegir un color sería afirmar algo que nadie ha calculado.
  - **La barra de control dice el estado, no ofrece un botón.** Fuera
    «Actualizar»: la vista ya se recarga sola cada 5 min, así que lo que faltaba
    no era un control sino saber si eso está pasando. El bucket pasa de `<select>`
    a tres pastillas excluyentes (5/15/60 min) anunciadas como `radiogroup`.
    - **El punto de frescura sólo late en salvia con dato fresco de verdad**: si
      la carga falla se apaga y el texto dice desde cuándo no se actualiza. Un
      latido verde mientras la carga falla afirma que hay vida donde no la hay, y
      es justo el momento en que alguien lo mira.
    - El pulso se detiene con `prefers-reduced-motion: reduce`, y el test no
      protege sólo a esa animación: exige que **cualquier** animación en bucle
      del CSS esté exceptuada.
  - **Todo formato de Δ pasa por una sola función (`lib/delta.ts`).** Estaba
    repetido en cinco componentes con cinco criterios, y por ahí se colaron los
    dos defectos que llegaron a pantalla: un porcentaje que contradecía el signo
    que tenía al lado y un signo duplicado. No eran fallos de aritmética: eran
    cinco formateos distintos del mismo hecho.
    - Menos tipográfico **U+2212**, «+» solo en positivos, unidad pegada al valor
      con espacio duro, «— sin cambio» cuando no se movió y **sin triángulos de
      dirección** —eran un tercer canal que repetía lo que ya dicen el signo
      escrito y el color—.
    - **Una condición sustituye a dos**: el porcentaje se omite si la apertura no
      llega a 0,5, lo que cubre de golpe el cero, la apertura pequeña («+133 %»
      de casi nada) y la negativa (invierte el sentido).
    - **El signo del porcentaje se COMPONE, no se copia** del que devuelve la
      división: dirección de la Δ + magnitud del cociente. Así el «+−382,85 %»
      deja de ser un caso que recordar y pasa a ser inexpresable.
    - Lo vigilan tres pruebas de fuente (los seis componentes importan la
      función, no queda ningún triángulo, nadie compone un porcentaje a mano) y
      una de vista que barre las cifras de todos los bloques.
  - **Etiqueta y clave, separadas y en un solo catálogo.** Cada serie se nombra
    con una etiqueta legible en caja de oración («Brecha VES», «Drenaje oferta
    6 h») y debajo su clave técnica en snake_case, las dos del mismo sitio: la
    tabla enfrentada, «qué se movió», microestructura y la cronología nombran la
    misma serie igual. Cierra un hueco de RF-9 que arrastraba desde julio —las
    etiquetas estaban cableadas en español y en inglés salían en español—.
    - **La clave mostrada EXISTE en `indicators`**: `p2p_brecha_abs`,
      `p2p_liquidez`, `p2p_drenaje_oferta_6h_pct`. Se descartó un juego de claves
      más legible (`p2p_brecha_ves`, `micro_drenaje_oferta_6h`) porque ninguna
      existe: se leería como identificador y fallaría en la primera consulta.
    - Familia en la tabla (la fila cubre los dos lados) y serie en las tarjetas:
      la clave identifica exactamente lo que se está viendo.
  - **Tooltip propio para los 27 sparklines.** El único que había era el de
    Recharts en la parrilla, y vivía **dentro del flujo** de la tarjeta: aparecer
    empujaba el layout y tapaba la línea de apertura. Los 24 SVG de la tabla
    enfrentada, «qué se movió» y microestructura no tenían ninguno —la serie se
    veía y no se podía leer un valor—.
    - `absolute` sobre el hueco del sparkline (sale del flujo, no mueve un
      píxel) y `pointer-events: none`, que es lo que evita el parpadeo clásico.
    - Se ancla con las **mismas coordenadas que dibuja la línea**:
      `coordenadasSparkline` se extrajo de `trazoSparkline` para que no puedan
      separarse. Voltea a menos de 120 px del borde del viewport.
    - Desenfoque **compartido con la barra de navegación** vía `--blur-nav`, y
      fondo en un token que se voltea con el tema: cableado a la tinta oscura
      sería una caja negra sobre papel en tema claro.
    - **En táctil no aparece**: sin hover no habría forma de cerrarlo. La vía sin
      puntero es «Exportar sesión».
  - **El cero de `p2p_outliers_pct` se pinta como RESULTADO, no como hueco.** Con
    la serie entera a cero, el área del sparkline pasa a una línea hairline
    centrada y la frase «sin outliers en la sesión» en salvia —el color de la
    validación—: el filtro MAD/IQR no tuvo que descartar nada. Ni chispa plana,
    que se lee igual que un dato que falta, ni «(—)».
    - **Se dispara con TODOS los puntos a cero**, no con «no se movió»: la frase
      habla del día entero. Y la nota interpretativa de la tabla exige que **los
      dos lados** lo cumplan: cablearla habría escrito «el filtro no descartó
      nada hoy» el mismo día en que descartó —el 6-ago hubo 17 lecturas no nulas
      en compra y 128 en venta, comprobado en la base antes de implementarlo—.
    - **Solo donde hay lectura escrita del cero**: una mediana en cero no es
      «limpio», es que algo va mal.
  - **`p2p_outliers_pct` queda fuera del ranking de «qué se movió», siempre.**
    Mide la calidad del snapshot, no el mercado, y con una σ de 7 días diminuta
    cualquier microcambio le daba una z enorme: se vio en vivo ocupando la primera
    tarjeta con un «−0,50 (−100 %)». Al excluirla, las cuatro pasaron a ser series
    de mercado.
  - **Ritmo vertical normalizado**: 46 px entre bloques, 18 px de cabecera a
    contenido y entre tarjetas hermanas; contenedor a 1180 px con 24 px de aire
    lateral y `clamp(24px,4vw,44px)` / 96 px. Los 46 px van en un **modificador de
    vista**: la regla base de 24 px la comparten Dashboard, Análisis e Histórico.
  - **Fuera las pastillas «compra», «venta» y «sin lado» de las cabeceras.** No
    informaban: «sin lado» repetía una obviedad del título y el lado de una
    tarjeta ya lo dice su clave (`p2p_vwap_sell`). En su lugar, cada sección lleva
    un subtítulo que dice **qué mira el bloque**.
  - **Una sola tarjeta de métrica (`MetricCard`)** para «qué se movió»,
    microestructura y cualquier bloque futuro. Eran dos componentes con el mismo
    dibujo cuyos valores **ya habían empezado a divergir** —gap 10 contra 12,
    trazo 1,6 contra 1,8—, el mismo patrón que dejó cuatro títulos invisibles.
    - Contrato: etiqueta y clave **del catálogo** (la identidad entra como
      `indicador`, no como dos cadenas sueltas), valor, Δ con su color, apertura y
      serie; opcionales el umbral, la pastilla, la nota y el pie derecho.
    - Estilo fijo **en tokens que ya valían lo pedido**: `--border` era el 8 %,
      `--border-2` el 14 %, `--lift` los −4 px y `--dur-card` los 0,25 s. Sin
      sombra en reposo, sin scale, sin `:active`, sin degradado y sin borde
      lateral de color. Foco con `outline` 2 px y `outline-offset` 3 px.
    - Se retiraron **25 reglas CSS** que quedaron huérfanas y las dos rejillas
      idénticas pasaron a una.
  - 146 pruebas nuevas; el SPA pasa de 348 a 494 y de 87,1 a 88,19 % de ramas.

### Fixed

- **Toda la vista de Intradía estaba rota en TEMA CLARO (2026-08-06).** Los
  prompts de la rama decían «blanco» y se escribió `color: #fff` **siete veces**
  en vez de `var(--white)`, que es el token de máximo contraste y vale `#15181b`
  en claro. El veredicto de la sesión, cuatro títulos de sección, las cifras de
  las tarjetas y los valores de la tabla quedaron en blanco sobre fondo blanco,
  a contraste 1:1, durante ocho commits.
  - **Ninguna prueba se enteró**: todas corren en oscuro, que es el tema por
    defecto. El canario nuevo (`unit/tema-tokens.test.ts`) no mide píxeles —no se
    puede sin renderizar los dos temas— sino que **ningún `color:` de la hoja sea
    un literal** y que `--white` siga volteándose. Verificado por mutación.
  - Lo destapó unificar los títulos de sección: había **dos definiciones del
    mismo elemento** con la misma tipografía y distinto color, y solo una usaba el
    token. Verificado en vivo: 26 elementos se voltean ahora en los dos temas.

- **La cronología volcaba el string CRUDO del contrato (2026-08-06).** Los
  cruces de umbral escribían «p2p_drenaje_oferta_6h_pct -57.10523657 · umbral
  -40» —guion ASCII y punto decimal— al lado de tarjetas que ya escribían
  «−57,10 %». **Ningún test unitario podía verlo**: cada uno mira su componente y
  esto era un defecto de coherencia de la vista entera. Apareció recorriendo la
  página en vivo; ahora hay una guarda que barre las cifras de todos los bloques
  buscando guiones ASCII y signos dobles.

- **El % de variación mentía el sentido con apertura negativa (2026-08-06).**
  Salió al pintar las tarjetas de microestructura: `p2p_momentum_bid_3h_pct`
  abrió en −0,24 y estaba en +0,31 —una subida— y la tarjeta escribía
  «+0,55 (−232,25 %)», con el signo doble incluido. El cociente es
  aritméticamente correcto y la frase es falsa: contra una base con signo el
  porcentaje no describe la dirección del movimiento. `resumenIntradia` lo omite
  ahora cuando la apertura no es **positiva**, igual que ya hacía con el cero.
  - Se corrigió ahí y **no en `porcentajeRelativo`**: como aritmética pura,
    `parte / base` con base negativa está bien y tiene su prueba; lo que no vale
    es llamar a ese número «variación desde la apertura».
  - Afecta a los tres bloques que usan el resumen (parrilla, enfrentado y
    microestructura) y al texto alternativo, que ya no imprime un «(+—)».

- **`etiquetaDiaVET` tenía el locale `es-VE` fijo (2026-08-06):** dentro de una
  frase en inglés salía «operating day jueves, 6 de agosto de 2026». Recibe el
  idioma y usa formato corto.

- **`ingestor-historico` pasa de 71,71 % a 97,22 % (2026-08-04): el criterio de
  salida 1 de Gate 2 queda CUMPLIDO en los seis servicios.** 98 → 138 tests.
  - **`__main__.py` era el fichero más grande del servicio y estaba al 0 %** (178
    sentencias). Dentro: que `--dry-run` **no significa lo mismo en los tres
    comandos** —`derivar-brechas` abre el repositorio real **como lector** porque
    los puntos derivables solo existen en la base, y si los falseara el resumen
    no serviría para decidir nada—; que `--monedas usd, eur` filtre igual que
    `USD,EUR`; que el día de mercado se agrupe en la zona de origen y no en UTC;
    y que los resúmenes digan lo que hay que decir, empezando por las ~1 900
    filas con fecha real y **hora desconocida**.
  - **Los dos adaptadores que escriben en tablas de otros servicios** pasan de
    0 % y 51 % a **100 %**, contra TimescaleDB real. Ahora está comprobado que la
    tasa que usa cada punto derivado es la **vigente en su instante**, que una
    tasa `suspect` (T1) **no** entra en la serie histórica, que `calc_version = 0`
    mantiene lo derivado fuera de `WHERE calc_version = 1`, y que la frontera
    ignora lo que este mismo servicio derivó — sin eso, un backfill se sabotea a
    sí mismo en la segunda pasada.
  - Para probarlos, la suite aplica también las migraciones de `ingestor-bcv` e
    `indicator-engine`: este servicio **escribe en tablas que no son suyas** por
    diseño (ADR-0013), y ahora si un vecino cambia el esquema esta suite se
    entera.

### Fixed

- **El fixture de infraestructura convertía cualquier error en «no hay
  TimescaleDB» (2026-08-04).** Un fichero de migración mal referenciado dejaba
  toda la suite de integración en *skip* y el pipeline en verde. Ahora solo los
  fallos de conexión justifican saltar; un fichero que falta es la suite rota y
  se dice así. Lo destapó una ruta mal calculada al añadir las migraciones
  vecinas — es decir, el propio fallo que el arreglo previene.

- **`ingestor-binance` pasa de 75,92 % a 99,26 % de cobertura de ramas
  (2026-08-04): segundo de los tres servicios por debajo del umbral, cerrado.**
  48 → 79 tests. El patrón se repitió —`__main__.py` y `scheduler.py` al **0 %**—
  y apareció uno nuevo: **`config.py` también al 0 %**, con el fail-fast de
  ADR-0011 dentro.
  - **`config.py`:** sin `MERCHANT_HMAC_KEY` el servicio no arranca. Si el
    arranque fuera tolerante, publicaría snapshots sin `merchant_ref` —forma
    válida para el schema, porque el campo es opcional— y la degradación solo se
    notaría al intentar correlacionar anunciantes semanas después. También queda
    fijado que **una clave vacía cuenta como ausente** y que los defaults del
    polling educado (ADR-0005) son los que dicen ser.
  - **`scheduler.py`:** el suelo `max(espera, 10)`, y que las tres ramas del
    ciclo se distingan — **un salto del breaker no es un fallo ni un éxito**:
    contarlo como fallo dispara alarmas por un comportamiento correcto, contarlo
    como éxito esconde que no se capturó nada. Además, que un lado fallido no se
    lleve por delante al otro.
  - **`__main__.py`:** que `--dry-run` no monte infraestructura **pero sí consulte
    a Binance de verdad**, que es lo que promete su docstring y lo único que
    comprueba que el endpoint sigue respondiendo lo que el schema espera.
- **T7 elevado a integración, como pedía el plan.** `unit/test_resilience.py`
  probaba el breaker contra una operación falsa; `integration/test_client_errores.py`
  lleva un **429 real por HTTP** hasta el contador del breaker y comprueba que,
  una vez abierto, **el ciclo siguiente ni siquiera consulta** — sin ese último
  paso, un breaker que abre no protege de nada. Con él, el cliente llega al
  **100 %**: 429 se reintenta y se cede, 404 no se reintenta y solo pierde su
  página, un 200 con HTML es esquema inválido (portal cautivo), y la conexión
  colgada por el otro extremo es error de red.

- **`ingestor-bcv` pasa de 76,44 % a 99,36 % de cobertura de ramas (2026-08-04),
  y cierra el primero de los tres servicios que no llegaban al 80 % de Gate 2.**
  54 → 80 tests. Todo el hueco estaba en dos ficheros al **0 %** —`__main__.py` y
  `scheduler.py`—, que parecían cableado y no lo eran.
  - **`scheduler.py`:** el `max(espera, 60)` es un suelo antimartilleo. Con
    `FETCH_INTERVAL_SECONDS=0` —o cualquier intervalo por debajo del jitter de
    ±60 s— la espera calculada sale negativa; sin el suelo el bucle consultaría al
    BCV tan rápido como le respondiera, desde una IP que el BCV puede bloquear. El
    test fija el **peor caso** del jitter, no uno al azar. También queda fijado que
    un fallo no deja en el log la línea «sincronización OK».
  - **`__main__.py`:** que `--dry-run` **no monte ningún adaptador de
    infraestructura** (el test hace explotar los reales: si se tocan, falla), que
    el `finally` cierre repositorio y publisher aunque la sincronización reviente,
    que `--nota` sea obligatoria en `aprobar`/`rechazar` —la justificación
    auditable que ADR-0007 exige— y que los códigos de salida lleguen a la shell.
  - **`TimescaleRateRepository.connect()`/`close()` no los tocaba ningún test:**
    el fixture de integración construía el pool a mano, así que el camino que usa
    producción (`__main__.run`) estaba sin ejercitar. Añadido a la suite de
    integración.
- **Marcador `security` con seis escenarios T1 (HTML alterado), pedido por el plan
  de pruebas.** El parser sube de 88 % a **100 %** y cada rama defensiva pasa a
  tener su caso: bloque mutilado, código que no es ISO 4217, valor no numérico,
  moneda duplicada en el camino degradado por regex —la inyección más fácil— y dos
  de fecha-valor corrupta, incluida `2026-13-45`, que pasa el patrón y no existe.
  La regla que fijan es una: **ante un dato dudoso, ninguno** — vale más un
  `ErrorDeParseo` que deje la tasa anterior vigente que una cifra improvisada.

- **Pipeline de CI en GitHub Actions (2026-08-04).** `ci.yml` corre la matriz de
  los seis proyectos —suite **completa**, integration y e2e incluidas— contra
  TimescaleDB y RabbitMQ como `services:`, con umbral de cobertura por servicio y
  el reporte como artefacto (también en rojo). `seguridad.yml` pone los tres gates
  de Gate 2 **rompiendo el build**, no avisando: gitleaks sobre la historia
  completa (T6), `pip-audit` por servicio y `npm audit --audit-level=high` (T8), y
  CodeQL (T9).
  - **Cero cambios de código para meter integration y e2e:** los `conftest.py` ya
    leían `TEST_DATABASE_URL`/`TEST_AMQP_URL` y caían a `127.0.0.1:5433` y `:5672`,
    que es lo que publica el mapeo de puertos.
  - **CodeQL por sí solo no rompe el build** — deja una alerta y sigue. Un paso lee
    el SARIF y falla ante hallazgos de nivel `error`: ese es el umbral de
    severidad que pide Gate 2.
  - Los umbrales de cobertura son un **trinquete** en el valor actual de cada
    servicio, no el 80 % de Gate 2: imponerlo de golpe dejaría tres servicios en
    rojo desde el primer día. Nada retrocede mientras se sube.
  - `pytest-cov` pasa a los extras `dev` de los cinco servicios: `pip install -e
    ".[dev]"` tiene que dar un entorno que pueda correr lo que corre CI.
  - **La primera ejecución destapó una dependencia oculta del entorno local:** el
    e2e del motor hace `from tests.conftest import …` sin `tests/__init__.py`, que
    solo resuelve si el CWD está en `sys.path` — cosa que hace `python -m pytest`
    y no el script `pytest`. Como en local siempre se usa el primero, nadie lo
    había visto.
  - **gitleaks encontró dos secretos, ambos falsos positivos**: el `theme_token` de
    Drupal en los fixtures de la portada del BCV (capturas de una web pública) y el
    `client_id` de la SPA en Auth0, público por diseño (ADR-0012). Quedan en
    `.gitleaks.toml` caso por caso y con su motivo, **no apagando la regla**.

- **Resultado observado de cada señal (2026-08-02).** El gateway publica, por
  señal, cuánto se movió la brecha en las 12 h siguientes (`Signal.outcome`).
  Los dos extremos se resuelven as-of (ADR-0009); si la ventana no se ha
  cumplido, el campo va `null` — eso todavía no ocurrió.
  - **Es historia, no acierto.** Se publica la variación y nada más: sin
    veredicto por señal y **sin el contador agregado «N de M»** que pedía el
    prototipo. El no-objetivo del PRD es no insinuar capacidad predictiva, y un
    «N de M» se lee como tasa de acierto — con las 7 señales que hay hoy, una
    regla tiene n = 1 y «1 de 1» parecería un 100 %.
  - Lo confirma el dato real: `arranque_alcista` es alcista y la brecha bajó
    después en 5 de 6 casos. Un contador habría contado una historia.
  - Sin color de veredicto en la interfaz, a propósito: es un hecho, no un
    acierto ni un fallo. Tests que lo fijan en gateway y SPA.

### Added

- **«Exportar CSV» en la lectura del día (2026-08-02).** Vuelca la revisión con
  los decimales EXACTOS del contrato (sin `toFixed` ni `Number`), con CRLF y BOM
  porque es lo que Excel espera. Sale del dato que ya está en el cliente.

### Changed

- **La cronología resume las repeticiones en vez de listarlas (2026-08-07).** La
  histéresis quitaba el ruido —de 56 cruces crudos a 37— pero los que quedaban
  eran **reales**: aguantaron sus 15 minutos. Estaban repartidos en cinco
  condiciones que entraban y salían, y una condición que cruza once veces **no
  cuenta once historias, cuenta una**: que hoy está inestable.
  - Con más de dos cruces se emite **un solo evento** que dice cuántas veces,
    desde cuándo y cómo está ahora. La cuenta va escrita: agrupar no esconde.
  - Medido sobre tres sesiones reales: **37/30/29 líneas pasan a 6/6/7**. El corte
    es **poco sensible** —con 2, 3 o 4 sale lo mismo—, que es lo que se le pide a
    una constante así.
  - **Se descartó alargar la permanencia**, que era lo obvio: a 120 minutos quedan
    11/9/10 —apenas mejor— y cada cruce real tardaría dos horas en aparecer, con lo
    que la cronología dejaría de ser una cronología para no molestar.
  - El resumen se coloca en el ÚLTIMO cruce (cuando empezó el estado actual), con
    el primero en `desde`: el orden sigue significando algo.
  - No se pudo observar en vivo —el día operativo llevaba una hora y aún no había
    cruces—; la evidencia es la simulación sobre tres sesiones reales y las
    pruebas.


- **Barrido de coherencia documental, README incluido (2026-08-05).**
  - **El `README.md` no mencionaba la CI en ninguna parte**, tres días después de
    montarla: ni en el árbol del repositorio (faltaban `.github/workflows/`,
    `.gitleaks.toml`, `docs/03-implementation/` y `docs/04-testing/`) ni en
    «Desarrollo». Añadida una sección propia, y el estado ahora abre con Gate 2 y
    la cobertura de los seis servicios en vez de terminar en Gate 1.
  - **El plan de pruebas se contradecía consigo mismo:** §11 describía la pipeline
    implementada y §12 seguía listando «Pipeline CI aún no presente en el repo»
    como pendiente.
  - **Cuatro verificaciones de amenaza estaban descritas como plan y ya eran
    hechos.** T1 (HTML alterado), T6 (secrets scanning), T7 (429 → breaker) y T9
    (SAST) pasan a ✔ con su evidencia concreta. **T8 se marca explícitamente
    parcial**: el SCA corre, pero sin lockfiles ni digests audita un árbol que
    cambia entre ejecuciones — el control promete tres cosas y solo está una.
  - Los seis criterios de salida de Gate 2 quedan anotados uno a uno con su estado
    real, y lo que falta para cerrarlo en una tabla con el porqué de cada
    pendiente.
  - `python -m ingestor_historico` se documentaba como `cargar|stats`; tiene
    cuatro subcomandos desde hace dos entregas.
  - Verificado: 12 diagramas Mermaid válidos y 1 088 tests en verde.

- **Barrido de coherencia documental y revisión de gates (2026-08-03).**
  - **La cobertura de ramas de los servicios Python nunca se había medido**: el
    plan la arrastraba como «confirmar ≥ 80 %» en cuatro filas desde Gate 2.
    Medida — y **mal**: con `--cov` a secas, que mete los ficheros de test en el
    denominador. Corregido el 2026-08-04 midiendo sobre `src/`; ver la entrada de
    ese día.
  - **`ADR-0009` pedía definir la fuente del calendario de feriados bancarios y
    ADR-0022 ya había contestado que ese calendario no hace falta** — el emisor
    publica la fecha valor. `<TODO>` cerrado: un pendiente muerto compite por
    atención con los vivos.
  - Siete conteos de tests desfasados corregidos (motor 302→335, gateway
    90/103→108, SPA 339→348 y 87,1→87,43 % de ramas) en el plan de pruebas y en
    el bundle de conocimiento.
  - **Gate 1** listaba «ADR-0001…0018» y hay 24: añadidas 0019–0024, con ADR-0021
    marcada como enmendada por ADR-0023. Su único pendiente de diseño sigue
    siendo la **ratificación HITL del DREAD de T15** (la puntuación existe y está
    en el quadrant chart; falta la firma).
  - `gap_legs` no estaba en `api-contracts.md` pese a viajar en el contrato desde
    ADR-0023, con su regla de orden de despliegue (gateway antes que motor).
  - El bundle no conocía ADR-0023 ni ADR-0024, daba el SPA como «pendiente
    client_id del tenant» (aprovisionado el 2026-07-27) y describía la rampa del
    mapa de calor anterior. Seis entradas nuevas en `knowledge/log.md`.
  - Verificado: 12 diagramas Mermaid válidos y 991 tests en verde en las seis
    suites.

- **El producto pasa a llamarse «Criterio» (2026-08-03, ADR-0024).** «VES Market
  Watch» describía un tracker; la app hoy enseña una **lectura** —régimen,
  distancia al disparo, atribución, calidad del dato—, que es hacia donde han ido
  las últimas entregas. Cambia el nombre en las **27 superficies que alguien
  lee**: `app.titulo` en los dos idiomas, la barra, los `H1` de los documentos,
  los diagramas C4, el bundle de conocimiento y el título de OpenAPI/AsyncAPI.
  - **De paso, el `<title>` de la pestaña dejaba de decir `web-spa`** — el valor
    con el que Vite crea el andamiaje, que llevaba ahí desde ADR-0017.
  - **El tenant de Auth0 se renombró también** (a petición del dueño del
    producto, el mismo día): `Criterio API`, `Criterio SPA` y `Criterio M2M
    tests`. Se hizo con un `PATCH` de un solo campo sobre la Management API —no
    con `auth0 apis update --name`, que expone `--enforce-policies` y
    `--offline-access` como booleanos y podría apagar el RBAC sin que nadie lo
    pida—, con snapshot previo y diff posterior: `name` fue el único campo
    modificado en los tres. Verificado en vivo: el SPA vuelve a pedir token
    contra la API renombrada y la brecha pinta.
  - **Ningún identificador se movió**, y el `audience`
    `https://api.vesmarketwatch/` **no puede moverse**: es inmutable en Auth0 y
    viaja dentro de cada access token emitido. No es un nombre pendiente de
    actualizar; es una clave. Queda como discordancia permanente y deliberada.
  - Los identificadores internos (repositorio, paquetes, contenedores, prefijo
    `vmw-`) tampoco cambian: no se leen en pantalla y el refactor no le da nada
    al usuario.
  - La barra compacta pintaba el nombre a mano (`compacta ? "VES Market Watch" :
    t("app.titulo")`): las dos ramas decían lo mismo, así que el literal pasaba
    inadvertido saltándose la traducción. Colapsado, con guarda en
    `tests/component/shell.test.tsx` verificada por mutación.

- **El mapa de calor deja de ser divergente: rampa secuencial + coral como
  categoría (2026-08-03).** Celdas a 2 px de gap y radio 3 px, para que **la
  mancha domine sobre la retícula**. La escala pasa a cinco pasos del teal de
  marca por alfa (8, 22, 40, 65 y 100 %) y el coral queda reservado a un único
  caso: **por encima del p90**. Son dos preguntas distintas —cuánta brecha y si
  se salió del rango habitual— y ahora se codifican distinto.
  - **Los huecos sin dato se distinguen por forma, no por color.** Medidos a
    1,13:1 del fondo y 1,06:1 de la celda más floja, ningún valor de blanco los
    separaba; llevan filete interior, que no compite por ese tramo de luminosidad.
  - El primer escalón queda a 1,19:1 sobre la superficie, por debajo del piso de
    2:1 del proyecto. **Se acepta a propósito**: en un mapa lo que hay que
    distinguir es una celda de su vecina, y los saltos entre escalones (1,39 →
    1,85) sí separan. Queda escrito en `plan-de-pruebas.md`, no difuminado.
  - Eje X rotulado cada 3 h con sufijo «h»; título «Mapa de calor de la brecha» y
    subtítulo «lado venta · últimos 14 días · bucket 1 h · VET». La leyenda pasa a
    barra continua de degradado con p10 y p90 en sus extremos, 13 px, alineada a
    la izquierda. La nota que declaraba de qué ventana salen los percentiles **no
    se pierde: se muda al subtítulo**, que es donde ya se lee la ventana.
  - La columna de días llevaba `align-content` implícito: el grid repartía el
    sobrante entre sus 14 pistas y cada etiqueta se despegaba 0,25 px de su fila,
    3,6 px acumulados arriba. Fijado, junto con el alto de la cabecera de horas,
    que el `padding-top` de esa columna compensa a mano.

- **El panel de instrumentos pierde su banda de cabecera (2026-08-03).** Queda en
  una línea: `h3` + bajada de 13,5 px con cuántos medidores hay y cómo se ordenan.
  La banda «Qué dice el panel» decía lo mismo que «Distancia al disparo».
  - Cada medidor a radio 22 sobre `--dark-3`, cifra Space Grotesk 30 px, y la
    barra con **tres tratamientos distintos**: tramo normal como superficie
    (blanco 10 %), hoy como pastilla teal 3×14 y umbral como línea coral de
    1,5 px. Si se dibujaran igual no se sabría cuál es cuál.
  - Escala rotulada con **palabras** (bajo/normal/alto) a 12 px; el valor exacto
    de cada corte, en el `title`.
  - «Ver explicación» pasa a botón teal de 44 px con `arrowRight` — objetivo
    táctil, no un enlace de 14 px. Se añade el icono al sistema de diseño.
  - **Sin historia suficiente no se pinta cifra**: «sin historia suficiente» y
    barra vacía. Tiene coste —el valor medido es real— pero la tarjeta es
    comparativa y sin escala empírica el número invita a una comparación que no
    existe.

### Fixed

- **Los bloques del dashboard estaban PEGADOS en cuatro sitios (2026-08-03).** La
  separación era `.vmw-seccion + .vmw-seccion { 46px }`, que solo aplica entre
  dos secciones adyacentes: con un `.vmw-grid` entre medias la cadena se rompía y
  el margen quedaba en 0. Medido: `0 · 0 · 46 · 46 · 0 · 0 · 46`. Pasa a
  `.vmw-vista > .vmw-contenedor > * + * { margin-top: 24px }`, por hijo directo,
  que no depende de qué clase lleve el bloque. Verificado: los 8 saltos a 24 px.

### Changed

- **La tarjeta de brecha, como bloque rector (2026-08-03).** Radio 28, degradado
  neutro, hairline al 8 % y halo radial teal al 13 % desbordado por la esquina
  superior derecha. No contradice la regla de una sola superficie con tinte:
  «Lectura de hoy» tiene el FONDO teñido, ésta un acento sobre fondo neutro.
  - Eje Y de **tres marcas rotuladas**, fuera del SVG (el `preserveAspectRatio`
    que lo estira deformaría cualquier texto de dentro), banda de rango al 12 % y
    mín/máx **con su hora** bajo el eje.
  - **La venta pasa de coral a teal al 45 %**: el coral queda reservado para el
    disparo. Medido antes de cambiarlo — separa ΔE 30–34 bajo protan/deutan, a la
    altura del par validado en protanopia, porque separa por **luminosidad**
    (7,85:1 contra 2,82:1), que es lo que el daltonismo no altera; y conserva el
    trazo discontinuo como tercera pista. Hay test que prohíbe el coral ahí.
  - El delta a 7 días se colorea por sentido: salvia si comprime, coral si abre.
- **«Lectura de hoy» pasa a ser la ÚNICA superficie con tinte (2026-08-02).**
  Radio 28, degradado teal, borde `--teal-line`, padding 24/28. Se retiró el
  brillo teal de `GapPanel` —conserva su degradado neutro— porque dos superficies
  teñidas compiten y ninguna destaca; hay test que lo fija.
  - Titular como **`h2` de verdad**, con punto de 10 px y Space Grotesk
    `clamp(24px,3.4vw,34px)` a −0,03em. Prosa a 780 px con `text-wrap: pretty`.
  - **Chips en dos grupos** separados a la vista: estado del dato y conclusión.
    En una sola fila había que leerlos todos para saber cuál era cuál.
  - Sello y nota metodológica a 13 px `--text-dim`, **no** teal: el teal se
    reserva para el eyebrow, que es lo que marca la superficie.
  - **«Crear alerta» se pinta pero deshabilitada, y lo explica**: ADR-0021 la dejó
    fuera de alcance y activa no haría nada, que es peor que no ponerla.
- **Fuera las descripciones del control: la interfaz describe el mercado, no se
  describe a sí misma (2026-08-02).** Se retiran los tres pies de aclaración —el
  de la tarjeta de régimen, el de la síntesis del panel y el de la distancia al
  disparo— y la nota de «Calidad y procedencia».
  - Motivo de producto: la lectura debe ser **descriptiva del presente y en
    lenguaje llano**. La misma advertencia salía tres veces en la misma pantalla
    y repetida tres veces deja de leerse.
  - **El control no se relaja, cambia de sitio**: pasa a ser el registro mismo,
    verificado contra el texto renderizado con la batería de expresiones
    prohibidas — ahora en los **dos idiomas** (el test en inglés solo comprobaba
    que el pie estuviera, así que sin este cambio se habría quedado sin
    vigilancia) y sin el apaño de recortar el pie antes de buscar dentro de él.
  - Toca **requisitos**, no solo estilo: RF-6 y RF-12 declaraban la aclaración
    «obligatoria en la UI». Enmendados los dos PRD, ADR-0019, ADR-0021, el
    knowledge y `design.md`, con la fecha y el motivo.
- **La barra de navegación a 76 px fijos, y «Salir» deja de ser coral
  (2026-08-02).** Casi toda la forma ya salía de los tokens de ADR-0018; lo que
  se desviaba eran tres cosas:
  - `min-height` + `flex-wrap: wrap` daban 76 px de **mínimo**: con un nombre de
    usuario largo la barra crecía a dos filas, y una barra pegajosa que cambia de
    alto mueve todo el contenido bajo ella. Ahora `height` fijo y `nowrap`.
  - El hover de las pestañas iba a `--text` en vez de a teal.
  - **`Button variant="nav"` era coral sólido con sombra** — el tratamiento del
    CTA. Eso hacía de «Salir», la acción que menos se quiere pulsar, lo más
    llamativo de la pantalla, y gastaba el coral, que aquí significa alerta.
    Pasa a pastilla sobre `--overlay-soft`, como el conmutador de idioma y el
    botón de tema. Dos tests impiden que el coral vuelva.
- **La tira de estado vuelve a ser estado, no diagnóstico (2026-08-02).** Una
  sola línea con el Tag del stream, el último evento, las suscripciones vivas y,
  a la derecha, el sello «datos al 2 ago · 22:50 VET» (del `as_of` del análisis:
  el instante del dato, no el de la entrega; sin análisis no se escribe).
  - **Salen** `flujo /ws/v1`, la cuota REST y `calc/ruleset`: no cambian la
    lectura del mercado y competían por el único renglón con lo que sí. Siguen
    en el tooltip del punto de conexión, en «Calidad y procedencia» y, en
    compacto, en la línea meta del menú.
  - `flex-wrap: nowrap`: con `wrap` la tira se partía en dos en cuanto entraba
    un dato más, que es lo que la volvía un panel.
  - El Tag se comprime a 2 px verticales **en este uso**, no en el componente del
    sistema: sus 7 px más los 7 de la tira la dejaban en 51 px. Ahora 41.
- **La cuota del movimiento que puso la tasa oficial** (`gap_legs.official_share`).
  `atribuir` ya la calculaba y la tiraba tras clasificar; ahora se publica, para
  que el cliente no la recalcule con otra definición.
  - **No es «cuota del cierre», y el prototipo se contradecía**: con Δoficial
    +26,9 y Δparalelo +7,6 la brecha se cierra 19,3, pero el paralelo SUBIÓ —la
    abrió—, así que del cierre la oficial pone el 100 %, no el 78 %. El 78 % es
    su cuota del movimiento total, y así se rotula.
  - Con esas mismas cifras el responsable **no** es «oficial»: 78 % no llega a la
    dominancia mínima de 0,8, así que el motor dice «ambos». La cuota matiza una
    clasificación que es un corte.
- **Variación de la tasa oficial por moneda y tres filas nuevas en «Calidad y
  procedencia» (2026-08-02).** Todo con dato que ya viajaba: sin cambios de
  contrato ni de motor.
  - Cada moneda del BCV muestra cuánto se movió **vs. la publicación anterior**.
    NO se rotula «24 h» como el prototipo: entre dos publicaciones cabe un fin de
    semana o un feriado (ADR-0022), y ponerle horas sería inventar la ventana.
  - **Colisión multi-moneda encontrada de paso**: `vigentes` se indexa solo por
    nombre de indicador, lo cual vale para todo lo `p2p_*` —de una sola moneda—
    pero no para la familia `official_rate*`, donde las cinco del BCV se pisaban
    entre sí. Era latente (nadie la leía). La variación vive ahora en su propio
    mapa por moneda, con test.
  - La variación **se repone por REST** en el resync: el push solo la trae cuando
    el BCV publica, una vez al día, así que si no la cifra tardaría hasta 24 h en
    aparecer. Una sola petición para las cinco monedas.
  - «Calidad y procedencia» suma **cobertura de merchants**, **cuota API** y
    **motor (calc/ruleset)**. Las dos últimas solo vivían en la tira de estado,
    que en móvil no existe.
- **Las piernas de la brecha se publican SIEMPRE (2026-08-02, ADR-0023).** Las
  dos deltas viajaban dentro del claim `atribucion` y desaparecían con él, así
  que la tarjeta de descomposición se quedaba con **160 px vacíos** cada vez que
  el mercado estaba quieto — justo cuando se mira para comprobar que no pasa
  nada. Ahora van en `gap_legs`, con `responsible` aparte y anulable: las deltas
  son hechos, decir quién movió la brecha es una afirmación.
  - `0` y `null` NO se colapsan: `0` es «no se movió» y `null` «no se pudo
    medir». El neto no viaja — es la identidad `Δparalelo − Δoficial` y se deriva.
  - Desplegado gateway → motor → SPA (`additionalProperties: false`), con cero
    descartes en el log; verificado en vivo con `responsible: null`.
- **Reparto vertical en las tarjetas que la rejilla estira.** `.vmw-grid` alinea
  a `stretch`: en una fila con una tarjeta alta y otra corta, la corta crecía y
  su contenido se amontonaba arriba. Medidos 160 px muertos en la descomposición
  y 161 en la referencia P2P; ahora los cuatro paneles quedan en 27 px, que es el
  padding. Se repartió el contenido en vez de recortar la tarjeta o rellenarla
  con dato inventado.
- **La vigencia de la tasa oficial la manda la FECHA-VALOR, no la antigüedad
  (2026-08-02, ADR-0022).** El BCV publica por la tarde la tasa del siguiente día
  hábil: el viernes 31/07 a las 16:36 publicó la del lunes 03/08. Los cuatro
  sitios que calculaban rancidez —dos en el motor, dos en el gateway— medían
  antigüedad de captura, así que **marcaban `official_stale` todos los fines de
  semana sobre una tasa perfectamente vigente**.
  - No era cosmético: con la bandera encendida el motor **suprime la atribución**
    de la brecha (ADR-0021), así que la descomposición se quedaba sin sus piernas
    tres días de cada semana. Y la app se contradecía en la misma pantalla —
    «vigente 2026-08-03» junto a «más de 6 h sin actualizarse».
  - Se descartó derivar «siguiente día hábil» con un calendario: el 24/07/2026
    fue feriado y el BCV publicó el jueves 23 la tasa del lunes 27. Los feriados
    venezolanos no son función del almanaque; la fecha-valor del emisor sí es un
    dato.
  - **Rancia pasa a significar algo**: el BCV no publicó la tasa de hoy. El día
    se corta en Caracas (VET, UTC−4 fijo) porque la tasa rige jornadas bancarias
    venezolanas.
  - `STALE_THRESHOLD_HOURS` desaparece del motor y del gateway — no queda como
    config muerta. El motor gana su única lectura fuera de `indicators`
    (`SELECT value_date FROM official_rates`, filtrando `status = 'valid'` para
    que una tasa retenida por T1 no pase por vigencia).
  - El **contrato no cambia de forma**: `stale` y `official_stale` siguen siendo
    los mismos booleanos, solo cambia cuándo son `true`. Sin orden de despliegue
    que respetar entre gateway y motor.
  - Verificado en vivo: `official_stale` pasó de `t` a `f` en la primera revisión
    tras desplegar, y la prosa de atribución volvió al dashboard.
- **La descomposición muestra las piernas del movimiento, no una descripción de
  la barra (2026-08-02).** Bajo la barra van ahora `Oficial 6 h` · `P2P 6 h` ·
  `Neto brecha` en VES absolutos, desde el claim `atribucion` del motor
  (`{responsable, paralelo, oficial}`), que existía sin cablear.
  - **VES y no puntos porcentuales**: `Δbrecha = Δparalelo − Δoficial` solo es
    exacta en VES. El neto se resta con BigInt porque es una identidad — pedirlo
    aparte permitiría que las tres cifras no cuadraran en pantalla.
  - **La pierna destacada la elige el motor** (`responsable`), no el panel.
  - Sin claim de atribución no se inventan piernas: el motor la calla con la
    oficial rancia o la brecha quieta. El respaldo explica **las dos cosas**, qué
    es la barra y por qué no hay reparto: quitar la descripción sin más dejaba la
    barra sin explicar cada vez que la oficial vencía, que es todos los fines de
    semana.
  - El **máximo** de la comparativa pasa a coral, el mismo color que el exceso del
    mapa de calor: responde la misma pregunta, así que se lee igual.
  - `P2P VWAP` → **`P2P buy VWAP`**: con dos lados en la app, callar cuál era
    dejaba la cifra ambigua.
- **El mapa de calor de la brecha gana un umbral visible (2026-08-02).** La rampa
  pasa a **teal** y cubre del p10 al p90; el **coral marca solo lo que supera el
  p90**. Son dos codificaciones para dos preguntas: la rampa dice *cuánta* brecha,
  el coral dice que se salió del rango habitual de la ventana — y por eso cambia
  de tono en vez de seguir subiendo de intensidad.
  - **El tramo va de p10 a p90, no de mínimo a máximo**: una sola hora extrema
    comprimía la rampa entera y dejaba el cuerpo de la serie repartido entre dos
    escalones, con el mapa leyéndose plano.
  - Los percentiles son **de los 14 días que se pintan** y la leyenda lo rotula
    así: el lado venta no es medidor del panel, luego no tiene percentiles
    publicados que citar. Son discretos (ADR-0017) — se escriben en pantalla, así
    que tienen que ser valores realmente observados.
  - Corte **estricto** (`> p90`): con una serie plana el p90 es el valor de todas
    las celdas y un `>=` habría pintado el mapa entero como exceso, «la brecha se
    salió de su rango» dicho de una serie que no se movió.
  - La rampa teal **no pasó por el validador del skill dataviz** (no está
    instalado). Se derivó igualando escalón por escalón el contraste de la coral
    ya validada y se midió lo que el cambio arriesgaba: ΔE2000 mínimo entre
    escalones 7,32 (oscuro) / 8,56 (claro), contra 6,96 / 8,86 de la coral. El
    número que sostiene el diseño es el salto teal→coral, **ΔE 14,0 bajo
    protanopia** — el doble de lo que separa dos escalones, así que la categoría
    sobrevive al daltonismo. Aun así el exceso va **también en el tooltip**: una
    categoría no debe vivir solo en el tono. Queda anotado como pendiente volver
    a pasarla por el validador.
- **Desarrollo por túneles de Cloudflare** (`criterio-dev.higerotech.com` y
  `criterio-api-dev.higerotech.com`): HTTPS real sin CA local ni tocar el almacén
  de confianza, y hosts que no son `localhost` — requisito para que Auth0
  considere el cliente «verificable» y omita el consentimiento. En
  `localhost:8080` el consentimiento y la falta de persistencia son inevitables,
  y eso es correcto, no un fallo.
- **Un solo issuer**: `AUTH0_ISSUER` pasa a `https://auth.higerotech.com/` en
  gateway, SPA, compose y e2e M2M a la vez. Se descartó una ventana de dos
  emisores para no degradar T11 de «un emisor» a «una lista».
- **La CSP deja de ser un literal**: `nginx-security-headers.conf` pasa a
  plantilla sustituida por `envsubst` en el build con los MISMOS `ARG` que
  hornean el bundle, así que el dominio de la política y el del bundle no pueden
  divergir. `csp.test.ts` verifica el contrato de sustitución completo.
- `offline_access` explícito en `SCOPES` — **solo por legibilidad**: el SDK ya lo
  inyectaba por tener `useRefreshTokens`, y quien lo descartaba era el tenant.

### Added

- **La descomposición de la brecha compara los dos lados contra su propia historia
  (2026-08-01, RF-7 / RF-12, ADR-0021).** La tarjeta mostraba «Promedio 30 días» y
  «Máximo 90 días» calculados sobre los 12 días que había en `indicators`: los
  números eran reales y las ventanas no.
  - **Backfill del lado VENTA**, 61.544 filas (2025-12-02 → 2026-07-20) derivadas de
    los snapshots históricos contra la tasa oficial vigente. Solo ese lado, y medido
    antes de escribir código: el export ES el lado venta (±0,6 VES de
    `p2p_mediana_sell`, ~8 VES del buy), así que su brecha empalma con la del motor a
    −0,08 pp mientras la de compra difería +1,08.
  - **`days_covered` en cada ventana** es el mecanismo de honestidad: una ventana de
    30 días con 12 de serie se publica igual, declarándolo, y la UI rotula «Promedio
    12 d (de 30)». Pasa sola a la etiqueta nominal cuando la serie crece.
  - **La media se pondera por hora, no por muestra.** El histórico derivado y la
    serie del motor tienen densidades distintas y un `avg()` plano se inclinaba
    **5,4 pp** hacia el tramo más muestreado. Los extremos siguen siendo por muestra.
  - Claims `brecha_vs_historia`, `brecha_extremo` e `historia_parcial`, uno por lado
    y contra la ventana completa más ancha. El SPA redacta; el motor clasifica.
  - Contrato `gap_history` aditivo (openapi 0.6.0 → 0.7.0). ADR-0013 enmendado por
    segunda vez: se siembra `indicators`, acotado por tres guardas.

- **Histórico P2P al día: la serie de mercado llega hasta hoy (2026-08-01).** Cargado
  `query_result_2026-08-01T11_47_06…csv` con el `cargar` ya existente: 28.823 filas del
  export, de las que **2.951 eran nuevas** y 25.872 ya estaban — la idempotencia por
  `(captured_at, source_id)` probada en vivo, no solo en test. La tabla queda en
  **32.525 filas · 2025-12-02 → 2026-08-01 · 243 días sin huecos > 2 días**, en cadencia
  de 10 minutos. Unión entre exports sin escalón (824,08 → 824,23) y las horas naive
  del export interpretadas en hora de Venezuela (`TZ_ORIGEN`, UTC−4).

- **Histórico de tasas oficiales del BCV: la serie arranca en 2020, no en julio de
  2026 (2026-08-01, RF-6 de ADR-0013).** `ingestor-historico` gana el comando
  `cargar-oficiales`, que carga el export de los XLS publicados por el propio BCV en
  `official_rates`. **31.078 filas, 23 monedas, `value_date` 2020-03-30 → 2026-08-03.**
  - **La columna se eligió midiendo, no leyendo el nombre.** El export trae BID y ASK;
    el valor que el scraper guarda hoy coincide **a ocho decimales** con el ASK. La
    verificación tras la carga es la prueba: en las **75** combinaciones (moneda,
    `value_date`) donde histórico y serie viva se solapan, **75 coinciden y 0 difieren**.
    Con la BID habría un escalón falso justo en la unión, contaminando toda brecha
    calculada a caballo de la frontera.
  - **La redenominación de 2021 queda absorbida.** Venezuela dividió el bolívar entre
    1.000.000 el 2021-10-01; se carga la columna en escala BsD, la única comparable en
    todo el periodo. Verificado: la serie pasa de 4,1386 (2021-09-29) a 4,1818
    (2021-10-04), sin salto de seis órdenes de magnitud.
  - **El histórico no puede pisar la serie viva.** `captured_at` es la hora de
    publicación del BCV —anterior a nuestra captura del mismo `value_date`— y las
    consultas resuelven por `captured_at` más reciente. Comprobado tras cargar.
  - **La procedencia viaja en el dato**, no solo en el resumen de la carga: `source`
    distingue `BCV` de `BCV-historico`, y las **44** filas (dos jornadas) cuya hora de
    publicación no consta en el XLS de origen llevan `BCV-historico-sin-hora` — la
    fecha es real, la hora es el arranque del día. Descartarlas habría dejado dos
    huecos que se leerían como «el BCV no publicó».
  - **Dos huecos de un trimestre, heredados del origen y declarados**:
    `2021-01-04 → 2021-04-04` y `2023-07-05 → 2023-10-01`. Dos XLS trimestrales del BCV
    vienen truncados (uno trae 9 días, otro 2). No es pérdida de la carga: esos días no
    existen en la fuente.
  - Sin publicación al bus (ADR-0013): reemitir seis años de `official.rate.updated`
    dispararía el motor como si fueran cambios de hoy. Solo `official_rates`; **no** se
    sembró `indicators.official_rate`, donde un `calc_version` mentiría sobre qué
    fórmula generó esas filas.
  - ADR-0013 queda **enmendado**: sus consecuencias decían que histórico y vivo viven
    en tablas distintas. Para las tasas oficiales se decidió lo contrario y a propósito
    —son el mismo dato de la misma fuente por dos caminos de captura—, y separarlas
    habría obligado a `/rates/official/history` a unir dos tablas para lo mismo.
  - Suite del servicio: 39 → **68 tests**.

- **Lectura del estado de mercado — la tarjeta de régimen deja de ser maqueta
  (2026-08-01, RF-7 / RF-12, ADR-0021).** «Lectura de hoy» era literal de arriba
  abajo, incluida una barra de confianza al `width: "68%"` escrita a mano. Ahora
  el motor produce por revisión una lectura interpretativa del mercado **como un
  todo**, en lenguaje llano.
  - **La decisión de diseño fue la frontera, no el algoritmo.** La maqueta
    mezclaba cuatro registros y dos chocaban con límites que el propio repo se
    había puesto: «no se reabre cuando el paralelo despierte» es **predicción**
    (ADR-0019 pto. 9) y «hoy no hay nada que ejecutar» es **consejo** (no-objetivo
    del PRD). Se implementan hechos + atribución causal + condicional
    orientativo; los otros dos no, y no por falta de tiempo.
  - **Régimen** = celda de una matriz de dos ejes mecánicos (movimiento del
    paralelo × dinámica de la brecha), con umbrales en config versionada
    (`config/lectura.v1.yaml`) y **medidos**, no elegidos a ojo: el de movimiento
    es el mismo `0,5` con el que `arranque_alcista@v1` ya decidía que el momentum
    significa algo; el de brecha es la variación absoluta media a 6 h observada
    en la serie real. Si un eje no resuelve, `regime: null` — media clasificación
    no se publica.
  - **Atribución causal** sobre una identidad exacta,
    `Δbrecha_abs = Δparalelo − Δoficial`, con los tres términos leídos por
    `indicador_asof`: sin SQL nuevo. Responde a lo que el panel no respondía —no
    solo «la brecha se cerró», sino **qué lado la cerró**.
  - **Campo `reading` ADITIVO en `analysis.v1.json`**, no un evento nuevo: la
    lectura cita las cifras del propio análisis, así que en dos eventos separados
    el SPA podría pintar una lectura que contradice sus propios medidores.
  - **Silencios deliberados**, todos con test: sin atribución con la oficial
    rancia (la brecha se calculó contra una tasa vencida), sin frase de banda en
    bandas intermedias o con escala en respaldo, sin proximidad a reglas con
    confianza baja.
  - **SPA de 3 sellos demo a 2.** Fuera la barra de confianza: `confidence` es
    binario y una barra continua fingía precisión; la maqueta además decía
    «Confianza media», que no existe en el contrato. `lectura.test.tsx` comprueba
    contra el texto renderizado que no hay nada imperativo ni predictivo.
  - **ADR-0019 pto. 9 enmendado**: decía «ni detección de régimen». Se acota el
    término a régimen *predictivo* —que sigue excluido— frente a clasificación
    *del presente*. Sin la enmienda, el repositorio se contradecía a sí mismo.
  - Glosario a **0.3.0** (Lectura de Mercado, Régimen de Mercado, Atribución).
    Engine **244 tests** con `domain/lectura.py` al 100 %; SPA **230 tests**,
    88,2 % de ramas.

- **Módulo de análisis de indicadores — el panel de instrumentos deja de ser demo
  (2026-08-01, RF-6 / RF-11, ADR-0019).** El panel mostraba valores reales
  rodeados de literales escritos a mano —la escala percentil, el ancho del
  relleno, la marca de umbral y la nota— ajenos al valor que estaban rodeando.
  Ahora el motor calcula lo que representan y el sello `demo · sin fuente` se
  retira del panel.
  - **Contrato nuevo `schemas/analysis.v1.json`** y evento `analysis.updated`, no
    un `indicators.v2`: el `const: 1` del schema de indicadores habría obligado a
    desplegar engine y gateway en el mismo instante.
  - **Engine**: `domain/analisis.py` (puro) + `application/analizar_revision.py`,
    config versionada `config/analisis.v1.yaml`, migración `003_analysis.sql`
    (hypertable `indicator_analysis`, payload verbatim en JSONB, retención 90 d) y
    cache de distribuciones con TTL. La escala son percentiles **reales** de la
    ventana calculados con `percentile_disc` —`numeric` exacto, nunca float
    (ADR-0017)— con respaldo por los umbrales del ruleset cuando falta historia.
  - **Gateway**: `GET /api/v1/analysis/current` (permiso `read:indicators`
    reutilizado, 404 si la revisión es rancia) y tópico WSS `analysis`. OpenAPI y
    AsyncAPI a **0.5.0**.
  - **SPA**: `GaugePanel` reescrito con pie de escala real, relleno del contrato,
    una marca por cada regla que el medidor alimenta, detalle desplegable
    accesible y síntesis del panel. 67 claves nuevas × 2 idiomas en registro
    didáctico.
  - **Frontera respetada**: no hay pronósticos, régimen ni probabilidades. La
    síntesis es proximidad aritmética a reglas ya versionadas, `rules_met` no
    implica emisión (el cooldown pudo suprimirla) y la UI lleva siempre la
    aclaración de que no es una predicción.
  - Suites: engine 71 → **170**, gateway 90 → **103**, SPA 179 → **210**
    (88,7 % de ramas). El único cambio sobre el camino de emisión de señales
    (`_vista_vigente` ampliada) va blindado con un test que compara las señales
    emitidas con y sin análisis.

### Changed

- **La escala de percentiles exige cortes estrictamente crecientes**, no solo
  monótonos (ADR-0019, punto 5). Encontrado en el compose con datos reales: con
  14 039 muestras de `p2p_outliers_pct_buy` casi todas en cero, p10 = p50 = p90 = 0
  y un snapshot impecable —0 % de outliers— salía clasificado `very_high`, «de lo
  más alto de los últimos 90 días», porque la igualdad cuenta hacia arriba.
  Ninguna regla de desempate lo arregla sin invertir el error en series saturadas
  por arriba: sin dispersión entre los cortes **no hay banda que sostener**, así
  que se cae al respaldo, que además dibuja el umbral real del 30 %.
- `docs/02-design/api-contracts.md` a **0.5.0** (5 eventos, 9 endpoints REST,
  5 tópicos WSS); PRD del motor a **0.4.0** con RF-6 y su nodo en el
  `requirementDiagram`; PRD del SPA con RF-11 y la enmienda a «RF-5 ampliado».
- `docker-compose.yml` monta `003_analysis.sql` como `902c_analysis.sql`.

### Security

- **El SPA se servía SIN cabeceras de seguridad (2026-07-31)** — se pidió añadir
  `frame-src` a la CSP y al verificarlo apareció algo mayor:
  - **Ninguna respuesta llevaba CSP, `X-Content-Type-Options` ni
    `Referrer-Policy`**, pese a estar escritas en `nginx.conf`. Causa: en nginx,
    un `location` que declara `add_header` propio **descarta todos los
    heredados** del `server` — y los dos locations de cache tenían el suyo. El
    control que T12 y ADR-0017 daban por implementado no llegaba al navegador.
  - Las cabeceras pasan a `nginx-security-headers.conf`, incluido en el `server`
    y en cada `location` con `add_header` propio.
  - **`frame-src` del tenant añadido**: el SDK de Auth0 re-autentica en silencio
    con un iframe `prompt=none` (`useRefreshTokensFallback`), y sin la directiva
    caía en `default-src 'self'`; el iframe se bloqueaba y cada recarga acababa
    en Universal Login visible — justo lo que ese fallback existe para evitar.
    Funcionaba en `vite dev` (sin CSP) y se rompía solo en el contenedor.
  - Verificado en el contenedor con una sonda temporal en el mismo origen:
    `example.com` **bloqueado** por `frame-src`, el tenant **permitido**; y el
    script inline de la sonda bloqueado por `script-src 'self'`, que confirma
    que la política se aplica. Sonda retirada.
  - `tests/unit/csp.test.ts` vigila la trampa de la herencia (todo location con
    `add_header` debe incluir el fragmento), que `frame-src` y `connect-src`
    usen el `config.auth0Domain` del bundle, y que sigan los controles de T12.
    Comprobado a la inversa: quitando un `include`, falla.
  - Corregido además el encabezado de `AuthProvider.tsx`, que decía «refresh
    rotation **sin** fallback iframe» mientras el código lo activaba.
  - 173 → **179 tests**.

### Fixed

- **La tira de estado podía pintarse un fotograma en móvil (2026-07-31)** —
  reportada como visible en móvil; el contenedor del compose servía un bundle
  anterior al trabajo responsive, pero al mirarlo apareció un defecto real:
  - `useCompacto` arrancaba en `false`, así que **el primer render siempre era
    el ancho**: en un móvil la tira se pintaba y desaparecía al correr el
    efecto, con su salto de layout. Ahora el ancho se mide **síncronamente** en
    el estado inicial.
  - La tira se esconde además **por CSS** bajo 760 px. No es redundancia: el
    estado de React llega un tic tarde y la regla vale aunque el JS falle.
  - `tests/unit/compacto.test.ts` vigila que el 759 del CSS y el
    `ANCHO_COMPACTO` del hook no se separen — TS y CSS plano no pueden
    compartir constante. El test del fotograma se comprobó a la inversa:
    revirtiendo el hook, falla.
  - Restaurada la sección «Shell responsive» del `design.md` del SPA, que se
    perdió por error al reescribir la sección de paleta en el commit anterior.
  - 169 → **173 tests**.

- **Paleta de datos del `web-spa`: los acentos de marca dejan de codificar dato
  (2026-07-31)** — cierra la regresión de accesibilidad que dejó el rediseño:
  - **Par categórico validado por tema**: claro `#10846e` ↔ `#cf4946`
    (**ΔE 8,1** deutan, sobre el objetivo de 8) y oscuro `#8ad6cc` ↔ `#f97171`
    (ΔE 13,2). Venía de **ΔE 5,9** en claro — bajo el piso de 6, donde ni el
    rótulo visible lo excusa: un lector protanope no distinguía compra de venta.
    El claro se movió **4,1 OKLab** respecto de la marca, lo mínimo para cruzar.
  - **«Sin lado» pasa a tinta neutra**: no es una tercera categoría, es la
    ausencia de lado. El salvia de marca leía gris igualmente (croma 0,046) y
    encima competía con el teal.
  - **El mapa de calor pasa a rampa secuencial de un tono** por tema
    (`--calor-1` … `--calor-5`). La anterior estaba escrita a fuego con los
    valores del tema oscuro: no era monótona en luminosidad —así no se lee una
    magnitud— y en claro su extremo bajo quedaba a **1,67:1** sobre blanco, es
    decir, invisible. La leyenda ahora habla de intensidad, no de luminosidad,
    porque en claro sube oscureciendo y en oscuro aclarando.
  - Todo medido con el validador del skill dataviz, no a ojo; y el canario
    `tests/unit/paleta.test.ts` **fija los valores medidos**: si alguien cambia
    un slot, el test falla y pide volver a pasar el validador. Lo que se rompió
    esta vez fue exactamente eso — el color cambió y la palabra «validada» se
    quedó en los documentos sin que nada fallara.
  - 162 → **169 tests**.
  - Queda abierto, como asunto de diseño: subir el par del tema oscuro a la
    banda de luminosidad y al piso de croma (hoy pasa CVD con holgura pero queda
    fuera en esas dos, que son de estilo de paleta, no de lectura).

### Added

- **Shell responsive del rediseño (2026-07-31)** — el diseño declara la tira de
  estado dentro de `isWide` y la implementación la pintaba en todos los anchos,
  que es lo que la partía en dos filas en pantallas medianas:
  - **La tira desaparece en compacto** y su información se reparte: punto con la
    antigüedad del último evento en la barra, y detalle completo (usuario ·
    estado · suscripciones · versión de cálculo) en la línea meta del menú.
  - **Repliegue intermedio** (< 1080 px): ceden suscripciones y cuota; el estado
    del stream y el último evento no ceden nunca.
  - La barra compacta recupera la **vista actual** que pedía el diseño, con
    `flex: none` para que entre entera o se retire — sin él, flex la estruja a
    0 px antes de su punto de corte y parte el texto a media palabra.
  - **El estado del WSS deja de depender del color**: `role="status"` +
    `aria-live="polite"` en las dos variantes, y en compacto el punto lleva el
    estado en `aria-label`, así que una caída se anuncia en vez de solo cambiar
    de tinte.
  - Escalera verificada midiendo en el navegador a 1280/1000/900/800/759/560/
    500/480/440/400/360/320 px (las media queries no corren en jsdom): una sola
    fila en la tira, sin desbordamiento horizontal ni solapes en ningún ancho.
  - 156 → **162 tests** (88,9 % de ramas).

- **Rediseño del dashboard con el sistema de diseño Higerotech (2026-07-31,
  ADR-0018)** — importado del proyecto de diseño `Rediseño dashboard Higerotech`
  (`VES Market Watch.dc.html`) vía MCP de Claude Design:
  - **Sistema de diseño en el repo, no enlazado**: tokens (color, tipografía,
    espaciado, efectos, tema claro) en `src/ds/tokens/`, componentes `Button`,
    `Tag`, `Pill`, `Stat`, `Icon` y `Container` portados a TSX tipado, y las
    cuatro **`woff2` autoalojadas** (Inter + Space Grotesk, OFL 1.1, idénticas
    byte a byte a las del sistema). La CSP sigue en `default-src 'self'`: ningún
    CDN de fuentes. El tema claro **reasigna los mismos tokens** con
    `data-theme="light"` — el mecanismo que define el propio sistema.
  - **Shell nuevo**: tira de estado (WSS, suscripciones, antigüedad del último
    push, `calc_version`, cuota REST), barra con logo, pestañas, selector de
    idioma, alternador de tema y salir, **variante compacta < 760 px** con menú
    desplegable, y pie de marca. Todo lo que muestra sale del store: sin evento
    todavía lo dice, no inventa un «hace 34 s».
  - **i18n ES/EN real** (no un control decorativo): diccionario tipado donde
    `EN` es `Record<Clave, string>` sobre las claves de `ES` — **olvidar una
    traducción no compila**. Los nombres canónicos de indicadores y señales NO
    se traducen (son del contrato) y los decimales se formatean desde el string
    exacto con los separadores del idioma, sin pasar por float.
  - **Secciones nuevas alimentadas con dato real** de `/indicators/history`
    (dos llamadas filtradas por indicador y moneda): sparkline de 24 h en el
    titular de la brecha, **mapa de calor de 14 días × hora en VET** (las horas
    sin bucket quedan vacías, no se interpolan) y comparativas contra los
    promedios de 7/30 días y el máximo de 90 — media exacta con `BigInt`.
    La descomposición reparte el precio P2P entre pierna oficial y brecha con la
    tasa vigente y el VWAP.
  - **Vista «Análisis»** como cuarta pestaña, y la **evidencia de cada señal
    ahora se despliega en línea** (antes, modal): misma trazabilidad de T10
    —regla versionada, insumos exactos, evento disparador— sin sacar al usuario
    de la cronología.
  - **Sello `demo · sin fuente`** en todo bloque que el diseño pide y la
    plataforma no calcula (régimen de mercado, percentiles de backtest de los
    medidores, escenarios y riesgos), con la explicación en la bajada de cada
    sección. Es RF-5 aplicado al diseño: el problema no es mostrar un ejemplo,
    es que se lea igual que un número servido por el gateway. La lista de sellos
    es, exactamente, el trabajo pendiente del `indicator-engine`.
  - **156 tests** (100 → 156) con **88,6 % de ramas**: diccionario completo y
    con los mismos marcadores en ambos idiomas, componentes del sistema por
    variante/tono, shell ancho y compacto, sellos de demo, derivaciones de
    series (extremos exactos, parrilla VET, rampa de color) y los paneles reales
    con sus vacíos honestos. `DepthChart` deja Recharts por barras del sistema.
  - Revisión visual del rediseño completo (dashboard y análisis, claro y oscuro)
    con un andamio temporal de datos sembrados, **retirado al terminar**; el e2e
    con login real sigue bloqueado por el `client_id` del tenant (F1 de ADR-0017).
  - **Defecto abierto que deja el rediseño**: al mapear las series a los acentos
    de marca, la separación CVD en **tema claro** cae a **ΔE 5,9** en el par
    compra/venta (protan) — bajo el piso de 6 del validador de dataviz, donde el
    rótulo visible ya no lo excusa; en oscuro pasa con ΔE 13,2. Medido con el
    validador, no a ojo. No se repinta aquí porque elegir pasos nuevos de las
    rampas de marca es decisión de diseño; queda con remedio anotado en el
    `design.md` del SPA, en el plan de pruebas y en ADR-0018.

### Changed

- **Barrido de coherencia documental (2026-07-30)** — los documentos de estado
  habían quedado detrás del repo en tres olas de trabajo (gateway, SPA, intradía).
  Contrastado contra el código y las suites reales; corregido lo que mentía:
  - **Conteos de tests contra la realidad** (`pytest --collect-only` y `npm test`):
    api-gateway **83 → 90** (§4 del plan; el resto de docs decían 78) y web-spa
    **65 → 100** con **86,5 % → 85,7 % de ramas** (plan y `design.md` del SPA).
    bcv 54, binance 48, historico 39 y engine 77 ya coincidían.
  - **Gate 1**: decía `ADR-0001…0015`, «gateway aún sin código» (implementado desde
    el 2026-07-26), «WSS: esqueleto hasta AsyncAPI» (publicada el mismo día) y
    `T1–T14`. Ahora `ADR-0001…0017`, AsyncAPI 3.0 como evidencia, T15 incorporada
    con su DREAD pendiente de ratificación HITL, y el threat model con sus 9
    componentes (entró `web-spa`). Adenda que deja constancia, sin tocar el veredicto.
  - **Gate 0**: 5 → **6 PRDs** (entró `web-spa-dashboard.md`) y el residual «nombrar
    los consumidores» partido en dos: la **app** consumidora quedó resuelta por
    ADR-0017; identificar a los **usuarios** del piloto sigue abierto.
  - **Charter**: el residual de apps consumidoras seguía listado en «Estado» pese a
    que la propia enmienda del 27 lo cerraba; el `<TODO: identificar>` de la tabla de
    stakeholders ahora distingue usuarios (abierto) de app consumidora (`web-spa`).
  - **PRD `api-streaming`**: figuraba «pendiente de implementación» y con el
    front-end/SPA como no-objetivo «proyecto aparte» — ambas cosas superadas.
  - **Plan de pruebas**: §7 se quedaba en T12 y daba el SPA «fuera de este repo»
    justo donde el threat model lo marca implementado; añadidas las filas T13–T15,
    corregido el criterio de salida de Gate 2 (T1–T15), añadida la cobertura de
    resiliencia del bus en §5.4 y **cinco filas del `web-spa`** en la matriz de
    trazabilidad (no tenía ninguna, con PRD propio desde el 27).
  - **Pendientes que describían un mundo viejo**: «app SPA se crea junto con el
    front-end» (existe desde el 27 — falta su `client_id`), «exponer el histórico
    cuando exista el api-gateway» (existe; simplemente no lee esa tabla), «engine
    fase 2 usará la serie como línea base» (la fase 2 se entregó sin consumirla),
    y los del motor: profundidad la proyecta hoy el gateway e intradía se deriva
    en el cliente — persistir ambas en el motor sigue pendiente.
  - **`design.md` y README del `web-spa`** no conocían la vista **Intradía** (RF-7,
    2026-07-29): faltaban la tercera vista, `lib/intradia.ts` y la aritmética `BigInt`.
  - **`knowledge/index.md`**: «5 PRDs», `ADR-0001…0015` y «los 5 servicios» en el mapa
    del bundle; **README raíz**: el compose ya no es «solo RabbitMQ + TimescaleDB».
  - **`repo-history.md` regenerado** con su script (`scripts/gitgraph_branches.py`):
    iba 6 commits atrasado — la bitácora terminaba el 2026-07-26 y `develop` figuraba
    en `38abe5e` (41 commits) cuando va por `4578db2` (47). gitGraph validado.

### Fixed

- **El push WSS del `api-gateway` sobrevive a una caída del bus (2026-07-30)** —
  era lo único roto en vivo: cualquier interrupción de RabbitMQ dejaba el push
  muerto **hasta reiniciar el contenedor**, y en silencio. Tres defectos reales,
  los tres verificados y corregidos:
  - **Arranque sin bus = muerte permanente.** `start()` conectaba una sola vez;
    si el broker no estaba, se logueaba un warning y no se volvía a intentar
    nunca. Ahora un supervisor reintenta con backoff exponencial + jitter (1 s →
    30 s) hasta engancharse, sin reinicio y sin bloquear el arranque del REST.
  - **`/health` mentía durante toda la caída.** `conectado()` miraba
    `connection.is_closed`, que en una `RobustConnection` **solo** es cierto tras
    un `close()` explícito: con el bus caído, `/health` seguía reportando
    `broker: ok`. Ahora responde «hay consumo» (no «hay socket»), y solo vuelve a
    `ok` cuando la restauración de cola, bindings y consumidor terminó bien —
    aio-pika marca `connected` **antes** de restaurar, y esa restauración puede
    fallar y volver a caer.
  - **Cero alertas.** Se añade el puerto `AlertNotifier` al gateway (el mismo del
    `indicator-engine`) con adaptador de log (`adapters/alertas.py`, CRITICAL):
    una alerta al caer y otra al restablecerse, **una por episodio** — reintentar
    cada pocos segundos no debe volverse una tormenta de alertas.
  - De paso, **fuga de tareas**: cada intento fallido de `connect_robust` dejaba
    dentro de la `RobustConnection` una tarea de reconexión propia reintentando
    para siempre —y que sobrevive a la cancelación—, así que cada reintento del
    supervisor habría sumado un zombi. La conexión ahora se instancia y se conecta
    por separado para poder cerrarla cuando el intento falla (lo detectó la suite:
    colgaba el runner de pytest).
  - **5 tests nuevos** (85 → 90 en el servicio; el conteo documentado, 78, ya
    venía desactualizado): unit sin infraestructura (arranque sin bus, alerta
    única, recuperación del supervisor, `close()` limpio, app completa con
    `/health` degraded) e integration contra RabbitMQ real (caída → alerta →
    reconexión → el push se reanuda de verdad).
  - **Verificado en vivo** con `rabbitmqctl close_connection` sobre la conexión
    del gateway (sin tocar los demás servicios): alerta de caída inmediata,
    **restablecido en 28 ms**, y la cola efímera con sus 4 bindings y su
    consumidor de vuelta según `rabbitmqctl list_queues`/`list_bindings`.

### Added

- **`web-spa` — el front-end entra al monorepo (2026-07-27, ADR-0017 *accepted*;
  enmienda HITL del charter: dejaba de ser «proyecto aparte»)**. Dashboard web
  React + Vite + TypeScript con `@auth0/auth0-react`, primera app consumidora de
  la plataforma (cierra además el residual del charter «nombrar apps consumidoras»):
  - **Auth (T12 implementado, ya no control externo)**: Auth Code + PKCE contra
    Universal Login; tokens SOLO en memoria (`cacheLocation: memory`), refresh
    rotation sin fallback iframe, renovación proactiva del token del WSS a
    `exp − 60 s`; CSP del nginx sin `unsafe-inline` y `frame-ancestors 'none'`.
  - **Dashboard en vivo**: brecha + spread como stat tile, referencia P2P por
    lado con confianza (`low` resaltado), tasa oficial multi-moneda con `stale`,
    microestructura, profundidad por bandas (small multiples buy/sell — paleta
    categórica/divergente validada con el validador del skill dataviz, light y
    dark), feed de señales con evidencia completa (regla + insumos — T10).
  - **StreamClient WSS** singleton (respeta el límite de 5 conexiones/usuario;
    guard de HMR): suscripción a los 4 tópicos, backoff exponencial con jitter,
    watchdog de ping (75 s), política por cierre (4401 → refresh y reconexión ·
    4403 → detener · 1008 → espera larga) y **resync REST en cada (re)conexión**
    (ADR-0016). Vista de **histórico** con Recharts (rango ≤ 90 días validado en
    cliente, paginación con progreso y cancelación, bucket 5m/1h/1d).
  - **Contrato tipado**: `src/api/types.gen.ts` GENERADO del `openapi.yaml` del
    gateway y commiteado, con check de frescura en `npm test`; decimales como
    string exacto de punta a punta (`lib/decimal.ts`, sin float — única
    conversión: coordenadas de gráfico).
  - **65 tests** vitest (unit/component/contract con MSW y WebSocket mock;
    fixtures `satisfies` los tipos del contrato) — **86,5 % de ramas** (umbral
    Gate 2 ≥ 80 % aplicado en la config) + e2e en vivo `test:e2e:live` (token
    M2M real → REST + WSS) con skip elegante sin credenciales.
  - **Compose**: servicio `web-spa` (multi-stage node:24 → nginx, puerto host
    **8080**); dev diario con Vite en 5173. `.gitignore`/`.dockerignore`
    ampliados para Node (node_modules/dist/coverage; regla: ningún archivo del
    SPA se llama `config.json`).
  - Docs: PRD `web-spa-dashboard.md`, ADR-0017, charter enmendado (front-end al
    alcance), C4 context/container con el SPA como contenedor en el browser,
    plan de pruebas (pirámide vitest), knowledge (ficha + índices + log).
  - **Pendiente (HITL — bloquea el e2e con login real)**: `auth0 login` y F1 de
    ADR-0017: app SPA del tenant (callbacks 5173/8080, rotation) → `client_id` a
    `src/config.ts`; client M2M de prueba (5 scopes) → `.env` raíz;
    `allow_offline_access` en la API del tenant.

- **Vista «Intradía» del `web-spa` — todos los indicadores del día operativo
  (2026-07-29)**. Tercera pestaña con una parrilla de small multiples: un panel
  por indicador (oficial / compra / venta / microestructura) con último valor,
  sparkline y la **variación intradía** — la Δ contra la apertura del día VET
  que el glosario define y que hasta ahora no calculaba nadie.
  - **Ventana = día operativo VET** (UTC−4 fijo: sin horario de verano desde
    2016), no las últimas 24 h móviles. El borde probado es el cruce de
    medianoche: entre las 00:00 y las 04:00 UTC el día operativo sigue siendo
    el anterior.
  - **Δ exacta sin float**: `restarDecimales` y `porcentajeRelativo` sobre
    enteros escalados con `BigInt` (`lib/decimal.ts`), truncando, nunca
    redondeando; base cero ⇒ `null` y se muestra «—», jamás ∞ ni NaN. La regla
    «decimales como string exacto» pasa a aplicar también al CÁLCULO, no solo
    al formateo.
  - **Una pasada por moneda SIN filtro de indicador**: es la excepción legítima
    a la regla «filtra siempre» del histórico — con una ventana de un día, el
    formato largo trae las ~23 series de una vez en lugar de ~23 requests. El
    filtro de `currency` sí es obligatorio (si no, se paginan las 5 monedas BCV
    para dibujar una).
  - **Color = lado del mercado y nada más** (azul compra / naranja venta / aqua
    sin lado), coherente con `DepthChart`; el signo de la Δ va en glifo ▲▼●
    más texto, nunca en color solo, y el número siempre en tinta. Slots 1/2/3
    revalidados **all-pairs** en claro y oscuro con el validador del skill
    dataviz (small multiples usan la lista completa de pares, que topa en tres
    slots); el aqua queda en 2,74:1 sobre superficie clara, de ahí que cada
    panel lleve etiqueta y valor visibles (regla de relieve). Token nuevo
    `--series-aqua`.
  - Un indicador que el motor añada en el futuro aparece solo en la parrilla,
    con su nombre canónico: el catálogo de etiquetas no es lista blanca.
  - **35 tests nuevos** (suite del SPA: 65 → **100**, 85,7 % de ramas) y
    maquetación revisada en claro y oscuro con una previsualización estática
    del CSS real.

- **CORS por allowlist en el api-gateway** (2026-07-27, parte de ADR-0017): env
  `ALLOWED_ORIGINS` (default: SPA en dev 5173 y nginx 8080), solo `GET`, header
  `Authorization`, sin credentials, `expose_headers` de `X-RateLimit-*` y
  `Retry-After`; los errores RFC 7807 también llevan las cabeceras (sin ellas el
  browser oculta el error real). **5 tests nuevos** (`tests/unit/test_cors.py`,
  suite del gateway en 83) y verificación en vivo: origen permitido con ACAO,
  origen ajeno sin ACAO.

### Fixed

- **El plan de pruebas daba por cubierta una métrica que no existía
  (2026-07-29)** — desde el corte 0.3.0 listaba «variación intradía (apertura
  VET)» entre los casos `[U]` cubiertos del `indicator-engine`, pero no hay
  ningún cálculo de apertura en el motor (ni en `domain/calculos.py` ni en sus
  tests); `knowledge/metrics/index.md` sí la marcaba correctamente como
  pendiente. Corregido el plan y anotado dónde vive ahora el cálculo (cliente,
  `web-spa/src/lib/intradia.ts`) y qué seguiría pendiente para persistirla como
  indicador del motor (`calc_version` nuevo).

- **Recargar la página mandaba a Universal Login visible en cada F5 (visto en
  vivo, 2026-07-28)** — la versión inicial deshabilitaba el fallback de iframe
  del SDK y la app del tenant no tenía **Allowed Web Origins** (el flag
  `--origins` del CLI configura `allowed_origins`, no `web_origins`).
  Corrección: `useRefreshTokensFallback: true` (re-autenticación silenciosa
  `prompt=none` con la cookie de sesión SSO — T12 intacto: nada toca storage) +
  `web_origins` de la app SPA con los dos orígenes de dev. ADR-0017 enmendada
  (decisión 3 y alternativa descartada).

- **429 al cambiar intervalos del histórico (visto en vivo, 2026-07-27)** — el
  contrato de `/indicators/history` no tenía filtro por indicador, así que el
  SPA paginaba el **formato largo completo** (todos los indicadores/monedas) y
  filtraba en cliente: con bucket `5m` × 90 días eso son cientos de miles de
  filas → 1.400+ páginas → cuota de 120 req/min fulminada. Corrección
  contract-first: **nuevos parámetros `indicator` y `currency` (sin default) en
  `/indicators/history`** (OpenAPI + gateway con filtro en SQL + 2 tests; suite
  en 85), el SPA filtra SIEMPRE en servidor (los `p2p_*` bajo VES;
  `official_rate*` bajo la moneda BCV elegida), reintento único ante 429
  respetando `Retry-After` en la paginación, y el bucket `5m` queda limitado a
  rangos ≤ 7 días en la UI (26k buckets en 90 días no son ni graficables).
- **Tokens recién emitidos rechazados por drift de reloj del contenedor**
  («The token is not yet valid (iat)», visto en el primer e2e con token real):
  leeway estándar de 30 s en la validación JWKS del gateway.
- **403 con cuenta sin rol (RBAC estricto)**: la primera sesión real entró con
  Google sin rol asignado → token sin `permissions` → 403 en REST y 4403 en WSS
  (comportamiento diseñado). Se asignó `operator` a la cuenta del owner, se
  creó el usuario de prueba `test@vesmarketwatch.local` (rol `viewer`) y se
  habilitó la conexión de base de datos para la app SPA (venía con 0 clients).

### Security

- **T12 pasa de control declarativo externo a implementación verificada en el
  repo** (tokens en memoria + rotation + CSP; checklist en DevTools) y nueva
  **T15** «origen web no autorizado consume la API» mitigada por la allowlist
  CORS — fila STRIDE del browser añadida; **DREAD de T15 pendiente de
  ratificación HITL**. El WSS queda fuera de CORS por diseño del browser (el
  token explícito mitiga CSWSH); validar `Origin` en el handshake anotado como
  hardening futuro.

## [0.4.0] - 2026-07-26

Cierre de la fase de implementación de servicios: el `api-gateway` (quinto y último)
tiene código, 78 tests y verificación en vivo. **Los 5 servicios están implementados
y el pipeline completo fuente → bus → indicadores/señales → REST/WSS queda
operativo.** Corte minor por funcionalidad nueva (convención del proyecto). Al corte
se sincronizan a 0.4.0 los artefactos con contenido nuevo del ciclo (ADR-0016,
design/OpenAPI/AsyncAPI del gateway, api-contracts, threat-model, plan de pruebas).

### Added

- **`api-gateway` implementado — quinto y último servicio; el pipeline completo
  fuente → bus → indicadores/señales → REST/WSS queda operativo** (2026-07-26,
  **ADR-0016** *accepted*):
  - **Resource Server OIDC** (ADR-0012): valida access tokens de Auth0 — RS256 vía
    JWKS con cache por `kid` y refresco acotado (≥ 60 s entre fetches); exige
    `aud` = API e `iss` = tenant, rechaza ID tokens, audiencias ajenas, alg ≠ RS256
    y kid desconocido con 401 genérico (el motivo solo va al log — T11); autoriza
    por el claim `permissions` (RBAC `access_token_authz`, fallback `scope`).
  - **REST `/api/v1`** (FastAPI, hexagonal): los 8 endpoints del contrato — tasa
    oficial current/history (una fila por `value_date`, estado `valid`, bandera
    `stale` por ADR-0007), referencia P2P por lado (confianza `low` > 30 %
    outliers), indicadores current (brecha lado buy + `spread_pct` + volúmenes,
    con frescura ≤ `P2P_FRESCURA_MIN`: dato rancio → 404, nunca «vigente» falso),
    histórico de indicadores agregado por `time_bucket` (5m/1h/1d, `last()`),
    profundidad por bandas de 0,5 % proyectada del último crudo minimizado
    (interim hasta `p2p_top_of_book` — ADR-0016), señales con evidencia y health
    público por componente. Errores RFC 7807, paginación obligatoria (rango > 90
    días → 422), rate limit por token (ventana fija 60 s, `X-RateLimit-*`, 429 +
    `Retry-After`), decimales siempre string exacto.
  - **WSS `/ws/v1?token=…`**: whitelist de tópicos, ≤ 5 conexiones y ≤ 10
    suscripciones por `sub`, ping 30 s, cierres 4401/4403/1008 (incl. cierre
    programado al expirar el token en sesión), token de la query redactado en los
    access logs. **Push = payload canónico del evento del bus** validado contra
    `schemas/` en el sobre `{topic, event_id, occurred_at, data}`, consumido con
    **cola AMQP efímera** (exclusiva/auto-delete — el estado se repone por REST;
    ADR-0016). Si el broker falta al arrancar, REST sirve y `/health` reporta
    `degraded`.
  - **DB de solo lectura reforzada**: pool asyncpg con
    `default_transaction_read_only=on` (un INSERT inyectado falla en el servidor —
    T9, verificado por test).
  - **Contrato AsyncAPI 3.0 del WSS** (`apps/api-gateway/docs/asyncapi.yaml`) —
    cierra el TODO de fase 03; los payloads referencian los JSON Schema canónicos
    de `schemas/` (sin duplicar contratos).
  - **78 tests** (unit: dominio + validador con par RSA/JWKS local propio ·
    contract: cada respuesta y error validado contra el `openapi.yaml` ·
    integration: TimescaleDB y RabbitMQ reales, incl. rechazo de escritura y
    descarte de evento inválido · e2e: REST autenticado + `signals.emitted`
    publicado en el bus → frame por el WSS suscrito). Suite completa en verde.
  - **Verificado en vivo** en el compose raíz (nuevo servicio, puerto host
    **8800** — el 8000 lo ocupa otro proyecto local): `/api/v1/health` →
    `{"status":"ok","components":{"database":"ok","broker":"ok","auth":"ok"}}`
    contra la plataforma corriendo y el tenant Auth0 real; sin token → 401
    `problem+json` del contrato.
  - Docs sincronizados: design/README/tests-README del servicio, `api-contracts.md`
    (WSS formal + consumidores reales), threat model (trazabilidad T4/T9/T11 con
    la verificación ya cubierta), knowledge (ficha, índices, 4 eventos con el
    gateway como consumidor, log) y plan de pruebas (§5.4 con cobertura real).
  - **Pendiente (HITL)**: app SPA del tenant + client M2M de prueba para el e2e
    autenticado en vivo con token real; MFA cuando haya usuarios reales.

### Changed

- **OpenAPI del gateway ajustada al implementarse (contract-first)**: parámetro
  `currency` opcional (default USD) en tasa oficial current/history, respuesta
  404 (`NotFound`, problem+json) en los endpoints «current» sin datos frescos, y
  el schema `Indicators` refleja la microestructura real del engine —
  `spread_pct` (BUY↔SELL, ADR-0014) reemplaza a `spread_buy`/`spread_sell`, que
  no existen como indicadores; la brecha servida se documenta como lado buy.
- **Puntuación DREAD de T13–T14 ratificada (HITL 2026-07-26, Jeremi Alcalá)** — se
  retira la marca «pendiente de ratificación» del threat model y del gate 1; los
  scores propuestos en la adenda (T13 = 11, T14 = 9) quedan como definitivos. Con
  esto se cierra el único pendiente humano del barrido 0.3.1.

## [0.3.1] - 2026-07-26

Corte de mantenimiento documental (patch, sin cambios funcionales): barrido de
coherencia post-0.3.0 en tres ejes — cabeceras/versiones, docs↔código y trazabilidad
cruzada (~30 hallazgos corregidos en 47 archivos). Al corte se sincronizan a 0.3.1 los
campos `Versión` de los artefactos con cambios de contenido en este ciclo.

### Added

- **`apps/ingestor-historico/docs/design.md`** (2026-07-26) — el quinto servicio era el
  único sin documento de diseño (la entrada 0.3.0 hablaba de «los 4 `design.md`»):
  capas hexagonales, propiedades (idempotencia por PK+hash, sin bus por ADR-0013,
  entrada no confiable validada), verificación (39 tests, carga real 1.064 filas) y
  pendientes.
- **Threat model ampliado** (adenda 2026-07-26, post-aprobación del Gate 1): alcance a
  5 servicios; `ingestor-historico` incorporado al DFD y a la tabla STRIDE; dos
  amenazas nuevas — **T13** (ruleset de señales manipulado → señales arbitrarias;
  controles de ADR-0015/ASVS V14) y **T14** (export CSV malicioso envenena el
  histórico; controles de ADR-0013) — con filas de control/verificación. **La
  puntuación DREAD de T13–T14 queda pendiente de ratificación HITL.** T2 y T10
  actualizadas con la verificación ya realizada (fase 2 y e2e de señales).
- **Cabecera de metadatos y tabla «Trazabilidad tag ↔ versión ↔ decisión» restauradas
  en `repo-history.md`**: existían en 0.2.0 (generador del skill) y se perdieron al
  migrar a `scripts/gitgraph_branches.py`; el generador ahora las emite siempre
  (constante `TAG_NOTES` a actualizar por corte; fecha por commit taggeado, no por
  creación del tag). v0.3.0 queda trazado a ADR-0013…0015. Regenerado: la rama
  `develop` vuelve a aparecer con su lane y punta real.

### Changed

- **Barrido de coherencia documental post-0.3.0** (2026-07-26) — auditoría de tres ejes
  (cabeceras/versiones · docs↔código · trazabilidad cruzada, ~30 hallazgos) y
  corrección completa:
  - **Restos pre-señales eliminados** (docs que aún negaban el corte 0.3.0): README
    raíz (motor de señales visible, estado real de 4+1 servicios, CLIs reales por
    servicio), `plan-de-pruebas.md` (5 servicios, alcance T1–T12, engine con 77 tests
    y casos de señales marcados como cubiertos, riesgo «`signal.v1` sin definir»
    resuelto), índices de `knowledge/` (index congelado en 07-05, services, metrics,
    events) y fichas (bcv 54 tests, binance 48 + nota top-200 en dev, api-gateway con
    tenant y OpenAPI como hechos), `$comment` de `schemas/signal.v1.json`, cabecera del
    `openapi.yaml`, TODO del AsyncAPI en el design del gateway (ya sin bloqueos),
    `tests/README.md` del engine y pendientes del design de binance.
  - **C4 sincronizados** (context/container → 0.3.0): `ingestor-historico` como quinto
    contenedor con el sistema previo (exports CSV) como sistema externo y su trust
    boundary; descripción del engine con el ruleset (ADR-0015). Contexto DDD «Ingesta
    Histórica» añadido en `architecture.md`.
  - **Atribución de ADR corregida en el código de señales**: `002_signals.sql` y
    `domain/reglas.py` citaban ADR-0014 (justo la que *difiere* las señales) en vez de
    ADR-0015. ADR-0015 referencia ahora explícitamente el aplazamiento de ADR-0014 §6
    que cierra; ADR-0014 lleva nota de superación (decisión 6 y consecuencia).
  - **Gate 1 sin contradicciones internas**: corpus ADR-0001…0015 (citaba 0001…0012),
    schemas «4 de 4» (una fila decía 3 de 4), STRIDE con 8 componentes.
  - **Cabeceras**: campo `Versión` añadido a la plantilla de ADR y a las 15 ADRs
    (asignado mecánicamente por rango de tags con git); ADR-0013 a fase
    03-implementation (divergía de 0014/0015); Estado de `api-contracts.md` refleja la
    OpenAPI hecha (decía «REST/WSS esqueleto»); `api-gateway/docs/design.md` a fase 03
    y fecha real; payload WSS de señales alineado al contrato.
  - **OpenAPI del gateway a 0.3.0**: schema `Signal` alineado de verdad con
    `signal.v1` — añade `currency`, `as_of` y `triggered_by` (requeridos en el evento
    y presentes en la tabla; relevante porque el cooldown es por `type`/`currency`) y
    documenta `emitted_at` como columna de la tabla (`occurred_at` en el sobre).

### Fixed

- **Versiones imposibles o desincronizadas en cabeceras**: `ingesta-historica.md`
  0.2.0 → 0.3.0 (el doc nació dentro del ciclo 0.3.0 — la nota del corte 0.3.0 que
  justificaba 0.2.0 partía de una premisa errónea: el archivo no existía en v0.2.0 y
  `0.1.1` nunca fue una versión publicada) y `design.md` de ingestor-bcv 0.2.0 → 0.3.0
  (fechado 2026-07-14, posterior al corte 0.2.0); `design.md` de ingestor-binance y
  plan de pruebas tenían el mismo error y, al recibir además contenido nuevo en este
  ciclo, quedan en 0.3.1 con el corte.

## [0.3.0] - 2026-07-26

Cierre funcional del pipeline de datos: el `indicator-engine` calcula la microestructura
P2P por ingesta (fase 2, ADR-0014) y **emite señales operables** (`signals.emitted`,
RF-4/RF-5 satisfechos y verificados e2e, ADR-0015). Además: quinto servicio
`ingestor-historico` (ADR-0013), arranque de la fase 03 del api-gateway (tenant Auth0
aprovisionado + spec OpenAPI 3.1) y evidencia diagramática de los tres ejes completada.
Corte por hito funcional (convención: minor = nueva funcionalidad). El api-gateway aún
no consume los eventos — es el único servicio sin código.

### Added

- **Motor de reglas de señales (RF-4) — `signals.emitted` ya se emite** (indicator-engine,
  2026-07-22, **ADR-0015**): ruleset versionado en repo (`config/senales.v1.yaml`, umbrales
  del backtest aprobados HITL) que evalúa la microestructura vigente y emite `signals.emitted`
  (`signal.v1`) con evidencia (regla + insumos). Decisiones: config YAML versionada no
  editable en runtime (ASVS V14); evaluación por nivel + dedup por **cooldown** (60 min/tipo,
  por `as_of`) en vez de edge-triggering; vista de indicadores vigentes = lote + histórico
  fresco (≤ `SIGNALS_MAX_AGE_MIN`); nunca bajo `confianza_baja`. Tres tipos v1
  (`arranque_alcista`, `techo_inminente`, `correccion_inminente`). Persistencia con evidencia
  JSONB en la nueva hypertable `signals` (migración 002, montada en el compose). 77 tests
  (unit de reglas, wiring, cooldown, confianza, contrato del productor, integración de
  persistencia); **verificado e2e en vivo**: snapshot → `correccion_inminente` en el bus
  RabbitMQ y en la tabla. Con esto **RF-4 y RF-5 quedan satisfechos y verificados**; el
  api-gateway aún no consume el evento. Docs sincronizados (PRD, gates, architecture,
  api-contracts, knowledge de servicio/evento/tabla, OpenAPI del gateway).

- **Contrato `signal.v1` del evento `signals.emitted`** (`schemas/signal.v1.json`,
  2026-07-20) — cuarto y último schema de eventos, con el sobre estándar del repo y payload
  `{type, direction, currency, as_of, calc_version, triggered_by, evidence: {rule, inputs}}`.
  `type` es de vocabulario abierto por convención (catálogo canónico en
  `knowledge/metrics/microestructura-p2p.md`), `direction` ∈ {alcista, bajista, neutral},
  `evidence` fija regla versionada + mapa indicador→valor para trazabilidad/reproducibilidad
  (T10, A09). Contract test de forma (9 casos: ejemplo canónico + variantes inválidas) en
  `apps/indicator-engine/tests/contract/test_signal_event_schema.py`. **Solo el contrato:**
  el evento aún **no se emite** — falta el motor de reglas (RF-4) y la calibración HITL de
  umbrales. Desbloquea la spec AsyncAPI del canal WSS del gateway. Docs sincronizados
  (`signals-emitted.md`, `events/index.md`, `api-contracts.md`, `gate-1`, OpenAPI del gateway).

- **ADR-0014 — cálculo y publicación de la microestructura P2P** (2026-07-20, *accepted*):
  registra las decisiones de diseño de la fase 2 del engine que faltaban en el corpus de
  ADRs: reutilizar `indicators.updated` (sin evento nuevo), formato largo con el lado en el
  nombre del indicador, ventanas móviles sobre el propio histórico vía repositorio (sin
  estado en memoria; omitidas ante huecos de captura), cruce entre lados con frescura del
  opuesto (≤ 15 min), supresión con rastro bajo `confianza_baja`, y el **aplazamiento
  explícito** de `signals.emitted`/`signal.v1` a una fase de señales propia.

- **indicator-engine fase 2: indicadores P2P por ingesta** (2026-07-20) — el motor ahora
  consume `p2p.snapshot` (binding nuevo en la cola durable, despacho por `event_type`) y
  por cada snapshot publica: referencia del lado (`p2p_mediana`, `p2p_vwap`,
  `p2p_mejor_precio`, `p2p_liquidez`, `p2p_merchants_pct`, `p2p_outliers_pct` con sufijo
  `_buy`/`_sell`), brecha BCV↔P2P as-of (`p2p_brecha_abs/pct_{lado}`, ADR-0009) y la
  microestructura de señal: `p2p_spread_pct`, `p2p_ratio_oferta_demanda` (lado opuesto
  fresco ≤ 15 min), `p2p_momentum_bid_3h_pct` y `p2p_drenaje_oferta_6h_pct` (ventanas
  móviles vía `indicador_asof`; omitidas ante huecos de captura). Confianza baja
  (> 30 % outliers) suprime señales dejando rastro en `p2p_outliers_pct`. Umbrales de
  señal derivados del backtest 11–20 jul en `knowledge/metrics/microestructura-p2p.md`
  (nuevo). 27 tests nuevos (unit + contrato); suite completa 49 en verde.

- **Spec OpenAPI 3.1 del api-gateway** (`apps/api-gateway/docs/openapi.yaml`, 2026-07-17) —
  segundo paso de la fase 03 del api-gateway: contrato REST formal generado desde la sección
  REST de `docs/02-design/api-contracts.md` y ADR-0012. Cubre los 8 endpoints `/api/v1`
  (tasa oficial current/history, P2P current, indicadores current/history, profundidad,
  señales, health), con esquema de seguridad OAuth2 `authorizationCode` apuntando al tenant
  Auth0 y los 5 scopes/permisos por operación (`/health` público). Refleja las convenciones
  del repo: decimales como string (nunca float), paginación obligatoria en históricos con
  rango máx. 90 días (422), errores RFC 7807 (`application/problem+json`) y cabeceras
  `X-RateLimit-*`. Validada con `openapi-spec-validator` (VALID OpenAPI 3.1). Marcados como
  preliminares los campos que dependen de la fase 2 del engine (brecha/spreads/volúmenes
  `null`, vocabulario de `type`/`direction` de señales pendiente de `signal.v1`). Queda como
  TODO la spec AsyncAPI del canal WSS `/ws/v1` y la app SPA del tenant.

- **Tenant Auth0 de desarrollo aprovisionado** (`dev-higerotech.us.auth0.com`, 2026-07-14) —
  primer paso de la fase 03 del api-gateway (ADR-0012): API `VES Market Watch API`
  (audience `https://api.vesmarketwatch/`, RS256, access token 900 s, sin offline access)
  con los 5 permisos del contrato; RBAC activado (`enforce_policies` +
  `token_dialect: access_token_authz`); roles `viewer` y `operator` con los 5 permisos
  (el diferenciador de `operator` será el permiso admin HITL cuando exista, ADR-0007);
  attack protection habilitada (brute-force 10 intentos + notificación, breached-password
  con bloqueo y aviso inmediato, suspicious-IP throttling). Valores de config del gateway
  documentados en `apps/api-gateway/docs/design.md`; quedan como TODO la spec
  OpenAPI/AsyncAPI y la app SPA del tenant (junto con el front-end).

- **Evidencia diagramática de los tres ejes completada (auditoría de coherencia AI-DLC,
  2026-07-14)** — los gates 0 y 1 tenían la sustancia en tablas (STRIDE, DREAD, ASVS) pero
  solo 3 diagramas Mermaid en todo el repo; se generaron los 9 faltantes, inline en su doc:
  - Gate 0: `mindmap` de alcance (charter), `journey` del consumo autenticado
    (PRD api-streaming), `requirementDiagram` RF↔ASVS↔tests con RF-4 visiblemente sin
    verificar — fase 2 pendiente (PRD motor-indicadores).
  - Gate 1: DFD propio con trust boundaries y `quadrantChart` DREAD T1–T12 derivado de la
    tabla (threat-model); `sequenceDiagram` del flujo crítico con bifurcación HITL,
    `stateDiagram-v2` de `TasaOficial` (ADR-0007), `erDiagram` del dominio y `classDiagram`
    hexagonal del engine con nombres reales del código (architecture.md).

- **`ingestor-historico` — quinto servicio: backfill de históricos de precio**
  (PRD `ingesta-historica.md` **approved — HITL 2026-07-11**, **ADR-0013 accepted**):
  - Proceso **batch por demanda** (CLI `cargar`/`stats`), hexagonal, que carga los
    exports CSV del sistema previo (promedio ponderado del top-100 combinado con el
    detalle de 3 bancos principales, cada ~10 min) en la nueva hypertable
    `historical_market_snapshots`. **Sin publicación al bus** (ADR-0013): inyectar
    pasado en `market.events` dispararía el pipeline reactivo como si fuera presente.
  - Parseo **adaptativo** (RF-2): detección de columnas por heurística (nombres +
    fila de muestra), mapas por banco `{:Banco valor (anotación)}` con bancos
    dinámicos, números con separador de miles, fechas inglesas o ISO y fallback de
    fecha desde el ObjectId; columnas no reconocidas se preservan crudas (JSONB).
    Archivo sin columna de precio → rechazo completo con mensaje accionable; fila
    corrupta → descarte contado por motivo, sin abortar.
  - Idempotencia por PK `(captured_at, source_id)` + `ON CONFLICT DO NOTHING`
    (histórico inmutable); sin columna ID, hash determinista del contenido.
    Anotaciones de la fuente preservadas por banco (`low_liquidity`, `available`).
  - **Varianza histórica** (RF-4): media, varianza muestral, desviación, min/max y
    log-retornos del precio base y por banco; filtro por rango, agrupación por día
    de mercado (zona configurable, default UTC−4) y salida JSON.
  - Migración `001_historical_snapshots.sql` montada en el compose; 39 tests
    (unit + integración contra TimescaleDB real).
  - Verificación en vivo con el export real (1.064 filas, 2025-12-02 → 2025-12-11):
    carga completa sin descartes, recarga idempotente (0/1.064) y varianza calculada
    (precio base: media 417.03, σ² 65.32, σ 8.08; por banco incluida).
- Knowledge base sincronizado: `services/ingestor-historico.md`,
  `tables/historical_market_snapshots.md`, índices y `log.md`.
- **`scripts/gitgraph_branches.py`** — generador multi-rama del historial vivo
  (fase 03): mapea el estado actual de varias ramas (`main`, `develop`,
  `feat-ai-dlc`) con sus forks reales, tabla de puntas por rama y bitácora en UTF-8,
  complementando al generador de una sola rama del skill AI-DLC.
  `docs/03-implementation/repo-history.md` regenerado con el mapa de ramas
  (develop bifurca de main en `bd9698b`; feat-ai-dlc de develop en `ac47922`).

### Changed

- **indicator-engine en modo reactivo continuo en el compose de dev** (2026-07-20) — se
  elimina el bucle `--drain` cada 5 min: con fase 2 los indicadores se recalculan al
  ritmo de la ingesta (2 snapshots/min + tasas BCV), que es el propósito del motor.

- **Barrido de coherencia documental e2e** (2026-07-20) — auditoría de docs de proyecto y
  diseño contra el estado real del código tras la fase 2. Corregida la deriva raíz de tratar
  «fase 2 del engine» como «P2P + señales»: el código las separó (P2P/microestructura
  entregado, señales diferido). Actualizados `motor-indicadores.md` (cabecera y caption de
  trazabilidad), `knowledge/services/indicator-engine.md` (fase 2 implementada, 49 tests,
  pendiente = solo señales), `gate-0` (4 → 5 PRDs), `gate-1`, `api-contracts.md` y el caption
  de `architecture.md`. Sin cambios: charter, glossary, data-classification, api-streaming,
  `knowledge/events/signals-emitted.md` (sigue correcto: «diseñado, sin implementar»).

- `architecture.md`: el «Flujo de datos» en ASCII se reemplazó por el `sequenceDiagram`
  del flujo crítico (eje comportamiento, renderizable); el DFD con trust boundaries vive
  ahora en `threat-model.md` (antes solo remitía al C4 Container).

### Fixed

- **`docker-compose.yml`: `restart: unless-stopped` en rabbitmq y timescaledb**
  (2026-07-26) — un reinicio del daemon de Docker dejaba la infraestructura caída
  mientras los tres servicios (que sí reinician) quedaban en crash-loop
  (visto 2026-07-23).

- **Publisher de `indicators.updated`: valores siempre en punto fijo** (2026-07-20) —
  `str(Decimal)` puede emitir notación científica, que viola el patrón
  `^-?[0-9]+(\.[0-9]+)?$` del contrato; ahora se serializa con `format(v, "f")`.

- Cabecera de metadatos agregada a los 4 `apps/*/docs/design.md` (faltaba por completo)
  y al plan de pruebas (campos Decisores/Versión); `ingesta-historica.md` corrige
  `Versión: 0.1.1` → `0.2.0` (era anterior al corte pese a aprobarse con él, contra la
  regla de sincronía versión↔changelog de la metodología).

## [0.2.0] - 2026-07-11

Cierre de los Gates 0 (requisitos) y 1 (diseño) con aprobación humana, más la fase 03
adelantada: tres de los cuatro servicios implementados y verificados en vivo
(`ingestor-bcv`, `indicator-engine` fase 1, `ingestor-binance`). Corte según la
convención AI-DLC (Gate 1 → 0.2.0).

### Added

- **Documentación viva de fase 03**: `docs/03-implementation/repo-history.md` con el
  `gitGraph` y la bitácora derivados del historial real (`gitgraph_from_log.py`) y la
  tabla de trazabilidad tag ↔ versión ↔ ADR. Pendiente: taggear `v0.2.0` sobre el merge
  a `main`.

- **Gates 0 (requisitos) y 1 (diseño) cerrados (HITL, 2026-07-11)** — aprobación humana
  registrada en `.ai-dlc/gates/`. La aprobación cubre la versión de requisitos actualizada
  por ADR-0012; residuales no-bloqueantes en seguimiento (nombrar consumidores concretos,
  ratificación del marco legal). **ADR-0010 (OKF) promovida de `proposed` a `accepted`.**

- **ADR-0012 (accepted): autenticación OIDC con Auth0** (Authorization Code + PKCE) para
  **usuarios humanos**; **supersede a ADR-0003**. El api-gateway pasa de Authorization Server
  a **Resource Server**: valida access tokens de Auth0 (RS256 vía JWKS; `iss`/`aud`/`exp`) y
  ya no emite tokens ni almacena credenciales.
  - Se retiran del gateway la tabla `api_clients`, los secrets de cliente (argon2id) y las
    claves de firma JWT: identidad y credenciales viven ahora en Auth0.
  - Nuevas amenazas T11 (ID token / audiencia ajena usada como bearer) y T12 (robo de token
    en el navegador vía XSS del SPA).
  - Diseño actualizado en cascada: PRD `api-streaming`, `api-contracts.md`, `threat-model.md`,
    `architecture.md`, C4 context/container, `data-classification.md` (PII de usuarios en
    Auth0), `glossary.md`, `charter.md`, plan de pruebas y knowledge base. Sin código aún.

- **Implementación de ADR-0011 en `ingestor-binance`** — cierre del motor de ingesta P2P:
  - `Pseudonimizador` en el dominio: `merchant_ref = HMAC-SHA256(MERCHANT_HMAC_KEY,
    advertiser.userNo)` truncado a 128 bits (32 hex); nunca sobre el alias (rompería
    la correlación). Sin identificador estable → `null`.
  - `merchant_ref` viaja en cada anuncio de `p2p.snapshot` (contrato **v1.1 aditivo**:
    campo requerido en `schemas/p2p-snapshot.v1.json`; el `schema_version` del sobre
    sigue en 1) y se persiste en el crudo minimizado — el alias e ID crudos siguen
    sin tocar disco ni bus.
  - `MERCHANT_HMAC_KEY` requerida con fail fast al arrancar (dev: `openssl rand -hex 32`);
    clave débil (< 16 bytes) rechazada al construir.
  - +7 tests (determinismo del HMAC, correlación por anunciante, alias no altera el
    pseudónimo, contrato v1.1 rechaza anuncios sin `merchant_ref`, e2e con refs en DB
    y eventos): suite del servicio en 48.
  - Verificación en vivo con dos corridas y la misma clave: 96 anunciantes únicos por
    snapshot (100 anuncios — la dedup que motiva el ADR ya es visible) y 88
    correlacionados entre corridas; cero alias en disco.
- ADR-0011 (accepted): pseudonimización HMAC-SHA256 del identificador de anunciantes P2P
  (`merchant_ref`, clave dedicada `MERCHANT_HMAC_KEY` en secret store, sin rotación
  programada). Cierra el `<TODO>` de `data-classification.md`: historia analítica
  (dedup de profundidad, concentración, recurrencia, forense) sin alias ni ID crudos en
  disco. Implementación pendiente en `ingestor-binance` (contrato p2p-snapshot v1.1).
  PRD de ingesta P2P y clasificación de datos actualizados.

- **Bundle de contexto en Open Knowledge Format (OKF v0.1)** en `knowledge/` (ADR-0010):
  conceptos tipados con frontmatter YAML para servicios, eventos AMQP, tablas y métricas,
  con estado de implementación y grafo de links a PRDs/ADRs/migraciones; `index.md` de
  navegación y `log.md` de historia del contexto. Punto de entrada para agentes y humanos
  al retomar el proyecto.
- ADR-0010 (proposed): adopción de OKF para mantener el contexto del proyecto.

- **`ingestor-bcv` — primera implementación ejecutable del proyecto** (PRD ingesta BCV):
  paquete Python 3.12 (`apps/ingestor-bcv/`) con arquitectura hexagonal:
  - Dominio: `TasaOficial` con estados `valid|suspect|stale` y validación de
    plausibilidad (|Δ| ≤ 20 % configurable, valor positivo, fecha-valor no retrocede).
  - Caso de uso `SincronizarTasasOficiales`: fetch → validar → persistir siempre →
    publicar `official.rate.updated` solo en cambio de valor o fecha-valor (RF-1..RF-5).
  - Adaptador BCV: cliente httpx con TLS anclado a bundle de CA versionado
    (`certs/bcv-ca-bundle.pem`, cadena Sectigo verificada — ADR-0006, nunca
    `verify=False`) y parser con selectores CSS + fallback regex.
  - Adaptador RabbitMQ (aio-pika): exchange topic `market.events`, publisher confirms,
    mensajes persistentes, sobre estándar con `event_id`/`schema_version` (ADR-0004).
  - Adaptador TimescaleDB (asyncpg) con queries parametrizadas y migración
    `db/migrations/001_official_rates.sql` (hypertable `official_rates` +
    `official_rate_source_health`).
  - Circuito de fallos: 3 fallos consecutivos de la fuente → alerta + marca `stale`.
  - Scheduler 2×/hora con jitter; CLI `python -m ingestor_bcv [--once] [--dry-run]`.
  - 28 tests (unit + contract) contra fixture de HTML real del BCV; verificación
    end-to-end en dry-run contra el sitio vivo (5 monedas publicadas).
- Bundle de CA del BCV capturado y verificado (`openssl verify: OK`) con procedimiento
  de regeneración documentado en `apps/ingestor-bcv/certs/README.md`.
- Fixture de página real de bcv.org.ve (capturada 2026-07-05, fecha-valor 2026-07-06)
  en `apps/ingestor-bcv/tests/fixtures/`.
- **Tests de integración y e2e contra infraestructura real** (`ingestor-bcv`):
  - `docker-compose.yml` en la raíz del repo con RabbitMQ 4 (management) y
    TimescaleDB pg16 (publicada en el puerto 5433: el 5432 suele estar ocupado por
    un PostgreSQL local/WSL), healthchecks y la migración del ingestor montada en
    el init de la DB sin aplastar el init propio de la imagen.
  - `tests/integration/`: repositorio contra TimescaleDB real (round-trip con
    fidelidad de tipos, `suspect` no contamina la referencia, contador de fallos,
    `stale_since` idempotente, ON CONFLICT), publisher contra RabbitMQ real
    (consumo del mensaje íntegro, confirms, reconexión perezosa) y anclaje TLS
    del cliente contra servidor HTTPS local con CA efímera (trustme): CA no
    anclada rechazada / CA anclada permite fetch+parseo completo.
  - `tests/e2e/`: ciclo completo sitio-mock → caso de uso → RabbitMQ → TimescaleDB
    con cola consumidora (publica 5 monedas, heartbeat sin duplicar eventos,
    tasa disparada queda `suspect` sin publicarse).
  - Fixtures con probe + skip elegante: sin infraestructura levantada la suite
    unit/contract sigue en verde y los tests de infra se saltan con instrucciones.
    Markers `integration`/`e2e` registrados en pyproject; nueva dev-dep `trustme`.
- **Job de re-validación HITL para tasas `suspect`** (`ingestor-bcv`, ADR-0007):
  - Caso de uso `RevalidarTasasSospechosas` y CLI de operador
    `python -m ingestor_bcv revalidar listar|aprobar|rechazar` con nota obligatoria
    y usuario auditables. Aprobar promueve la sospecha más reciente a `valid`, la
    publica como `official.rate.updated` y la convierte en la nueva referencia
    (con guardia si existe una captura válida posterior); rechazar descarta todas
    las pendientes de la moneda.
  - Nuevo estado terminal `rejected` (la «descartada» del ADR) y expiración por
    timeout: sospechas sin revisión humana en `SUSPECT_TTL_HOURS` (default 24)
    expiran a `rejected` con actor `system:timeout` en cada ciclo de sincronización.
  - Migración `002_suspect_resolution.sql`: CHECK de `status` extendido y columnas
    de auditoría `resolved_at`/`resolved_by`/`resolution_note` (montada también en
    el init del compose).
  - +11 tests (unit de revalidación y TTL, integración de resolución con auditoría,
    e2e ampliado a 5 fases con aprobación real vía RabbitMQ): suite en 53.
  - Verificación manual del CLI contra infraestructura real: sospecha sembrada,
    `listar` → `aprobar` → evento consumido de la cola y auditoría en DB.
- **`indicator-engine` fase 1 — primer consumidor de `official.rate.updated`**
  (PRD motor-indicadores, RF-1/RF-2/RF-3/RF-5 parciales):
  - Paquete Python hexagonal (`apps/indicator-engine/`): consumidor AMQP con cola
    durable propia, validación de todo evento contra schema (A05/A08), DLQ
    `market.events.dlq` vía dead-letter-exchange (ADR-0004) e idempotencia por
    `event_id` (tabla `processed_events`, escenario negativo 2).
  - Indicadores fase 1 por moneda: `official_rate` y variación abs/% vs. último
    conocido; fórmula de la brecha BCV↔P2P en el dominio (pura, testeada), lista
    para activarse con la referencia P2P de fase 2.
  - Bandera `official_stale` computada (captura > 6 h, ADR-0007) y `triggered_by`
    con el event_id origen en cada `indicators.updated` (trazabilidad V16).
  - Hypertable `indicators` (formato largo con `calc_version`, reproducibilidad
    RF-3) en migración propia, montada también en el init del compose.
  - CLI `python -m indicator_engine [--drain]`; 26 tests (unit, contract,
    integración con topología AMQP aislada por test, e2e con dos eventos y
    validación del emitido contra su schema).
  - Verificación manual del flujo real entre servicios: `ingestor_bcv --once`
    (sitio BCV vivo) → 5 eventos → engine `--drain` → 5 filas en `indicators` y
    5 `indicators.updated` consumidos de una cola espía.
- **Contratos formales de eventos en `schemas/`** (raíz del repo, como los nombraba
  `api-contracts.md`): `official-rate.v1.json` e `indicators.v1.json` (JSON Schema
  2020-12). Verificados en ambos lados: el ingestor-bcv valida lo que produce
  (nuevo contract test) y el engine valida lo que consume y lo que emite.
- **`ingestor-binance` — última fuente de datos implementada** (PRD ingesta
  Binance P2P, ADR-0005):
  - Spike técnico del endpoint resuelto con datos vivos: HTTP 200 con la forma
    esperada (~643 anuncios USDT/VES); respuestas reales versionadas como fixtures
    y semántica de `tradeType` documentada (perspectiva del taker).
  - Polling educado: User-Agent identificable, presupuesto de requests/min
    (ventana deslizante), backoff exponencial con jitter ante 429/5xx y circuit
    breaker con cooldown/half-open que alerta solo al abrir — nunca rotación de IP.
  - Validación de cada página contra el schema de la fuente
    (`apps/ingestor-binance/schemas/binance-adv-search.response.json`): cambio de
    esquema → descarte + alerta, jamás se publica un snapshot corrupto (A10).
  - Normalización con sanitización de textos (A05) y outliers de precio
    **etiquetados** por MAD (z-score modificado, k=3.5) con fallback para MAD=0 y
    piso de desviación relativa del 2 % — calibrado contra el fixture real, donde
    el MAD puro marcaba dispersión legítima de un mercado agrupado (±0.3 %).
  - Defensas de red: TLS estricto, timeout y tope de bytes por streaming
    (zip-bomb); páginas incompletas → snapshot `partial=true`.
  - Contrato `schemas/p2p-snapshot.v1.json` + hypertable `p2p_snapshots_raw`
    (JSONB crudo, retención nativa 90 días, RF-5) montada en el init del compose.
  - CLI `python -m ingestor_binance [--once] [--dry-run]`; 40 tests con servidor
    HTTP local (paginación, parcial, tope de bytes, schema roto) y e2e contra
    RabbitMQ/TimescaleDB reales.
  - Verificación en vivo: dry-run contra Binance real (100 anuncios/lado) y flujo
    productor→bus con cola espía (2 `p2p.snapshot` + crudos en DB).

### Fixed

- **Minimización de datos en el crudo P2P persistido** (coherencia con
  `docs/00-project/data-classification.md`, que ordena no persistir alias de
  anunciantes): nueva función pura `minimizar_crudo` — del `advertiser` solo se
  conservan `userType` y métricas públicas; alias e identificadores pseudónimos
  (`nickName`, `userNo`, etc.) se redactan antes de tocar disco. Verificado en
  unit y e2e (el crudo en DB no contiene `nickName`). El `<TODO: confirmar>`
  humano de la clasificación sigue abierto.

### Changed

- **Cabeceras de metadatos AI-DLC sincronizadas con el corte 0.2.0** en los artefactos
  aprobados por los gates (charter, glosario, clasificación de datos, 4 PRDs,
  architecture, threat-model, api-contracts, C4 context/container): Estado `approved`
  con referencia al gate y fecha HITL, Decisores, Fase y Versión 0.2.0. El PRD
  `api-streaming` pasa de `review` a `approved` (la aprobación del Gate 0 cubre la
  versión actualizada por ADR-0012).
- **Alcance del PRD de ingesta BCV ampliado a multi-moneda**: se ingestan todas las
  monedas de la sección «tipo de cambio de referencia» (hoy USD, EUR, CNY, TRY, RUB)
  con descubrimiento dinámico de monedas nuevas; antes el objetivo era solo VES/USD.
  PRD `docs/01-requirements/ingesta-bcv.md` actualizado a estado `accepted — implementado`.
- README y `docs/design.md` de `apps/ingestor-bcv` reescritos con la arquitectura
  implementada, instrucciones de ejecución y los TODO de fase 03 resueltos
  (bundle TLS y fixtures de HTML).
- ADR-0007 (máquina de estados valid/suspect/stale) pasa de `proposed` a
  **`accepted`**: se materializa «descartada» como estado `rejected` y se resuelve
  el TODO del mecanismo de aprobación (CLI de operador; endpoint admin autenticado
  llegará con el api-gateway).
- `knowledge/`: `services/ingestor-bcv.md`, `tables/official_rates.md` y `log.md`
  sincronizados con la implementación HITL (pendientes del servicio: ninguno).
- PRD motor-indicadores pasa a `accepted — fase 1 implementada`; sobre estándar de
  eventos unificado en `api-contracts.md` a `occurred_at` (el doc decía `produced_at`,
  el código ya probado publica `occurred_at`).
- `knowledge/` sincronizado con el motor: `services/indicator-engine.md`
  (implementado-parcial), `events/indicators-updated.md` y
  `events/official-rate-updated.md` (consumidor real), nueva `tables/indicators.md`,
  índices y `log.md`.
- PRD ingesta Binance P2P pasa a `accepted — implementado` (RF-6 como logs
  estructurados; export a sistema de métricas queda para fase 05); ADR-0005 con el
  TODO del spike resuelto; `api-contracts.md` sin el TODO del schema p2p-snapshot.
- `knowledge/` sincronizado con el ingestor P2P: `services/ingestor-binance.md` y
  `events/p2p-snapshot.md` (implementados), nueva `tables/p2p_snapshots_raw.md`,
  índices y `log.md`.
- **Auditoría de coherencia docs↔implementación** (alcance completo):
  - ADR-0008 (solo-en-cambio) y ADR-0009 (bitemporal) pasan a **`accepted`** — ya
    estaban implementados por el ingestor-bcv; se anota cómo se materializa el
    heartbeat (ADR-0008) y la excepción auditada del HITL al append-only (ADR-0009).
  - Gate 1 actualizado: ADRs 0007–0009 accepted y pendientes de fase 03 resueltos
    (spike P2P ✔, bundle TLS ✔, schemas 3/4 ✔); siguen abiertos secret store
    (fase 05) y umbrales de señales (HITL).
  - README raíz con estado real (3 servicios implementados y verificados en vivo),
    árbol con `schemas/` y `docker-compose.yml`, y sección de desarrollo.
  - `architecture.md`: tabla de persistencia con nombres reales y estado por tabla
    (5 implementadas / 3 planificadas).
  - Índices del `knowledge/` (servicios, eventos con sobre `occurred_at`, métricas)
    sincronizados; README de tests de indicator-engine e ingestor-binance
    actualizados a lo realmente construido.
- **Verificación de pendientes de los gates abiertos** (Gate 0 y Gate 1):
  - Gate 0: el pendiente de retención de alias de anunciantes queda marcado
    **resuelto** (ADR-0011 implementado); permanecen como decisiones humanas la
    identificación de apps consumidoras y la validación del marco legal (charter).
  - Gate 1: fila de ADRs actualizada a 0001–0011 (0011 accepted e implementada;
    0010 proposed pero implementada de facto); contratos de eventos reconocidos
    como formales (JSON Schema + contract tests en ambos lados, p2p-snapshot v1.1);
    siguen abiertos `signal.v1`/umbrales (engine fase 2) y secret store (fase 05).
  - Threat model: T2 y T10 citan ahora el ADR-0011 (`merchant_ref` habilita
    recurrencia de manipuladores y forense entre snapshots); trazabilidad de T2
    refleja el etiquetado MAD ya verificado en ingestor-binance.
  - `api-contracts.md`: la intro distingue eventos formales (schemas/) del
    esqueleto REST/WSS (OpenAPI llegará con el api-gateway); tabla de eventos
    anota p2p-snapshot v1.1 y `signal.v1` como pendiente.
  - Ambos gates siguen a la espera de la firma humana (líneas «Aprobado por»).

## [0.1.0] - 2026-07-05

Línea base del proyecto (commit inicial `b34c3af`). Fase documental: Gate 0
(requisitos) y Gate 1 (diseño) de la metodología AI-DLC. Sin código ejecutable aún.

### Added

- Estructura de repositorio según el estándar AI-DLC: `.ai-dlc/` (gates y plantillas),
  `docs/` (proyecto, requisitos, diseño, arquitectura) y `apps/` (esqueletos de servicios).
- Metodología AI-DLC:
  - Checklists de Gate 0 (requisitos) y Gate 1 (diseño).
  - Plantillas de PRD, ADR y threat model.
- Documentación de proyecto (`docs/00-project/`):
  - Project charter con visión, alcance, no-scope, métricas de éxito y riesgos.
  - Glosario de términos del dominio cambiario.
  - Clasificación de datos.
- Decisiones de arquitectura (ADRs):
  - ADR-0001: Adopción de la estructura AI-DLC.
  - ADR-0002: Almacenamiento de series de tiempo con PostgreSQL + TimescaleDB.
  - ADR-0003: Autenticación JWT / OAuth2 client credentials para API/WSS.
  - ADR-0004: RabbitMQ como bus de mensajería entre ingesta e indicadores.
  - ADR-0005: Estrategia de ingesta del portal P2P de Binance (VES/USDT).
  - ADR-0006: Scraping del sitio BCV y manejo de sus problemas de TLS.
- Requisitos — PRDs de Gate 0 (`docs/01-requirements/`):
  - Ingesta P2P Binance (VES/USDT).
  - Ingesta de tasa oficial BCV (VES/USD).
  - Motor de indicadores (brecha BCV↔Binance, spreads, volúmenes, tendencias).
  - API REST + streaming WebSocket para consumidores.
- Diseño — Gate 1 (`docs/02-design/` y `docs/architecture/`):
  - Arquitectura general del sistema.
  - Threat model.
  - Contratos de API.
  - Diagramas C4 de contexto y contenedores (Mermaid).
- Esqueletos de los cuatro servicios en `apps/`, cada uno con README, documento de
  diseño y carpeta de tests: `ingestor-binance`, `ingestor-bcv`, `indicator-engine`
  y `api-gateway`.

[Unreleased]: https://github.com/jeremialcala/ves-market-watch/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/jeremialcala/ves-market-watch/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/jeremialcala/ves-market-watch/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/jeremialcala/ves-market-watch/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/jeremialcala/ves-market-watch/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/jeremialcala/ves-market-watch/releases/tag/v0.1.0
