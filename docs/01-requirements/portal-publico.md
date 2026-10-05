# Portal público de Criterio — plan por página

- **Estado:** decisiones cerradas (D1 a D11); listo para la fase 1
- **Fecha:** 2026-10-04
- **Rama:** `portal-publico`
- **Diseño de referencia:** proyecto de Claude Design «Criterio», archivo
  `Criterio Público.dc.html` (siete páginas, tweak `portada` = `dato` | `producto`)

## Qué es y por qué cambia el sistema

Hoy **todo Criterio está detrás de un login de Auth0**: el `web-spa` entero va
envuelto en `RequireAuth` y el único endpoint sin token es `/api/v1/health`. El
diseño propone lo contrario: un **sitio abierto**, con el Dashboard en vivo sin
cuenta, Intradía e Histórico a cambio de un email, y la API como producto de
pago.

| Nivel | Qué obtiene | Cómo entra |
|---|---|---|
| **Anónimo** | Producto, Dashboard en vivo, APIs (catálogo), Precios, Estado | sin nada |
| **Comunidad** (gratis) | además Intradía e Histórico **en el portal**, ventana de 90 días | solo email, enlace mágico, sin contraseña |
| **Empresa** («Habla con nosotros») | REST `/api/v1` (9 endpoints) y WSS `/ws/v1` desde su código, cuota por volumen, SLA | contrato; credenciales emitidas por nosotros |

Eso no es una app nueva encima del backend: **es un cambio en el modelo de acceso
del backend**, y es donde está casi todo el trabajo. Las páginas en sí reutilizan
buena parte de lo que el `web-spa` ya pinta.

### Lo que el diseño inventó y hay que confirmar

El propio chat del diseño lo marca, y la revisión del repo añade lo demás:

- **Dominio** `criterio.higerotech.com`: inventado. Hoy solo existen los de
  desarrollo (`criterio-dev`, `criterio-api-dev`).
- **Parámetros y formas de respuesta** del catálogo de APIs: inventados. Los
  *paths* sí son los reales; los parámetros reales están en
  `apps/api-gateway/docs/openapi.yaml`.
- **Estado**: disponibilidades e incidentes de ejemplo. No hay nada que los mida.
- **Alta por email**: simulada. Falta todo el flujo.
- **Tasa BCV en cinco monedas** (USD, EUR, CNY, TRY, RUB): **el ingestor solo
  captura USD** (`ingestor-bcv/adapters/bcv/parser.py`).
- **«Alertas por API»** y **«Vigilar esta regla»**: no existen alertas de
  usuario. ADR-0021 las dejó fuera de alcance y el botón del SPA está
  deshabilitado a propósito.
- **«Cuota API (ventana) 116 / 120»** en el Dashboard: en un portal anónimo no
  hay cuota que mostrar.
- **Precios con «9 endpoints»**: son 8 de datos más `/health`, que es público.

## Página por página

Convención de las tablas: **Existe** = hay código hoy que lo sirve; **Falta** =
trabajo nuevo.

### 1. Producto (landing)

**Rehecha en el diseño el 2026-10-04: la landing habla con los datos del
Dashboard.** Antes era un hero con cifras propias (12,05 %, que no coincidían
con el Dashboard) y una sección «Tres piernas» con texto. Ahora:

- **Hero:** la misma lectura del Dashboard. Brecha buy, régimen de hoy («Lateral
  en compresión»), sparkline, oficial USD/VES, P2P VWAP buy y la edad del dato.
- **«Lo que el dato demuestra» — cuatro promesas, verificables en vivo.** Cada
  una es un **panel real del Dashboard**, con su endpoint y un botón «Verlo en el
  dashboard»:

| # | Promesa | Panel del Dashboard que reutiliza | Endpoint que cita |
|---|---|---|---|
| 01 | **Procedencia**: cada número dice de dónde viene y cuándo | Calidad y procedencia del dato | `/analysis/current` |
| 02 | **Anticipación**: qué falta para que el mercado cambie de pie | Distancia al disparo | `/signals` · WSS `signals` |
| 03 | **Contexto**: escala de 90 días, no un número suelto | los **3 medidores más cerca de su umbral** del panel de instrumentos | `/indicators/current` · `/indicators/history` |
| 04 | **Explicación**: qué pierna mueve la brecha | Descomposición de la brecha | `/analysis/current` |

- Casos de uso por tipo de cliente y CTA final, como antes.

| Pieza | Existe | Falta |
|---|---|---|
| Hero y los cuatro paneles | todos los datos están en el snapshot de ADR-0028 | nada nuevo: **la landing lee el snapshot entero**, no solo el hero |
| Los cuatro paneles | son componentes del Dashboard | se escriben **una vez** en `packages/criterio-ui` (ADR-0031) y los usan las dos páginas |
| «Los 3 más cerca de su umbral» | el Dashboard ya ordena los medidores por cercanía al umbral | la misma función, con un tope de 3 |
| Textos, casos de uso, CTA | — | contenido estático, i18n ES/EN |
| SEO | — | prerender del texto estático (D5); los paneles se llenan al cargar con el snapshot |

**Backend nuevo:** ninguno. La landing y el Dashboard comparten el snapshot, y
con él la caché: un visitante que pasa de una a otra no cuesta otra consulta.

**Consecuencia para el diseño:** las incoherencias del Dashboard pasan también a
la landing, y ahí pesan más porque es lo primero que se ve. Ver «Correcciones
pendientes en el diseño» al final.

### 2. Dashboard (público, en vivo)

Es la página más grande y la que más se parece a lo que ya existe.

| Bloque del diseño | Existe hoy | Falta |
|---|---|---|
| Lectura de hoy (régimen, texto, chips) | `analysis/current` → `reading` (ADR-0021); `MarketRegimeCard` | — |
| Brecha buy + sparkline 24 h + 7 d | `indicators/current`, `indicators/history`; `GapPanel` | — |
| Distancia al disparo | `analysis.rule_proximity`; `RuleDistance` | — |
| Brecha vs. 30 días, oferta/demanda | `indicators/history`, `analysis` bandas | — |
| Panel de 6 instrumentos con escala 90 d | `analysis` bandas/escalas; `GaugePanel` | — |
| Descomposición de la brecha | `analysis.gap_legs` (ADR-0023) | — |
| Brecha hoy vs. historia (p12) | bandas de `analysis` | — |
| Mapa de calor 14 d × 24 h | `indicators/history?interval=1h` | componente nuevo |
| Referencia P2P buy/sell | `rates/p2p/current?side=` | — |
| Calidad y procedencia | `indicators` metadata, `official_stale` | quitar «Cuota API» o darle sentido |
| **Tasa oficial en 5 monedas** | solo USD | **ingesta de EUR, CNY, TRY, RUB** en `ingestor-bcv` + `currency` en la API |
| Cronología de señales 30 d | `/signals` | agrupar por regla y «efecto» (ya en `historialReglas.ts`) |
| Profundidad P2P | `/market/depth`; `DepthChart` | — |
| Barra superior «WSS conectado · último evento» | `StreamClient`, `ConnectionStatus` | canal **público** de push (D2) |
| «Exportar por API», «Alertas por API» | — | modales con código de ejemplo + CTA Empresa; las alertas no existen (D6) |

**Backend nuevo:**

- Lectura anónima de todo lo anterior (D1), sin abrir `/api/v1` a cualquiera.
- Push anónimo para el «en vivo» (D2).
- Ingesta de las cuatro monedas que faltan. Es la única pieza de **datos**
  nuevos del Dashboard.

### 3. Intradía (nivel Comunidad)

Sin sesión, muestra el formulario de email. Con sesión: selector de moneda y
bucket (5/15 min, 1 h), lectura de la sesión, «qué se movió desde la apertura»,
compra vs. venta métrica por métrica, microestructura y cronología de la sesión.

| Pieza | Existe | Falta |
|---|---|---|
| Datos por bucket | `indicators/history?interval=5m\|15m\|1h`; `lib/intradia.ts` arma la sesión (ADR-0025) | — |
| Lectura y cronología de la sesión | `SessionReading`, `SessionTimeline`, `cronologia.ts` | — |
| Compra vs. venta por métrica | series `p2p_*` por lado | tabla nueva con sparklines |
| «Exportar sesión» | CSV en cliente (`SessionReading`) | — |
| «Vigilar esta regla» | — | se quita del diseño (D6) |
| **Gate por email** | — | flujo Comunidad (D3) |

**Backend nuevo:** la autorización Comunidad (D3) y que el endpoint que la sirva
acepte ese token y no uno de Empresa. Los datos ya existen.

### 4. Histórico (nivel Comunidad)

Lectura del histórico (percentil de hoy, último episodio, deriva de la oficial),
serie con rango 7/30/90 d, serie y bucket seleccionables, tasa oficial USD/VES,
episodios comparables e historial de las reglas.

| Pieza | Existe | Falta |
|---|---|---|
| Serie y percentiles | `indicators/history`; `lecturaHistorico.ts`, `SerieTemporal` | — |
| Tasa oficial | `/rates/official/history` (desde 2020-03-30) | — |
| Episodios comparables | `lib/episodios.ts`, `EpisodiosComparables` (en cliente) | — |
| Historial de las reglas | `lib/historialReglas.ts`, `HistorialReglas` | — |
| Gate por email | — | D3, el mismo de Intradía |

**Backend nuevo:** solo la autorización. Aviso: «90 días» es también la
retención de `indicator_analysis` y de los crudos; la ventana del portal no
puede pasar de ahí sin cambiar la clasificación de datos.

### 5. APIs (catálogo y playground)

Lista de los endpoints por grupo (tasas, indicadores, mercado, sistema, WSS) y
un playground que ejecuta de verdad: `/health` responde, el resto devuelve el
401 real.

| Pieza | Existe | Falta |
|---|---|---|
| Catálogo | `openapi.yaml` y `asyncapi.yaml` en el repo | generarlo desde los contratos en el build, no a mano |
| Parámetros y ejemplos | contratos reales | corregir los inventados del diseño |
| Playground contra el gateway | `/health` público | CORS del origen del portal; URL de producción real (el openapi tiene `api.vesmarketwatch` de placeholder) |
| Chips «OAuth2 Bearer · RS256», «≤ 5 conexiones», «RFC 7807» | es lo real | — |
| «Rango máx. 90 días → 422» | es lo real | — |

**Backend nuevo:** ninguno, más allá de CORS y la URL. Los docs de FastAPI siguen
apagados; el catálogo sale de los YAML del repo.

### 6. Precios

Dos niveles y una tabla comparativa. Contacto: `contacto@higerotech.com` y
WhatsApp.

| Pieza | Existe | Falta |
|---|---|---|
| Comunidad: «Crear acceso gratis» | — | lleva al flujo D3 |
| Empresa: contacto | — | `mailto:` y `wa.me`; sin formulario, sin backend |
| Cuota por volumen | `RATE_LIMIT_PER_MIN=120`, **igual para todos** | cuota por cliente Empresa (D4) |

**Backend nuevo:** ninguno para la página. La promesa que hace sí lo necesita:
cuotas por cliente y emisión de credenciales Empresa (D4).

### 7. Estado

Estado global, edad del snapshot P2P y de la tasa BCV, latencia p50 de la API,
barras de disponibilidad de 60 días por componente (API REST, WebSocket, Ingesta
P2P, Captura BCV, Motor, Portal) e historial de incidentes.

| Pieza | Existe | Falta |
|---|---|---|
| Estado instantáneo | `/health` (base, broker, auth); `official_rate_source_health`; frescura por `as_of` | ampliar a ingestas y motor |
| Disponibilidad 60 d por componente | **nada** | sondeo periódico que se guarde (D7) |
| Latencia p50 | **nada** | medirla |
| Incidentes | **nada**; la fase 06-monitoring no ha empezado | registro de incidentes (D7) |

**Backend nuevo:** es la página con más backend propio en proporción. Ver D7.

### 8. Backoffice (interno, no público)

No está en el diseño: lo pide la decisión D4. Sirve para habilitar a los
clientes Empresa y hacerles seguimiento sin tocar la consola de Auth0 a mano.
Primera entrega:

| Pantalla | Qué hace | Backend |
|---|---|---|
| **Clientes** | alta (empresa, contacto, email, WhatsApp, fecha de firma); estado: *pendiente de pago → activo → suspendido → baja* | tablas en el esquema `backoffice` (D10) |
| **Pagos** | registrar un pago en USDT (fecha, importe, red, hash, periodo); próximos vencimientos | idem |
| **Habilitación** | «crear credenciales»: aplicación M2M, *grant* con los 5 permisos y `rate_limit_per_min=200` en los *metadata*. El secreto se muestra **una vez**, para entrega por canal seguro. Suspender, rotar secreto, dar de baja | Management API de Auth0 con permisos mínimos (ADR-0030 §5) |
| **Consumo** | por cliente: tokens M2M del mes contra 34, peticiones por día, 429s, última actividad | logs de Auth0 + **medición en el gateway** (nueva) |
| **Capacidad** | clientes activos contra el techo (29), tokens del tenant contra los 1.000 del mes | idem |
| **Auditoría** | quién hizo qué y cuándo | tabla de acciones, solo inserción |

**Backend nuevo:**
- **Medición de uso en el gateway:** el limitador vive en memoria y no deja
  rastro. Hace falta volcar, por cliente y por hora, las peticiones y los 429 a
  una tabla (sin IPs: solo el `client_id`).
- **El servicio del backoffice (D9)** y su esquema (D10).
- **La lectura de los logs de Auth0** para el consumo de tokens (D11).

### Transversal a todas

- Barra superior: «WSS conectado», último evento, «datos públicos, sin cuenta»,
  fecha de los datos.
- Navegación, ES/EN, claro/oscuro, «Acceso gratis» → alta, y el email cuando hay
  sesión.
- Pie con contacto y WhatsApp.
- Portada: **Producto** (D8). `/` es la landing y el Dashboard vive en
  `/dashboard`; el tweak `portada` del diseño no pasa al sitio.

## Decisiones que bloquean el plan

Cada una lleva recomendación. Las D1 a D4 cambian el backend y merecen ADR.

**D1. Cómo lee el portal anónimo los datos.** ✔ **Decidida el 2026-10-04 →
ADR-0028.** Añade al plan dos cosas que no estaban: la IP real llega por
`CF-Connecting-IP` solo desde proxies de confianza (hoy el gateway no la lee y
todos los visitantes compartirían una cuota), y la reclasificación a Público de
lo que sirve el portal.
Si el Dashboard llama a `/api/v1` sin token, la API de pago queda abierta a quien
la quiera raspar, y la página de Precios pierde sentido.
→ **Decidido:** endpoints propios del portal, `/portal/v1/*`, con la forma
que necesita cada página (un snapshot del Dashboard, no ocho llamadas), caché de
pocos segundos, límite por IP y sin paginación ni rangos libres. Los datos son
los mismos, pero el contrato no es el de la API de pago. Va en el mismo
`api-gateway` como otro router, no como un servicio nuevo.

**D2. Cómo llega el «en vivo» al anónimo.** ✔ **Decidida el 2026-10-04 →
ADR-0028 §5.**
`/ws/v1` exige token y tiene límites por usuario; abrirlo por IP es la superficie
de DoS más barata del sistema.
→ **Decidido:** sondeo del snapshot de D1 cada 10 s, sin WebSocket anónimo.
Tras D1 el snapshot no cuesta nada por visitante, y el diseño ya habla en
escala de decenas de segundos («hace 34 s»). La pestaña oculta no sondea, y ante
un 429 el cliente retrocede. La barra pasa de «WSS conectado» a «En vivo ·
actualizado hace N s», con la edad de `as_of`. El WebSocket queda como parte
del nivel Empresa. Esta decisión subió la cuota por IP de D1 de 60 a 600 por
minuto, por el CGNAT de las operadoras móviles.

**D3. Qué es el «acceso Comunidad».** ✔ **Decidida el 2026-10-04 → ADR-0029.**
El diseño lo llamaba «API key Comunidad», pero solo abre el portal. Desde esta
decisión se llama **acceso Comunidad**, y el diseño se corrige.
→ **Decidido:**
- **Identidad:** Auth0 Passwordless por email, con rol `comunidad` y permiso
  `read:portal-comunidad`, que solo vale en `/portal/v1`. Un token Comunidad
  recibe 403 en `/api/v1`. Sin tabla de usuarios propia.
- **Correo:** **Resend** como SMTP de Auth0, en un subdominio de envío
  dedicado con SPF, DKIM y DMARC.
- **Anti-abuso:** **Turnstile validado en servidor**, con límites de 3 envíos
  por hora por email y 10 por hora por IP.

Quedan dos cosas para un spike al empezar la fase 5:
- **Dónde se valida Turnstile:** con la Bot Detection de Auth0 o con un
  `POST /portal/v1/acceso` propio con cliente confidencial.
- **Enlace o código de 6 dígitos:** los escáneres de correo corporativo
  consumen los enlaces de un solo uso.

**Aviso de privacidad:** borrador en
`docs/legal/aviso-de-privacidad-acceso-comunidad.md` (2026-10-04), pendiente de
revisión de Jeremi Alcalá y de completar los campos entre corchetes (razón
social, jurisdicción, retención de cuentas inactivas). Bloquea la salida a
producción, no el desarrollo.

**D4. Cómo se emiten las credenciales Empresa y su cuota.** ✔ **Decidida el
2026-10-04 → ADR-0030.**
→ **Decidido:**
- **Credencial:** una aplicación M2M de Auth0 por cliente, creada **a mano
  después de la firma y el pago**.
- **Precio de referencia:** 50 USDT por cliente.
- **Cuotas:**
  - **34 tokens M2M al mes por cliente.** Ajustado desde 36: 29 × 34 = 986,
    dentro de los 1.000 del plan actual de Auth0.
  - **200 peticiones por minuto.** Viaja como claim desde los *metadata* de la
    aplicación; las personas del `web-spa` siguen con 120.

  Con tokens de 24 h, al cliente le quedan solo 3–4 tokens al mes para
  reinicios: la guía de alta le exige cachear el token también en disco.
- **Operación:** todo se hace desde un **backoffice** (sección propia abajo, con
  D9 a D11).

**Pendiente de verificar antes del primer cliente:** si los tokens del
`web-spa` y del acceso Comunidad cuentan contra los mismos 1.000. Si cuentan,
la holgura de 14 no alcanza y el techo baja de 29.

**D5. App nueva o evolucionar el `web-spa`.** ✔ **Decidida el 2026-10-04 →
ADR-0031.**
El `web-spa` no tiene router, todo va dentro de `RequireAuth` y ya pinta casi
todos los bloques del Dashboard, Intradía e Histórico.
→ **Decidido:** app nueva `apps/portal` (mismo stack: React 19, Vite, TS),
con router y prerender de las páginas estáticas para SEO. Los componentes y el
sistema de diseño (`src/ds`, ADR-0018) se **extraen a un paquete compartido** del
workspace en vez de copiarse, o habrá dos versiones de cada gráfico en un mes.
El `web-spa` actual sigue siendo la consola interna con login.

**D6. Alertas («Alertas por API», «Vigilar esta regla»).** ✔ **Decidida el
2026-10-04** (sin ADR: no cambia el backend).
No existen y son un producto entero: persistencia por usuario, evaluación,
canal de entrega y baja.
→ **Decidido:** fuera de la primera entrega.
- **«Alertas por API»** (Dashboard) muestra el código para suscribirse a
  `signals` por WSS, que es del nivel Empresa, y «Habla con nosotros».
- **«Vigilar esta regla»** (Intradía) **se quita del diseño**, no se marca
  «Próximamente»: el portal no promete lo que no existe.

Si se quieren alertas para Comunidad, van en un plan aparte.

**D7. De dónde salen los datos de Estado.** ✔ **Decidida el 2026-10-04 →
ADR-0032.**
→ **Decidido:**
- **Un servicio de sondeo propio, `apps/estado`, fuera del gateway.** Cada
  minuto comprueba los seis componentes. Las ingestas y el motor se miden por la
  frescura de sus tablas.
- **Datos:** una hipertabla en el esquema `estado`, retención de 90 días, y un
  agregado diario.
- **La página lee de `/estado/v1`, servido por ese mismo servicio.** Así una
  caída del gateway sale en la página como API REST caída, en vez de tumbarla.
- **Los minutos sin comprobación se pintan «sin datos»,** nunca como
  disponibles.
- **Sondeo externo:** un cron de GitHub Actions que avisa por ntfy. No escribe
  en la base.
- **Incidentes:** YAML en el repo, revisados por PR; publicar uno exige
  desplegar el servicio.
- **La latencia que muestra la página es la de `/health`**, rotulada así, hasta
  que la fase 8 mida el tráfico real.

**D8. Portada: `dato` o `producto`.** ✔ **Decidida el 2026-10-04** (sin ADR:
no cambia el backend).
→ **Decidido: `producto`.** El portal abre en la landing rehecha, la que enseña
las fortalezas del producto con los datos del Dashboard («Lo que el dato
demuestra»). `/` es Producto y el Dashboard queda en `/dashboard`. El tweak
`portada` desaparece: era una pregunta de diseño, no una opción del sitio.

**D9. Dónde vive el backoffice y quién entra.** ✔ **Decidida el 2026-10-04 →
ADR-0033 §1.**
→ **Decidido:** app propia (`apps/backoffice`) y API propia
(`apps/backoffice-api`), aparte del gateway público. Dos puertas: Cloudflare
Access delante del hostname, y login de Auth0 con rol `admin` y MFA.

**D10. Dónde se guardan los datos de clientes y pagos.** ✔ **Decidida el
2026-10-04 → ADR-0033 §2.**
→ **Decidido:** esquema `backoffice` en el mismo PostgreSQL, con un rol de base
propio. Confidencial. Entra en el respaldo a B2.

**D11. Cómo se hace cumplir el cupo de 34 tokens.** ✔ **Decidida el
2026-10-04 → ADR-0033 §3 a §6.**
→ **Decidido:**
- **Avisos al cliente** al 80 % y después **cada 5 %** (85, 90, 95). Con 34
  tokens caen en 28, 29, 31 y 33.
- **Alerta al operador** si el 80 % llega **antes de la fecha** que marca el
  ritmo normal (34 × día / días del mes; en un mes de 30, el día 24).
- **Corte al 100 %.**

La revisión técnica añadió tres cosas para que la regla funcione:
- **El ciclo es el mes calendario,** el mismo en que Auth0 cuenta los 1.000 del
  tenant. Con ciclos por fecha de pago, un cliente podría gastar hasta 68 en un
  mes calendario, y el cálculo de 29 × 34 dejaría de valer.
- **El corte se aplica al emitir el token, no al leer los logs.** Entre dos
  lecturas, un cliente que pide tokens en bucle agotaría los 1.000 del tenant y
  dejaría sin servicio a los otros 28. Se usa la cuota nativa de Auth0 si el plan
  la ofrece; si no, una Action que consulta el contador del backoffice, con
  *fail-open* y alerta si no responde.
- **Un efecto que hay que saber:** con solo 3–4 tokens de margen, un cliente que
  integra bien recibe los avisos del 80–95 % todos los meses. Y en un mes de 31
  días, con tres reinicios llega a 34 y se corta. El texto de los avisos tiene
  que distinguir «vas al ritmo normal» de «vas adelantado».

## Fases

Cada fase se puede desplegar sola y deja algo que funciona.

| Fase | Contenido | Backend | Frontend | Talla |
|---|---|---|---|---|
| **0. Decisiones** | D1–D11 cerradas; ADR-0028 (D1 y D2), ADR-0029 (D3), ADR-0030 (D4), ADR-0031 (D5), ADR-0032 (D7), ADR-0033 (D9 a D11); threat model 0.5.0 con T16–T25 ✔ (2026-10-04, DREAD ratificado HITL); PRD pendiente | — | — | S |
| **1. Esqueleto** | primero, solo: workspace npm raíz con CI, Dockerfile y auditor de npm ajustados (ADR-0031 §3); después `apps/portal` con router, prerender, layout, barra, pie, ES/EN, tema, y `packages/criterio-ui` con el DS; imagen; ruta en el túnel de desarrollo | — | ✔ | M |
| **2. Lectura pública** | `/portal/v1/snapshot` y `/portal/v1/series` con caché y límite por IP; Dashboard y hero de Producto | ✔ | ✔ | L |
| **3. Páginas sin datos propios** | Producto completa, Precios, APIs (catálogo generado de los YAML y playground con CORS) | CORS, URL | ✔ | M |
| **4. En vivo** | sondeo del snapshot (D2): visibilidad, retroceso ante 429, barra «actualizado hace N s»; *Cache Rule* de Cloudflare para `/portal/v1` | — | ✔ | S |
| **5. Acceso Comunidad** | spike (Turnstile: Auth0 o endpoint propio; enlace o código); Auth0 Passwordless + Resend con SPF/DKIM/DMARC + Turnstile en servidor; rol `comunidad` y Action versionada; Intradía e Histórico detrás del acceso; aviso de privacidad | ✔ | ✔ | L |
| **6. Monedas BCV** | EUR, CNY, TRY, RUB en `ingestor-bcv`; `currency` en la API y el snapshot | ✔ | ✔ | M |
| **7. Estado** | `apps/estado` (sondeo por minuto, esquema `estado`, agregado diario, `/estado/v1` fuera del gateway), incidentes en YAML validados en CI, sondeo externo con aviso por ntfy; página | ✔ | ✔ | L |
| **8. Empresa** | cuota por claim (`rate_limit_per_min`) y *Action* de credentials exchange versionada; medición de uso por cliente; guía de alta para el cliente (reutilizar el token 24 h); URL de producción en el openapi; verificar el límite M2M del tenant | ✔ | — | M |
| **8b. Backoffice** | `apps/backoffice` + `apps/backoffice-api` tras Cloudflare Access + rol `admin` con MFA (D9); esquema `backoffice` (D10); clientes, pagos, habilitación M2M y auditoría; cupo por mes calendario con avisos al 80/85/90/95 %, alerta «fuera de fecha» y **corte en la emisión** al 100 % (cuota nativa de Auth0 o Action con *fail-open*), conciliación horaria con los logs de Auth0 (D11, ADR-0033) | ✔ | ✔ | L |
| **9. Producción** | dominio, CD del portal (no existe ni para el `web-spa`), CSP, prerender, páginas legales | infra | ✔ | M |

Orden razonable: 0 → 1 → 2 → 3 da un portal público útil sin tocar la
autenticación. La fase 5 es la de más riesgo (emails, abuso, privacidad) y no
debería mezclarse con nada más. La 6 y la 7 son independientes y pueden ir en
paralelo con la 5. La **8 y la 8b van juntas antes del primer cliente
Empresa**: sin medición ni backoffice, el alta manual se hace en la consola de
Auth0 y nadie ve el consumo del cupo de 34 tokens.

## Riesgos

- **Canibalizar la API de pago** si D1 se resuelve abriendo `/api/v1`. Es el
  riesgo de negocio principal del diseño.
- **Abuso del alta por email**: listas, enumeración, envíos masivos a terceros
  con nuestro dominio. Turnstile y límites desde el primer día.
- **Promesas del portal que el backend no cumple**: cinco monedas, alertas,
  disponibilidades. Lo que no exista al publicar se quita del diseño; no se pinta
  con datos de ejemplo.
- **Retención**: la ventana de 90 días del portal coincide con la retención de
  crudos y análisis. Ampliarla es una decisión de la clasificación de datos, no
  del portal.
- **Una sola réplica**: el limitador en memoria y la caché del snapshot asumen un
  gateway. Si se escala, van a Redis o similar.

## Correcciones pendientes en el diseño

El diseño se rehízo el 2026-10-04 (landing unificada con el Dashboard), pero
todavía no recoge las decisiones de este plan. Antes de implementar cada página
hay que llevarle estos cambios, para no construir lo que ya se decidió quitar:

| Dónde | El diseño dice | Debe decir | Por qué |
|---|---|---|---|
| Barra superior (todas) | «WSS conectado · último evento hace 34 s» | «En vivo · actualizado hace N s» | D2: sondeo, no WebSocket (ADR-0028 §5) |
| Intradía, Histórico, Precios | «API key Comunidad» | «acceso Comunidad» | D3 (ADR-0029 §1) |
| Intradía, Histórico | «te enviamos un enlace» | pendiente del spike: enlace o código | ADR-0029 §5 |
| Intradía | botón «Vigilar esta regla» | quitarlo | D6 |
| Dashboard y **landing** (panel «Calidad y procedencia») | «Cuota API (ventana) 116 / 120» | quitar la fila | un visitante anónimo no tiene cuota que mostrar; en la landing es la primera promesa («Procedencia») y enseña un dato que no es suyo |
| Dashboard y landing (tasa oficial) | cinco monedas | solo las que capture `ingestor-bcv` al publicar | hoy solo USD (fase 6) |
| Precios | «REST /api/v1 completo: 9 endpoints» | «8 endpoints de datos» | `/health` es público |
| Estado | latencia «p50 de la API» | «latencia de /health» | ADR-0032 §1 |
| Estado | barras de 60 días todas pintadas | con el estado «sin datos» en gris | ADR-0032 §2 |
| APIs | parámetros y respuestas de ejemplo | los de `openapi.yaml` | inventados por el diseño |

El propio diseño deja abierta una pregunta: los ejemplos de APIs usan cifras de
octubre (871,37) y el Dashboard las de agosto (748,79). **Para la
implementación da igual**: el portal pinta datos en vivo y los ejemplos de APIs
salen de los contratos. **Decidido el 2026-10-04: octubre**, la más cercana a
lo que el portal mostrará al lanzar. Se lleva al diseño en el mismo mensaje que
las correcciones de arriba.
