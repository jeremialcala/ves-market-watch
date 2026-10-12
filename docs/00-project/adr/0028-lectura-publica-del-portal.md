# ADR-0028: El portal público lee por `/portal/v1`, no por la API de pago

- **Estado:** accepted
- **Fecha:** 2026-10-04
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 01-requirements
- **Origen:** decisiones D1 (cómo lee el portal) y D2 (cómo se mantiene en
  vivo) de `docs/01-requirements/portal-publico.md`
- **Relacionado:** ADR-0012 (Auth0 como emisor), ADR-0016 (implementación del
  gateway y su limitador), ADR-0017 (CORS por allowlist)
- **Controles OWASP afectados:** A01 (control de acceso: superficie sin token),
  A04 (diseño: límites de consumo), A05 (configuración: proxy de confianza)

## Contexto

El diseño del portal público (`Criterio Público.dc.html`) abre el Dashboard en
vivo a cualquiera, sin cuenta. Hoy no hay ningún dato servido sin token: todo
`/api/v1` exige un Bearer de Auth0 con permisos, y el único endpoint público es
`/health`.

La misma página de Precios vende `/api/v1` como el producto de pago del nivel
Empresa. Si el portal anónimo leyera de `/api/v1`, la API de pago quedaría
abierta a quien quisiera rasparla, y el nivel Empresa no tendría nada que
vender.

El Dashboard del `web-spa` hace hoy unas ocho llamadas para pintarse
(`indicators`, `analysis`, `rates` por lado, `depth` por lado, `signals`,
`history`). Multiplicado por visitantes anónimos, cada visita pagaría en la base
lo que hoy paga un usuario autenticado.

## Decisión

El portal tiene **su propio contrato de lectura**, `/portal/v1/*`, montado como
otro router en el mismo `api-gateway`. Los datos son los mismos que los de
`/api/v1`; el contrato no.

### 1. La forma la dicta la página, no el recurso

- **`GET /portal/v1/snapshot`**: todo lo que el Dashboard muestra «ahora», en
  una sola respuesta. Incluye la lectura de hoy, la brecha, la referencia P2P de
  los dos lados, la tasa oficial, los seis medidores con su escala de 90 días,
  la descomposición de la brecha, la distancia al disparo, la profundidad
  agregada, la cronología de señales de 30 días y la procedencia del dato.
  **La landing de Producto lee de aquí también, entera:** desde el rediseño del
  2026-10-04, su hero y sus cuatro paneles («Lo que el dato demuestra») son
  paneles del Dashboard. Las dos páginas comparten respuesta y caché.
- **`GET /portal/v1/dashboard/series`**: las series del Dashboard con **ventanas
  fijas**: brecha 24 h para el sparkline, mapa de calor de 14 días por hora y
  brecha de 30 días.
- **Sin `from`/`to`, sin paginación, sin `interval` libre.** Los parámetros que
  existan son enumerados (`currency` entre las que se capturan) y cualquier otro
  valor es 422.
- Intradía e Histórico (nivel Comunidad) irán bajo `/portal/v1` cuando se
  decida D3, con el mismo criterio: rangos enumerados (7/30/90 días, buckets
  5 min/15 min/1 h), nunca libres.

Lo que hace a `/api/v1` útil para un sistema —rangos arbitrarios, paginación,
cada serie por separado, push por tópico— es exactamente lo que el portal no
expone. Raspar el snapshot da lo que el Dashboard ya enseña a cualquiera, cada
pocos segundos, y nada más: es la consecuencia aceptada de hacer público el
Dashboard, no una fuga.

### 2. El coste en la base no crece con los visitantes

- **Caché en proceso con *single-flight***: por cada clave, una sola
  computación por TTL aunque lleguen cien peticiones a la vez. Las concurrentes
  esperan el mismo resultado; no hay estampida al caducar.
- **TTL del snapshot: 5 s.** La ingesta P2P publica cada 60 s y el motor
  reacciona a ella, así que 5 s no envejece el dato de forma visible y fija el
  techo de carga en 12 computaciones por minuto, haya uno o mil visitantes.
- **TTL de las series: 60 s.**
- **`Cache-Control: public, max-age=5, stale-while-revalidate=25`** en el
  snapshot (y el equivalente en las series), para que Cloudflare pueda servirlo
  desde el borde. En Cloudflare las respuestas de una API **no se cachean por
  defecto**: hace falta una *Cache Rule* para `/portal/v1/*`. Sin ella el
  sistema funciona igual, solo que sin esa capa.

### 3. Límite por IP, con la IP real

- **Cuota por IP de cliente**, ventana fija de 60 s. Valor inicial:
  **600 peticiones por minuto** —ver la corrección del punto 5: se escribió 60 y
  no aguanta CGNAT—. Responde 429 con `Retry-After` y `X-RateLimit-*`, igual que
  `/api/v1`.
- **La IP real sale de `CF-Connecting-IP`, y solo cuando la petición llega desde
  el proxy de confianza.** Detrás de `cloudflared`, `request.client.host` es la
  IP del conector para todo el mundo: sin esto, la cuota «por IP» sería **un solo
  cubo para todos los visitantes**, y el primero que la agotara dejaría el portal
  en 429 para el resto. Y si la cabecera se aceptara venga de donde venga,
  cualquiera la falsificaría para tener cuota infinita. La lista de proxies de
  confianza (`TRUSTED_PROXIES`) es configuración: la red del conector en el
  compose. Fuera de esa lista se usa `request.client.host` y se ignora la
  cabecera.
- **El limitador poda sus claves.** El de `/api/v1` (`domain/rate_limit.py`) no
  lo hace porque sus claves son tokens, acotados. Con IPs anónimas, el
  diccionario crecería con cada visitante nuevo, sin límite: poda periódica de
  las ventanas vencidas y un tope de claves.
- **Las IPs no salen del proceso.** El limitador las tiene en memoria el tiempo
  de una ventana; no se escriben en logs ni en la base. Una IP es dato personal
  (*Logs de acceso a la API — Confidencial* en la clasificación).

### 4. Un contrato propio, versionado y sin promesas de API

- **Especificación propia** en `apps/api-gateway/docs/portal-openapi.yaml`, de la
  que el portal genera sus tipos (como el `web-spa` hace con la de `/api/v1`).
- **No aparece en el catálogo de APIs del portal** ni en Precios: es el backend
  del portal, no un producto. Puede cambiar con el portal, versionado en `v1`.
- **Mismas convenciones** que `/api/v1`: decimales como cadena, errores RFC
  7807, solo GET, CORS por allowlist (el origen del portal se añade a
  `ALLOWED_ORIGINS`; sin credenciales, así que la configuración global de
  ADR-0017 vale).

### 5. El «en vivo» es sondeo del snapshot, no WebSocket (D2)

El Dashboard se mantiene al día **pidiendo el snapshot cada 10 s**. No hay
WebSocket anónimo.

- **Por qué basta.** El dato cambia como mucho una vez por minuto (la ingesta
  P2P es de 60 s) y el diseño ya habla en esa escala («hace 34 s»). Con TTL de
  5 s y sondeo de 10 s, lo que ve el visitante tiene como mucho 15 s.
- **Por qué no WebSocket.** Una conexión persistente sin autenticar es la
  superficie de DoS más barata del sistema: cada visitante retiene un socket y
  memoria en el gateway aunque no haga nada, y `/ws/v1` está diseñado para
  limitar por usuario, no por IP. El sondeo, en cambio, pasa por la caché y por
  Cloudflare: un visitante más no cuesta nada en la base.
- **El cliente sondea con educación:**
  - se para cuando la pestaña no está visible (Page Visibility API) y pide en
    cuanto vuelve;
  - ante 429 o 5xx retrocede con jitter y respeta `Retry-After`;
  - no reintenta en bucle si el gateway no responde: muestra el dato con su
    edad y el estado «sin conexión».
- **La barra superior cambia de texto.** El diseño dice «WSS conectado» y
  «último evento hace 34 s». Pasa a «En vivo · actualizado hace N s», con la
  edad que trae el snapshot (`as_of`), no la de la última petición: así un
  gateway que responde con datos viejos no se presenta como fresco.
- **El WebSocket sigue siendo de Empresa** (`/ws/v1`, con token). Es parte de
  lo que el nivel de pago compra: push al segundo.

**Corrección a la cuota por IP del punto 3, a la vista del sondeo.** 60
peticiones por minuto alcanzan para un visitante, pero **no para muchos detrás
de la misma IP**. En Venezuela las operadoras móviles usan CGNAT, que pone a
miles de clientes tras unas pocas IPs, y una oficina sale por una sola. Con
sondeo a 10 s, una IP con 10 pestañas abiertas ya consume 60 por minuto. Por
eso:

- **Valor inicial: 600 peticiones por minuto por IP.** Frena a un raspador en
  bucle cerrado, no a una oficina ni a una operadora.
- **La protección de la base es la caché, no la cuota.** La cuota existe para
  acotar a un cliente que se porta mal. Lo que mantiene la carga constante es el
  TTL con *single-flight*, y eso vale haya una IP o diez mil.
- Con la *Cache Rule* de Cloudflare activa, la mayoría de sondeos ni siquiera
  llega al gateway, y la cuota solo ve los fallos de caché.

### 6. Solo campos públicos, por lista explícita

El snapshot se construye **campo a campo, por lista blanca**. No se reenvían
objetos de `/api/v1` enteros. Ningún `merchant_ref`, ningún identificador de
anunciante, ninguna cifra por anunciante: solo agregados.

## Alternativas consideradas

- **Abrir `/api/v1` sin token con límite por IP.** Lo más barato de construir y
  lo que hace inútil el nivel Empresa: es la misma API, gratis. Descartada.
- **Un BFF aparte (servicio nuevo) para el portal.** Separa despliegues, pero
  duplica la conexión a la base, la validación y los contratos, y añade un
  servicio que operar para lo que es un router. Se reconsidera si el portal
  llega a necesitar escalar distinto del gateway.
- **Páginas estáticas regeneradas cada N segundos** (el snapshot como fichero
  JSON en el CDN). Carga cero en la base, pero mete un proceso de publicación
  más y no encaja con Intradía e Histórico, que necesitarán sesión.
- **Llamar a `/api/v1` desde el portal con un token de servicio embebido.** Un
  token en el navegador es un token público: equivale a la primera alternativa.

## Consecuencias

- **Positivas:** la API de pago sigue siendo de pago. La carga de la base queda
  acotada por el TTL, no por el tráfico. El Dashboard pinta con una petición en
  vez de ocho.
- **Negativas / deuda asumida:**
  - **Dos contratos que mantener** sobre los mismos datos. Un cambio en el
    modelo toca `/api/v1` y `/portal/v1`, y sus specs.
  - **El limitador y la caché viven en memoria**: valen para una réplica del
    gateway (como ADR-0016). Con dos o más, la cuota se reparte y la caché se
    duplica; pasan a un almacén compartido.
  - **Reclasificación de datos.** La clasificación pone *Indicadores y señales
    calculadas* y los *agregados P2P* como **Interno**. Publicar el Dashboard
    convierte en **Público** el subconjunto que sirve `/portal/v1`. Queda
    escrito en `docs/00-project/data-classification.md`; no se da por hecho.
- **Vigilancia explícita:** la tasa de 429 en `/portal/v1` (un 429 masivo
  indica que la IP real no está llegando) y el número de claves del limitador.
- **Impacto en threat model:** superficie nueva sin autenticación. Amenazas que
  hay que dar de alta al implementar:
  - DoS sobre el snapshot (mitigado por la caché, *single-flight*, la cuota por
    IP y Cloudflare);
  - suplantación de IP por cabecera (mitigada por `TRUSTED_PROXIES`);
  - divulgación de campos internos (mitigada por la lista blanca);
  - agotamiento de memoria del limitador (mitigado por la poda).

## Verificación

- **Con `TRUSTED_PROXIES` vacío**, una petición con `CF-Connecting-IP`
  falsificada cuenta contra la IP del socket, no contra la de la cabecera.
- **Dos clientes detrás del conector** con `CF-Connecting-IP` distintas tienen
  cuotas independientes; agotar una no da 429 a la otra.
- **N peticiones concurrentes** al snapshot con la caché fría producen
  **una** consulta a la base (*single-flight*).
- **El snapshot no contiene ningún campo fuera de la lista blanca**: test de
  contrato contra `portal-openapi.yaml` con `additionalProperties: false`.
- **El limitador vuelve a su tamaño** tras una ráfaga de IPs distintas y el paso
  de una ventana.
- `GET /portal/v1/snapshot?from=…` → 422: los parámetros libres no existen.
- **Una pestaña oculta no sondea**: test de componente con
  `document.visibilityState = "hidden"` y reloj falso; cero peticiones en 60 s.
- **Ante un 429 con `Retry-After: 30`**, el cliente no vuelve a pedir antes de
  30 s.
- **La barra muestra la edad de `as_of`**: un snapshot servido con `as_of` de
  hace 5 min se pinta «hace 5 min» aunque la petición acabe de responder.
