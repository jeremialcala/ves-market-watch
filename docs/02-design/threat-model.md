# Threat Model — Criterio (sistema completo)

- **Estado:** approved (Gate 1, HITL 2026-07-11)
- **Fecha:** 2026-07-26 (adenda del portal público: 2026-10-04)
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 02-design
- **Versión:** 0.5.0
- **Alcance:** sistema completo (5 servicios + web-spa + RabbitMQ + TimescaleDB); desde la adenda 2026-10-04, también el portal público, el acceso Comunidad, el nivel Empresa, el servicio de estado y el backoffice (**planificados**, ADR-0028 a ADR-0033)
- **Metodología:** STRIDE + DREAD
- **Clasificación de datos:** ver `docs/00-project/data-classification.md`

> Adenda 2026-07-26 (post-aprobación, sin cambio del veredicto del Gate 1): alcance
> ampliado al quinto servicio `ingestor-historico` (ADR-0013) y al ruleset del motor de
> señales (ADR-0015) — fila STRIDE y amenazas **T13–T14** añadidas. Puntuación DREAD
> de T13–T14 **ratificada HITL 2026-07-26** (Jeremi Alcalá).

> Adenda 2026-07-27 (post-aprobación, ADR-0017): el front-end **`web-spa`** entra al
> alcance del repo — **T12 pasa de control externo a implementación verificada aquí**
> (tokens en memoria + rotation + CSP), y se añade **T15** (origen web no autorizado)
> mitigada por la allowlist CORS del gateway. Puntuación DREAD de T15 **ratificada
> HITL 2026-08-04** (Jeremi Alcalá) — ver la adenda de abajo.

> Adenda 2026-08-04 (ratificación de T15, sin cambio del veredicto del Gate 1): la
> puntuación 2/2/2/2/2 = **10** se ratifica tras verificarla contra el código y no
> contra la ficha. El gateway expone **14 endpoints, todos `GET`**, con
> `allow_methods=["GET"]`, `allow_headers=["Authorization"]` y **sin
> `allow_credentials`** (defecto `False`); el WSS exige el access token en la query
> porque el navegador no puede fijar `Authorization` en el handshake.
>
> **La ficha atribuía la mitigación a CORS, y CORS es la segunda línea.** La primera
> es que **no hay autoridad ambiental que secuestrar**: cada endpoint pide un bearer,
> no hay cookie de sesión hacia la API y el token vive en memoria del contexto JS del
> propio SPA (T12), inalcanzable desde otro origen. Una página ajena no falla al
> *leer* la respuesta: falla al *autenticarse*. Por eso validar `Origin` en el
> handshake WSS es defensa en profundidad y no un hueco — sin token no hay handshake
> que validar.
>
> **Lo que dispararía revisar esta puntuación es un cambio del modelo de
> autenticación**: si la API pasara a aceptar cookies, un origen ajeno ganaría
> autoridad ambiental y T15 subiría de golpe. No es hipotético — ADR-0020 dejó una
> cookie SSO de primera parte *hacia Auth0*, y extender ese patrón *hacia la API* es
> la misma clase de presión que T12 documenta con `localStorage`.
>
> Reserva honesta sobre un factor: **Discoverability se ratifica en 2, pero es el más
> débil de los cinco.** La política CORS se revela con un solo
> `curl -H "Origin: https://evil.com"`, lo que argumenta un 3 (score 11). Se mantiene
> en 2 por consistencia con T11 —confused deputy, misma clase de control de
> configuración— y porque 10 u 11 caen en la misma banda de prioridad y no cambian el
> tratamiento. Queda escrito para que la próxima recalibración lo mire.

> Adenda 2026-10-04 (portal público, **planificado**; sin cambio del veredicto del
> Gate 1): el alcance se amplía a lo que deciden las ADR-0028 a ADR-0033:
>
> - el portal público sin login, que lee por `/portal/v1` y se mantiene al día
>   por sondeo;
> - el acceso Comunidad, por email sin contraseña;
> - el nivel Empresa, con credenciales M2M por cliente;
> - el servicio de estado `apps/estado`;
> - el backoffice, con su API.
>
> Nada de eso está construido. Las amenazas **T16–T25** entran ahora para que los
> controles se diseñen con ellas y no se añadan después. Su estado en *Controles*
> es «planificado», con la fase del plan (`docs/01-requirements/portal-publico.md`)
> que las cubre.
>
> **Cambio de fondo.** Hasta hoy, todo dato salía con un bearer: la primera línea
> de T15 era que «no hay autoridad ambiental que secuestrar». Con el portal hay,
> por primera vez, **superficie sin autenticar que sirve datos**: `/portal/v1` y
> `/estado/v1`. T4 deja de ser la única amenaza de DoS sobre la API. Y la
> clasificación de datos se movió: lo que sirve el portal pasó de Interno a
> Público (ADR-0028).
>
> **Puntuaciones DREAD de T16–T25: propuesta, pendiente de ratificación HITL.**
> Siguen el criterio de T11 y T15 (Discoverability 2 para fallos de
> configuración que se revelan con una petición) y la escala 1–3 del resto.

## Diagrama de flujo de datos

```mermaid
flowchart LR
    BCV([Sitio BCV]):::ext -->|HTML de tasas / HTTPS TLS anclado| IBCV
    BIN([Binance P2P]):::ext -->|JSON de anuncios / HTTPS| IBIN
    USR([Usuario via SPA]):::ext -->|login OIDC PKCE| AUTH0([Auth0 OP]):::ext
    subgraph TBP [Trust boundary: plataforma VMW]
      IBCV[ingestor-bcv] -->|official.rate.updated| BUS[[RabbitMQ market.events]]
      IBIN[ingestor-binance] -->|p2p.snapshot con merchant_ref| BUS
      BUS -->|eventos validados por schema| ENG[indicator-engine]
      ENG -->|indicators.updated y signals.emitted| BUS
      BUS -->|push interno| GW[api-gateway]
      IBCV -->|tasas y auditoria HITL| DB[(TimescaleDB)]
      IBIN -->|crudo minimizado 90 d| DB
      ENG -->|indicadores calc_version y senales con evidencia| DB
      HIST[ingestor-historico batch] -->|historicos inmutables sin bus| DB
      GW -->|solo lectura| DB
    end
    CSV([Export CSV sistema previo]):::ext -->|archivo local via CLI| HIST
    USR -->|REST y WSS con access token| GW
    GW -->|valida RS256 via JWKS| AUTH0
    classDef ext fill:#999999,color:#ffffff
```

*Eje comportamiento — fase 02 / Gate 1: DFD con trust boundaries que alimenta el STRIDE de abajo. Los actores grises son externos (no confiables o fuera de nuestro control). Estructura complementaria en `docs/architecture/c4-container.md`.*

### Portal público, acceso Comunidad, nivel Empresa y backoffice (planificado, ADR-0028 a ADR-0033)

```mermaid
flowchart LR
    ANON([Visitante anonimo]):::ext -->|HTML prerenderizado| CF[Cloudflare tunel y cache]
    ANON -->|sondeo del snapshot cada 10 s| CF
    COM([Usuario Comunidad]):::ext -->|email y token Turnstile| TS([Cloudflare Turnstile]):::ext
    COM -->|passwordless email| AUTH0([Auth0 OP]):::ext
    AUTH0 -->|correo de acceso via SMTP| RES([Resend]):::ext
    RES -->|enlace o codigo| COM
    EMP([Sistema cliente Empresa]):::ext -->|client credentials| AUTH0
    EMP -->|REST y WSS con token M2M| CF
    OPE([Operador admin con MFA]):::ext -->|Cloudflare Access| ACC[Cloudflare Access]
    GHA([Cron GitHub Actions]):::ext -->|sondeo externo| CF
    GHA -->|aviso de caida| NTFY([ntfy]):::ext
    AUTH0 -->|Action de emision via service token| ACC
    subgraph TBP [Trust boundary: plataforma VMW]
      CF -->|portal v1 sin token, IP real por CF-Connecting-IP| GW[api-gateway]
      CF -->|api v1 con bearer| GW
      CF -->|estado v1 sin token| EST[estado]
      CF -->|estaticos| POR[portal]
      ACC -->|identidad aprobada| BO[backoffice y backoffice-api]
      GW -->|solo lectura| DB[(TimescaleDB)]
      EST -->|frescura de tablas y esquema estado| DB
      EST -->|health y WSS sin token| GW
      BO -->|esquema backoffice| DB
    end
    BO -->|Management API permisos minimos| AUTH0
    BO -->|avisos de cupo al cliente| RES
    BO -->|alertas al operador| NTFY
    GW -->|valida RS256 via JWKS| AUTH0
    classDef ext fill:#999999,color:#ffffff
```

*Eje comportamiento — adenda 2026-10-04: lo que añade el portal público sobre el
DFD de arriba. Los únicos caminos sin token que llegan a la plataforma son
`/portal/v1`, `/estado/v1` y los estáticos del portal. La Action de Auth0 y el
operador entran al backoffice **por Cloudflare Access**, no por el hostname
público.*

## Análisis STRIDE
| Componente | Spoofing | Tampering | Repudiation | Info Disclosure | DoS | Elevation |
|---|---|---|---|---|---|---|
| ingestor-binance | Endpoint P2P suplantado (MITM) | Anuncios manipulados / respuesta alterada | Sin registro de snapshots capturados | — (datos públicos) | Baneo/429 de Binance; payloads gigantes | — |
| ingestor-bcv | Dominio BCV suplantado (DNS/MITM) | Tasa falsa inyectada; HTML alterado | Sin auditoría de tasas capturadas | — | Caída del sitio BCV; parser roto | — |
| RabbitMQ | Servicio se conecta con credencial ajena | Eventos inválidos/malformados publicados | Publicaciones sin trazabilidad | Credenciales AMQP filtradas | Tormenta de eventos; colas llenas | Usuario AMQP con permisos excesivos |
| indicator-engine | — | Datos envenenados → señales falsas; duplicados/reorden; ruleset de señales alterado (T13) | Señal sin evidencia de inputs | — | Backlog de eventos | — |
| ingestor-historico | — (entrada por archivo local, sin red) | Export CSV malicioso/alterado envenena el histórico (T14) | Cargas sin registro de archivo/fecha | — (datos públicos agregados) | CSV gigante/corrupto rompe la carga | — |
| web-spa (browser) | Sitio falso imita el dashboard (phishing hacia el login real) | Dependencia npm comprometida inyecta código en el bundle (T8) | — | Robo de token vía XSS (T12); origen ajeno lee la API (T15) | — | Scopes acotados por el RBAC del token (no hay elevación local) |
| api-gateway | Tokens falsificados; ID token / token de otra audiencia usado como bearer | Manipulación de parámetros de consulta | Accesos sin log | Errores verbosos; PII de usuario en logs | Flood REST/WSS; scraping histórico | Usuario accede a scopes/permisos ajenos |
| Auth0 (OP externo) | Ataques al login (credential stuffing, breached passwords); phishing de callback | Config del tenant alterada (audiencia, `redirect_uri`) | — | Enumeración de usuarios en login | Abuso del endpoint de login | Roles/permisos mal asignados en RBAC |
| TimescaleDB | Conexión con rol ajeno | SQL injection vía parámetros | Cambios sin auditoría | Dump de credenciales de clientes | Consultas de histórico sin límites | Rol de servicio con privilegios amplios |
| portal (browser, sin login) — *planificado* | Sitio falso imita el portal y su alta Comunidad | Dependencia npm comprometida en `packages/criterio-ui` llega a las dos apps (T8) | — | Snapshot con campos internos (T18) | — (estáticos y caché en el borde) | — |
| api-gateway `/portal/v1` (sin token) — *planificado* | IP falsificada por cabecera para evadir la cuota (T17) | — (solo GET, sin parámetros libres) | — | Campos internos o por anunciante en el snapshot (T18) | Raspado y flood sin autenticar; estampida al caducar la caché; memoria del limitador por IP (T16) | Token Comunidad usado contra `/api/v1` (T20) |
| Alta Comunidad (Auth0 Passwordless + Turnstile + Resend) — *planificado* | Correo que imita el de acceso (T21) | — | — | Enumeración de cuentas por la respuesta del alta | Alta automatizada; bombardeo de correos a terceros con nuestro dominio (T19) | — |
| Clientes Empresa (M2M) — *planificado* | Secreto de un cliente robado o filtrado (T22) | — | Consumo sin atribuir a un cliente | — | Un cliente agota el cupo M2M del tenant y deja sin token a los demás (T23) | — |
| estado (`/estado/v1`) — *planificado* | — | — | — | — (solo agregados de disponibilidad) | Flood sin autenticar (T16) | Rol de base del sondeo con más que lectura |
| backoffice y backoffice-api — *planificado* | Action o petición que suplanta a Auth0 ante el contador (T25) | Contador de tokens manipulado (T25) | Acción administrativa sin registro | Contactos y pagos de clientes | — | Compromiso de la herramienta que crea credenciales de la API de pago (T24) |

## Amenazas priorizadas (DREAD)
Escala 1–3 por factor (Damage, Reproducibility, Exploitability, Affected users, Discoverability). Score = suma.

| ID | Amenaza | D | R | E | A | D | Score | Control / ADR |
|---|---|---|---|---|---|---|---|---|
| T1 | Tasa oficial falsa entra al sistema (MITM/parse erróneo del BCV) | 3 | 2 | 2 | 3 | 2 | 12 | TLS anclado + validación de rango + estado `suspect` — ADR-0006, A04/A08 |
| T2 | Anuncios P2P manipulados distorsionan indicadores y señales | 3 | 3 | 3 | 3 | 3 | 15 | Filtro outliers MAD/IQR, mediana/VWAP top-N, `low_confidence` — A08; recurrencia de manipuladores rastreable vía `merchant_ref` — ADR-0011 |
| T3 | Ataques al login (credential stuffing, fuerza bruta, breached passwords) | 2 | 2 | 2 | 2 | 3 | 11 | Login en Auth0 con attack protection (brute-force, bot detection, breached-password) + MFA; el gateway ya no expone /auth/token — ADR-0012, A07 |
| T4 | DoS sobre API/WSS (flood, scraping de histórico) | 2 | 3 | 3 | 3 | 3 | 14 | Cuotas por token/IP, límites WSS, paginación y rangos máximos — A10 |
| T5 | Eventos malformados/inyectados en el bus rompen el engine | 3 | 2 | 2 | 3 | 2 | 12 | Schema validation + DLQ + usuarios AMQP mínimos — ADR-0004, A05/A01 |
| T6 | Fuga de secretos (credenciales DB/AMQP, clave HMAC de anunciantes) | 3 | 1 | 2 | 3 | 2 | 11 | Secret store + rotación ≤ 90 d + secrets scanning CI — A02/A04. Las claves de firma JWT ya no son activo propio (gestionadas por Auth0 — ADR-0012) |
| T7 | Baneo de IP por Binance por polling agresivo | 3 | 2 | 3 | 3 | 3 | 14 | Circuit breaker + backoff + presupuesto de requests — ADR-0005, A10 |
| T8-fuentes | Fuente web de terceros inyectada desde un CDN | — | — | — | — | — | — | Evitado por diseño (2026-07-31, ADR-0018): Inter y Space Grotesk se **autoalojan** en el bundle; la CSP del nginx sigue en `default-src 'self'` y no se abre a ningún CDN |
| T8 | Compromiso de dependencia (supply chain) en cualquier servicio | 3 | 1 | 2 | 3 | 2 | 11 | Lockfiles + SCA en CI + imágenes por digest — A03 |
| T9 | SQL injection vía parámetros de histórico en gateway | 3 | 2 | 2 | 3 | 3 | 13 | Queries parametrizadas + validación estricta de inputs — A05 |
| T10 | Señales sin trazabilidad (repudio/no reproducibles) | 2 | 3 | 2 | 2 | 2 | 11 | Evidencia de inputs + regla versionada `<type>@v<n>` + `calc_version` + logging estructurado — ADR-0015, A09; forense de anunciantes entre snapshots vía `merchant_ref` — ADR-0011 |
| T11 | ID token o token de otra audiencia/tenant usado como bearer (confused deputy) | 2 | 2 | 2 | 2 | 2 | 10 | Validación estricta de `aud` (=API), `iss` (=tenant) y firma JWKS; solo se acepta el access token — ADR-0012, A01/A07 |
| T12 | Robo de token en el navegador (XSS) del front-end/SPA | 3 | 1 | 2 | 2 | 2 | 10 | Token en memoria (nunca localStorage), access token de vida corta, refresh con rotación — **implementado en `apps/web-spa`** (`cacheLocation: memory`, rotation, CSP del nginx sin unsafe-inline) — ADR-0012/ADR-0017, A03/A07. **Reforzado 2026-08-01 (ADR-0020)**: con dominio propio la cookie SSO es de PRIMERA parte, así que la sesión persiste sin guardar nada en el navegador — desaparece la presión de relajar `cacheLocation` a `localstorage` para ganar comodidad, que era el riesgo real que acechaba a este control |
| T13 | Ruleset de señales manipulado (YAML) → señales arbitrarias a consumidores | 3 | 3 | 1 | 3 | 1 | 11 | Ruleset versionado en repo (cambio = commit auditable), carga estricta al arranque (mal formado ⇒ aborta), no editable en runtime, regla `<type>@v<n>` en la evidencia — ADR-0015, A02/A08, ASVS V14 |
| T14 | Export CSV malicioso envenena el histórico (varianza/backtests sesgados) | 2 | 2 | 2 | 1 | 2 | 9 | Parseo adaptativo con rechazo completo sin columna de precio y descarte contado por fila; histórico inmutable e idempotente (PK + ON CONFLICT DO NOTHING); sin publicación al bus (no dispara el pipeline reactivo) — ADR-0013, A05/A08 |
| T15 | Página web de un origen no autorizado consume la API desde el browser de un usuario | 2 | 2 | 2 | 2 | 2 | 10 | **Primera línea: no hay autoridad ambiental.** Todo endpoint pide bearer; sin cookie hacia la API (`allow_credentials` no se activa) y con el token solo en memoria del SPA (T12), un origen ajeno no puede autenticarse. **Segunda línea:** CORS por allowlist (`ALLOWED_ORIGINS`, `allow_methods=["GET"]`) — ADR-0017, A01/A05. El WSS queda fuera de CORS por diseño del browser, pero exige el token en la query (mitiga CSWSH); validar `Origin` en el handshake es hardening en profundidad, no un hueco. **Ratificada HITL 2026-08-04** |
| T16 | DoS o raspado sobre la superficie sin token (`/portal/v1`, `/estado/v1`) | 2 | 3 | 3 | 3 | 3 | 14 | Caché con *single-flight* (TTL 5 s), cuota por IP real (600/min), *Cache Rule* de Cloudflare, poda del limitador, sin parámetros libres — ADR-0028, ADR-0032, A04 · *propuesta* |
| T17 | IP falsificada en `CF-Connecting-IP` para evadir la cuota, o cuota única para todos si no llega la IP real | 2 | 3 | 2 | 2 | 2 | 11 | La cabecera solo se acepta desde `TRUSTED_PROXIES`; vigilancia de la tasa de 429 — ADR-0028 §3, A05 · *propuesta* |
| T18 | El snapshot público filtra campos Internos (`merchant_ref`, cifras por anunciante) | 2 | 2 | 1 | 3 | 3 | 11 | Lista blanca campo a campo, contrato con `additionalProperties: false` y test — ADR-0028 §6, A01 · *propuesta* |
| T19 | Alta Comunidad automatizada; bombardeo de correos a terceros con nuestro dominio | 2 | 3 | 3 | 2 | 3 | 13 | Turnstile validado en servidor, 3/h por email y 10/h por IP, respuesta uniforme, subdominio de envío dedicado — ADR-0029 §3–4, A04 · *propuesta* |
| T20 | Un token Comunidad accede a la API de pago | 3 | 1 | 1 | 3 | 2 | 10 | Permisos disjuntos: `read:portal-comunidad` no abre ninguna ruta de `/api/v1` (403) — ADR-0029 §2, A01 · *propuesta* |
| T21 | Phishing que imita el correo de acceso Comunidad | 2 | 2 | 2 | 2 | 2 | 10 | SPF, DKIM y DMARC en el subdominio de envío; remitente único; código en vez de enlace si el spike lo confirma — ADR-0029 §3 y §5 · *propuesta* |
| T22 | Robo o filtración del secreto M2M de un cliente Empresa | 2 | 2 | 2 | 1 | 1 | 8 | Entrega de un solo uso, rotación desde el backoffice, una aplicación por cliente, cuota de 200/min y de 34 tokens/mes — ADR-0030, A07 · *propuesta* |
| T23 | Un cliente agota el cupo M2M del tenant (1.000/mes) y deja sin token a los demás | 3 | 3 | 2 | 3 | 2 | 13 | Corte **en la emisión** al token 35 (cuota nativa de Auth0 o Action con *fail-open*), ciclo por mes calendario, conciliación horaria — ADR-0033 §3, §5–6, A04 · *propuesta* |
| T24 | Compromiso del backoffice: emisión de credenciales de la API de pago | 3 | 1 | 1 | 3 | 1 | 9 | Cloudflare Access + rol `admin` con MFA, servicio aparte del gateway, Management API con permisos mínimos, auditoría de solo inserción — ADR-0033 §1, ADR-0030 §5, A01 · *propuesta* |
| T25 | Suplantación de la Action ante `backoffice-api` o manipulación del contador de tokens | 2 | 1 | 1 | 3 | 1 | 8 | *Service token* de Access, rol de base propio para el esquema `backoffice`, conciliación con los logs de Auth0 — ADR-0033 §5–6, A08 · *propuesta* |


```mermaid
quadrantChart
    title Amenazas DREAD T1-T25 por probabilidad e impacto
    x-axis Baja probabilidad --> Alta probabilidad
    y-axis Bajo impacto --> Alto impacto
    quadrant-1 Atender ya
    quadrant-2 Monitorear
    quadrant-3 Aceptar
    quadrant-4 Planear
    T2 P2P manipulado: [0.93, 0.93]
    T7 Baneo de Binance: [0.88, 0.90]
    T4 DoS API y WSS: [0.90, 0.80]
    T9 SQLi en historico: [0.78, 0.88]
    T1 Tasa falsa BCV: [0.65, 0.95]
    T5 Eventos invalidos: [0.68, 0.90]
    T6 Fuga de secretos: [0.55, 0.93]
    T8 Supply chain: [0.53, 0.87]
    T12 Robo token XSS: [0.56, 0.80]
    T3 Ataques al login: [0.78, 0.65]
    T10 Senal sin traza: [0.75, 0.60]
    T11 Confused deputy: [0.66, 0.63]
    T13 Ruleset manipulado: [0.48, 0.97]
    T14 CSV historico malicioso: [0.70, 0.48]
    T15 Origen web no autorizado: [0.71, 0.66]
    T16 DoS superficie publica: [0.97, 0.83]
    T17 IP falsificada: [0.80, 0.69]
    T18 Snapshot filtra internos: [0.63, 0.84]
    T19 Abuso del alta: [0.94, 0.71]
    T20 Token Comunidad a API: [0.42, 0.98]
    T21 Phishing del acceso: [0.60, 0.61]
    T22 Secreto M2M robado: [0.52, 0.50]
    T23 Cupo M2M agotado: [0.82, 0.96]
    T24 Backoffice comprometido: [0.30, 0.94]
    T25 Contador manipulado: [0.37, 0.82]
```

*Eje trazabilidad — fase 02 / Gate 1: probabilidad ≈ (R+E+D)/9, impacto ≈ (D+A)/6 de la tabla DREAD, con separación mínima para legibilidad. La tabla es la fuente de verdad; el cuadrante es la vista de priorización.*

## Controles y trazabilidad
| Amenaza | Control | Verificación (fase 04-testing) |
|---|---|---|
| T1 | ADR-0006; validación de rango en PRD ingesta-bcv RF-3 | ✔ Cubierto (2026-08-04): `unit/test_parser_html_alterado.py` del `ingestor-bcv`, marcador `security` — bloque mutilado, código no ISO 4217, valor no numérico, moneda duplicada en el camino degradado por regex y fecha-valor corrupta (incluida `2026-13-45`, que pasa el patrón y no existe). La regla que fijan: ante un dato dudoso, ninguno. Tasa fuera de rango, en `unit/test_validation.py` + `sync_rates` |
| T2 | PRD motor-indicadores escenario negativo 1; ADR-0011 | Etiquetado MAD verificado en ingestor-binance (unit tests + dato real); filtrado final y supresión `confianza_baja` verificados en el engine (fase 2 implementada 2026-07-20, unit/contract). **Hueco cerrado el 2026-08-06:** la profundidad del gateway leía el crudo y no aplicaba el filtro — un anuncio a 920,00 anclaba las diez bandas y el panel enseñaba un libro inexistente. El ingestor **persiste ahora el veredicto** en el crudo (por `advNo`) y el gateway lo obedece; cubierto en `unit/test_profundidad.py` y `unit/test_normalizacion.py` |
| T3 | ADR-0012; PRD api-streaming escenario 2; attack protection del tenant Auth0 | Verificación de config del tenant (brute-force, breached-password, MFA); revisión de logs de seguridad |
| T4 | PRD api-streaming RF-4; ADR-0016 (rate limit, límites WSS) | Rate limit (429/`Retry-After`), rango ≤ 90 días (422) y límites WSS (1008) cubiertos por la suite del gateway (2026-07-26); pendiente test de carga y fuzzing de paginación. **Hueco medido el 2026-08-22:** la cuota se aplica por `sub` **después** de validar el token (`rest.py`, `_protegido`), así que un cliente cuyo token se rechaza no consume cuota y no encuentra freno — el propio SPA metió **16 000 peticiones en 18 min** contra un límite nominal de 120/min. El control prometía «cuotas por token/**IP**» y la parte de IP no existe; el bucle del cliente ya está corregido, el freno del servidor no |
| T5 | ADR-0004; PRD motor-indicadores escenario 4 | Test contract de eventos + inyección de evento inválido → DLQ |
| T6 | Política de secretos (data-classification) | ✔ Cubierto en CI (2026-08-04): `gitleaks` sobre la **historia completa** en `seguridad.yml`, rompiendo el build; excepciones una a una y con motivo en `.gitleaks.toml` (dos, ambas comprobadas como públicas). Pendiente: revisión de rotación, que llega con el secret store de fase 05 |
| T7 | ADR-0005 | ✔ Cubierto (2026-08-04): `integration/test_client_errores.py` del `ingestor-binance`, marcador `security` — un 429 **real por HTTP** contra servidor local llega hasta el contador del breaker, y una vez abierto el ciclo siguiente **ni siquiera consulta**. Antes solo estaba la mecánica del breaker contra una operación falsa |
| T8 | Pipeline CI (Gate 2) | ✔ Cubierto **desde el 2026-09-08**, las tres piezas que promete el control. `pip-audit` por servicio y `npm audit --audit-level=high` en `seguridad.yml`, rompiendo el build, más pasada semanal (2026-08-04). **Lockfiles** con hashes en los cinco servicios Python, instalados por CI, por las imágenes y por el propio auditor —así el árbol auditado es el que se despliega, no el que se resolvió esa vez—. **Imágenes por digest**: las 4 de build, las 3 del compose y las 2 de servicios de CI. Regeneración en `scripts/regenerar-locks.sh`, dentro de la misma imagen que instala. **Hueco cerrado el 2026-09-16**: esa cuenta de imágenes no incluía la caja de respaldo (`scripts/respaldo/Dockerfile`), que seguía en el tag móvil `alpine:3.22`. Se coló porque el control se verifica servicio por servicio y éste no encaja en ninguna de las dos categorías —sin dependencias Python ni npm, ningún auditor lo mira, y ningún workflow lo construye—, siendo el contenedor que más valor concentra: `pg_dump` sobre toda la base y las credenciales de Drive. Pinneado por digest. Sus paquetes `apk` no se fijan uno a uno a propósito: Alpine no conserva las versiones viejas y el build se rompería solo; el digest de la base congela el índice de paquetes, que es de donde sale la reproducibilidad |
| T9 | PRD api-streaming escenario 6; ADR-0016 (pool read-only) | Queries parametrizadas + pool `default_transaction_read_only` verificado (INSERT rechazado, integration del gateway 2026-07-26); SAST cubierto desde 2026-08-04: CodeQL (`security-and-quality`) para Python y TypeScript, con un paso que lee el SARIF y **falla ante nivel `error`** — CodeQL por sí solo solo deja una alerta |
| T10 | PRD motor-indicadores RF-3; ADR-0015 (evidencia `rule` + `inputs`) | Auditoría de una señal end-to-end (verificada e2e 2026-07-22: snapshot → `correccion_inminente` en bus y tabla con evidencia) |
| T11 | ADR-0012; PRD api-streaming escenario 3 | ✔ Cubierto: rechazo de ID token (aud ajena), `iss` ajeno, alg ≠ RS256 y kid desconocido → 401 genérico (unit del gateway, 2026-07-26). **Y contra el gateway real** desde 2026-08-07 —donde intervienen nginx y el proxy, que el `TestClient` in-process no reproduce—, en el pipeline (`e2e-vivo.yml`) desde 2026-08-20 |
| T12 | ADR-0012; ADR-0017 (`apps/web-spa`) | ✔ Cubierto: `cacheLocation: memory` + rotation en `AuthProvider` (revisado; guard con tests); checklist e2e verifica en DevTools que no hay tokens en storage; CSP del nginx. **Corregido 2026-07-31**: se añadió `frame-src` del tenant (sin él la re-autenticación silenciosa por iframe se bloqueaba y cada recarga acababa en Universal Login visible). Al verificarlo apareció algo mayor: por la herencia de `add_header` de nginx —un `location` con cabeceras propias descarta las del `server`— **el sitio se servía sin CSP, sin nosniff y sin Referrer-Policy en TODAS las respuestas**. Las cabeceras viven ahora en un fragmento incluido en cada location; comprobado en el contenedor (`example.com` bloqueado por `frame-src`, el tenant permitido) y vigilado por `tests/unit/csp.test.ts`. **Corregido 2026-08-01**: faltaba `worker-src 'self' blob:`. Con `useRefreshTokens` + caché en memoria, `auth0-spa-js` canjea el código en un Web Worker creado desde un `blob:`; sin la directiva cae en `default-src 'self'`, el worker **construye pero muere al cargar** —sin excepción, sin log y sin petición de red— y **el login se colgaba por completo**. Lo introdujo el propio arreglo del 2026-07-31: mientras la CSP no llegaba al navegador el login funcionaba, y empezó a fallar en cuanto la política se aplicó de verdad. Lección: *una CSP que por fin se envía es un cambio funcional, no solo de seguridad, y hay que reprobar los flujos que dependen de ella*. Canario en `csp.test.ts` |
| T15 | ADR-0017 (CORS allowlist del gateway) | ✔ Cubierto: `tests/unit/test_cors.py` del gateway (origen permitido con ACAO, ajeno sin ACAO, errores problem+json con ACAO); verificado en vivo 2026-07-27 |
| T13 | ADR-0015 (ruleset versionado, carga estricta, ASVS V14) | Test de arranque con ruleset mal formado (aborta, ya en la suite); revisión obligatoria de todo commit al YAML |
| T14 | ADR-0013; parseo adaptativo del PRD ingesta-historica | Tests de parser con CSV corrupto/sin precio (rechazo/descarte); recarga idempotente verificada en vivo (0/1.064 duplicados) |
| T16 | ADR-0028 §2–3; ADR-0032 §3 | **Planificado — fases 2 y 7.** N peticiones concurrentes con la caché fría → una consulta a la base; ráfaga de IPs distintas → el limitador vuelve a su tamaño tras una ventana; `?from=` → 422 |
| T17 | ADR-0028 §3 | **Planificado — fase 2.** Con `TRUSTED_PROXIES` vacío, una `CF-Connecting-IP` falsificada cuenta contra la IP del socket; dos clientes tras el conector con IPs distintas tienen cuotas independientes |
| T18 | ADR-0028 §6; `data-classification.md` (fila de la lectura pública) | **Planificado — fase 2.** Test de contrato contra `portal-openapi.yaml` con `additionalProperties: false`; ningún campo fuera de la lista blanca |
| T19 | ADR-0029 §3–4 | **Planificado — fase 5.** Sin token de Turnstile o con uno inválido no sale correo y la respuesta es idéntica; el cuarto envío en una hora al mismo email no sale, desde IPs distintas |
| T20 | ADR-0029 §2 | **Planificado — fase 5.** Test de integración: un token Comunidad contra cada ruta de `/api/v1` → 403 |
| T21 | ADR-0029 §3 y §5 | **Planificado — fase 5.** Cabeceras de un correo real con DKIM y SPF en `pass` y DMARC alineado |
| T22 | ADR-0030 §1–2 | **Planificado — fases 8 y 8b.** La rotación desde el backoffice invalida el secreto anterior; el secreto no aparece en logs ni en la auditoría |
| T23 | ADR-0033 §3, §5–6 | **Planificado — fase 8b.** El token 35 del mes no se emite (`access_denied`) y el contador del tenant no sube; con `backoffice-api` parado hay *fail-open* con alerta, y la conciliación detecta la diferencia |
| T24 | ADR-0033 §1; ADR-0030 §5 | **Planificado — fase 8b.** Sin pasar por Access ninguna ruta responde; con Access y sin rol `admin`, 403; cada acción deja fila en la auditoría |
| T25 | ADR-0033 §5–6 | **Planificado — fase 8b.** La ruta del contador rechaza peticiones sin el *service token*; el rol del esquema `backoffice` no tiene permisos fuera de él |
