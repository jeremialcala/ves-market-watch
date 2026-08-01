---
type: Log
title: Historia del knowledge bundle
description: Registro cronológico de cambios en el contexto del proyecto (más reciente primero).
timestamp: 2026-07-31T00:00:00Z
---

# Log

## 2026-07-31 — La CSP no existía: nginx la descartaba entera
- Pedido: añadir `frame-src` para el iframe de silent auth de Auth0. Al ir a
  verificarlo, la cabecera **no estaba en ninguna respuesta**. Tampoco `nosniff`
  ni `Referrer-Policy`.
- Causa: en nginx, un `location` con `add_header` propio **descarta todos los
  heredados** del `server`. Los dos locations de cache tenían el suyo, así que
  las tres cabeceras escritas arriba no llegaban al navegador. T12 y ADR-0017
  daban ese control por implementado.
- Arreglado con un fragmento incluido en el server y en cada location con
  cabeceras propias. Y `frame-src` del tenant añadido: sin él el iframe
  `prompt=none` se bloquea y cada recarga acaba en Universal Login visible —
  funcionaba en `vite dev` (sin CSP) y se rompía solo en el contenedor.
- Verificado dentro del contenedor con una sonda en el mismo origen:
  `example.com` bloqueado por `frame-src`, el tenant permitido. De paso, el
  script inline de la sonda quedó bloqueado por `script-src 'self'` — buena
  señal de que la política se aplica de verdad.
- Lección: **una cabecera escrita no es una cabecera enviada**. El canario nuevo
  comprueba la config, no la intención.

## 2026-07-31 — Un reporte sobre un contenedor viejo destapó un defecto real
- Reportaron la tira de estado visible en móvil. El contenedor del compose
  servía un bundle anterior al trabajo responsive —se comprobó buscando
  marcadores del código nuevo en el JS servido—, así que el síntoma venía de ahí.
- Pero al mirarlo apareció un defecto de verdad: `useCompacto` arrancaba en
  `false`, o sea que **el primer render siempre era el ancho**. En un móvil la
  tira se pintaba un fotograma y desaparecía al correr el efecto.
- Arreglado midiendo el ancho de forma síncrona en el estado inicial y
  escondiendo la tira **también por CSS**: el estado de React llega un tic tarde
  y la regla vale aunque el JS falle. Canario para que el corte no se separe
  entre TS y CSS.
- Dos lecciones: **verificar contra lo que el usuario mira**, no contra el
  working tree; y un reporte puede ser correcto aunque su causa inmediata sea
  otra — aquí la medición previa y el reporte eran ambos ciertos.
- De paso: al reescribir la sección de paleta en el commit anterior me llevé por
  delante la sección «Shell responsive» del design.md. Recuperada de git.

## 2026-07-31 — La paleta de datos deja de ser la paleta de marca
- Arreglado el defecto que dejó el rediseño: en tema claro el par compra/venta
  daba ΔE 5,9 bajo protanopia. Ahora `#10846e` ↔ `#cf4946` (ΔE 8,1), a solo 4,1
  OKLab de los acentos de marca — lo mínimo para cruzar el piso.
- La regla que queda: **el acento de marca viste el cromo; el dato lleva slot
  propio**. Mezclarlos fue el origen del problema.
- «Sin lado» pasa a tinta neutra: es la ausencia de lado, no una tercera
  categoría (y el salvia leía gris igual, croma 0,046).
- El mapa de calor iba con los valores del tema oscuro escritos a fuego: no era
  monótono en luminosidad y en claro quedaba a 1,67:1 sobre blanco, invisible.
  Ahora rampa secuencial de un tono por tema, y la leyenda habla de INTENSIDAD
  porque en claro sube oscureciendo y en oscuro aclarando.
- Dos tropiezos propios que vale anotar: (1) mi filtro de búsqueda comparaba el
  estado de contraste con `true` cuando el validador devuelve la cadena
  `"pass"` — descartaba todo y me hizo creer que no existía solución; (2) el
  paso de tono de 2° saltaba justo el candidato bueno. El validador tenía razón
  desde el principio; el que fallaba era mi arnés.
- Canario nuevo (`tests/unit/paleta.test.ts`) que fija los valores medidos: la
  frase «validada» ya no puede caducar en silencio.

## 2026-07-31 — El shell se reparte en vez de encogerse
- La tira de estado se pintaba en todos los anchos y el diseño la declara dentro
  de `isWide`: por eso se partía en dos filas en pantallas medianas. Ahora en
  compacto no existe y su contenido va al punto de la barra (estado + antigüedad)
  y a la línea meta del menú.
- Regla que salió de aquí: **lo que no cabe se retira entero, no se estruja**. La
  etiqueta de vista llevaba flex por defecto y se encogía a 0 px mucho antes de
  su breakpoint, partiendo el texto a media palabra; con `flex: none` o entra
  entera o se retira.
- El estado del WSS deja de depender del color: región viva en las dos variantes
  y con el estado en texto accesible.
- Las media queries no corren en jsdom, así que la escalera se **midió en el
  navegador** con iframes de ancho fijo (cada uno tiene su propio viewport) de
  1280 a 320 px: una fila en la tira, sin desbordes ni solapes. Un "solape" que
  aparecio al medir era artefacto de un nodo con display:none.

## 2026-07-31 — Barrido tras el rediseño: la paleta ya no estaba validada
- El rediseño mapeó las series a los acentos de marca y los docs seguían
  diciendo «paleta validada con el skill dataviz». Se volvió a **correr el
  validador** en vez de dar por buena la frase: en oscuro el par compra/venta da
  ΔE 13,2 y pasa; en **claro cae a ΔE 5,9** (protan), por debajo del piso de 6
  donde ni el rótulo visible lo excusa. Defecto de accesibilidad abierto, con
  remedio anotado — no se repinta porque elegir pasos de las rampas de marca es
  decisión de diseño.
- Lección que vale para el próximo cambio de color: **la parte de color es
  computable, así que se computa**. La frase «validada» caduca en cuanto alguien
  toca un token de serie.
- El PRD del `web-spa` no conocía tres capacidades que ya estaban en pantalla:
  vista de análisis, idioma y tema. Añadidos como RF-8/RF-9/RF-10, y RF-5
  ampliado con la regla del sello `demo · sin fuente`.
- Anotado también un hueco que no es del rediseño: la CSP declara solo
  `default-src 'self'`, y la re-autenticación silenciosa de Auth0 va por iframe
  (`frame-src`). Nunca se ejercitó porque el login real sigue pendiente de HITL.

## 2026-07-31 — El dashboard se viste de Higerotech (ADR-0018)
- Rediseño completo importado del proyecto de diseño de Claude Design vía MCP:
  tokens, fuentes autoalojadas (Inter + Space Grotesk, OFL) y componentes del
  sistema copiados AL REPO — la CSP sigue sin abrirse a ningún CDN.
- El tema es explícito (oscuro por marca, no `prefers-color-scheme`) y el claro
  reasigna los MISMOS tokens con `data-theme`: ningún componente lo sabe.
- i18n ES/EN con diccionario tipado: `EN` es `Record<Clave, string>` sobre las
  claves de `ES`, así que una traducción olvidada no compila. No se traduce el
  vocabulario del contrato (nombres de indicadores y reglas de señal).
- La decisión de fondo fue qué hacer con lo que el diseño pide y la plataforma
  no calcula (régimen, percentiles de backtest, escenarios, riesgos). El dueño
  del producto eligió implementarlo marcado: **sello `demo · sin fuente`** en
  cada bloque. Lo derivable se derivó de verdad — sparkline 24 h, mapa de calor
  14 d × hora VET y comparativas 7/30/90 d salen de `/indicators/history`.
- Los sellos son la lista de pendientes del motor, ahora visible en pantalla.
- 100 → **156 tests** (88,6 % ramas). El e2e con login real sigue bloqueado por
  el `client_id` del tenant, así que la revisión visual se hizo con un andamio
  temporal de datos sembrados, retirado al terminar.

## 2026-07-30 — Barrido de coherencia: los docs de estado vuelven a ser legibles
- Tres olas de trabajo (gateway, SPA, intradía) dejaron los documentos de estado
  detrás del repo. Contrastado contra código y suites reales, no contra memoria.
- **Conteos**: gateway 83/78 → **90**, web-spa 65 → **100** (85,7 % ramas). El resto
  (bcv 54, binance 48, historico 39, engine 77) ya coincidía.
- **Los gates eran lo que más mentía**: Gate 1 decía «gateway aún sin código» (lleva
  implementado desde el 26), «WSS: esqueleto hasta AsyncAPI» (publicada ese mismo
  día), `ADR-0001…0015` y `T1–T14`. Gate 0 seguía en 5 PRDs.
- Patrón recurrente: **un pendiente se cierra en un doc y sobrevive en otros**. El
  residual «nombrar apps consumidoras» lo cerró la enmienda del charter del 27 y
  seguía vivo en el propio charter y en Gate 0; el SPA figuraba «fuera de este repo»
  en el plan de pruebas mientras el threat model ya lo daba implementado.
- Otro patrón: **pendientes que describen un mundo viejo** — «cuando exista el
  api-gateway» (existe; no lee esa tabla), «se crea junto con el front-end» (existe;
  falta su client_id), «engine fase 2 usará la serie histórica» (se entregó sin ella).
  Se conservan como pendientes, pero diciendo dónde vive hoy la cosa.
- El `design.md` y el README del `web-spa` no conocían su propia tercera vista
  (Intradía, RF-7): al añadir la vista se actualizó el knowledge, no los docs de la app.
- `repo-history.md` iba 6 commits atrasado: regenerado con `scripts/gitgraph_branches.py`
  (es doc generado, no editar a mano) y gitGraph validado.

## 2026-07-30 — El push WSS del gateway ya sobrevive a una caída del bus
- Era lo único roto en vivo: una interrupción de RabbitMQ dejaba el push muerto
  **hasta reiniciar el contenedor**, y en silencio. `start()` conectaba una sola
  vez y, si el broker no estaba, no reintentaba jamás.
- Peor: `/health` **mentía**. `conectado()` miraba `connection.is_closed`, que en
  una `RobustConnection` solo es cierto tras un `close()` explícito → `broker: ok`
  con el push muerto. Ahora la señal es «hay consumo», y solo vuelve a `ok`
  cuando la restauración de cola/bindings/consumidor terminó: aio-pika marca
  `connected` **antes** de restaurar, y esa restauración puede fallar y recaer.
- Se añade `AlertNotifier` al gateway (mismo puerto que el `indicator-engine`):
  una alerta al caer y otra al restablecerse, una por episodio.
- Trampa de aio-pika que costó el hallazgo: cada `connect_robust` fallido deja
  una tarea de reconexión propia dentro del objeto, reintentando para siempre y
  **sobreviviendo a la cancelación** (colgaba pytest). Sin el objeto en la mano no
  hay a quién cerrarle → se instancia `RobustConnection` y se conecta por separado.
- La cola efímera NO la nombra el servidor: con `declare_queue("")` aio-pika
  genera `amq_<hex>` en cliente — por eso el re-declare al reconectar funciona
  (un nombre `amq.*` del servidor sería prefijo reservado y daría ACCESS_REFUSED).
- Verificado en vivo con `rabbitmqctl close_connection` (quirúrgico, sin tocar
  los otros servicios): restablecido en 28 ms, 4 bindings y consumidor de vuelta.
  5 tests nuevos; el conteo del servicio pasa a 90 (lo documentado, 78, ya venía
  desactualizado: la suite real eran 85).

## 2026-07-29 — Intradía: la variación vs. apertura VET, por fin calculada
- Nueva vista **Intradía** del `web-spa` (RF-7): parrilla de small multiples con
  TODOS los indicadores del día operativo VET (UTC−4 fijo), agrupados en
  oficial / compra / venta / microestructura. Cada panel lleva último valor,
  sparkline con la apertura marcada y la **variación intradía** (Δ abs y %).
- La métrica estaba en el glosario y en los requisitos del motor desde el inicio,
  pero **nadie la calculaba**: el plan de pruebas la daba por cubierta en
  `indicator-engine` desde 0.3.0 y era falso (cero referencias a apertura en su
  código y sus tests); `knowledge/metrics` sí decía «pendiente». Plan corregido.
  Se deriva en el cliente sobre `/indicators/history`, sin tocar `calc_version`;
  persistirla como indicador del motor sigue pendiente.
- Aritmética exacta con `BigInt` en `lib/decimal.ts` (`restarDecimales`,
  `porcentajeRelativo`): la regla «decimales como string exacto» ahora cubre el
  CÁLCULO, no solo el formateo. Apertura cero ⇒ «—», nunca ∞ ni NaN.
- Excepción documentada a «filtra siempre por indicador»: con ventana de un día
  conviene pedir el formato largo (~23 series en una pasada por moneda) en vez
  de ~23 requests filtrados; el filtro de `currency` sí sigue siendo obligatorio.
- Color = lado del mercado y nada más; el signo de la Δ va en glifo + texto.
  Slots 1/2/3 revalidados **all-pairs** en claro y oscuro (small multiples topan
  en tres slots); token nuevo `--series-aqua`. Suite del SPA: 65 → **100 tests**
  (85,7 % ramas).

## 2026-07-27 — web-spa: el front-end entra al monorepo (ADR-0017)
- Enmienda HITL del charter: el SPA deja de ser «proyecto aparte». Nueva app
  `apps/web-spa` (React + Vite + TS + @auth0/auth0-react): dashboard en vivo
  (brecha, P2P por lado, microestructura, profundidad, señales con evidencia) +
  histórico con Recharts; tokens SOLO en memoria + refresh rotation (T12
  implementado); StreamClient singleton con backoff/watchdog/renovación y resync
  REST (ADR-0016); tipos del contrato generados del openapi.yaml y commiteados.
- Gateway con **CORS por allowlist** (`ALLOWED_ORIGINS`, solo GET, expose
  X-RateLimit) — nueva amenaza **T15** mitigada; T12 pasa a verificarse aquí.
- 65 tests (86,5 % ramas — Gate 2 ≥80 %) + 5 tests CORS del gateway (83 en su
  suite); e2e en vivo con M2M listo (skip sin credenciales). Compose: servicio
  `web-spa` (nginx, 8080). Pendiente HITL: `auth0 login` → F1 (client_id SPA,
  M2M, rotation en el tenant).

## 2026-07-26 — api-gateway implementado (quinto y último servicio)
- FastAPI hexagonal en `apps/api-gateway/src/`: REST `/api/v1` (8 endpoints del
  contrato, RFC 7807, paginación ≤ 90 días, rate limit por token) + WSS `/ws/v1`
  (whitelist de tópicos, límites 5/10 por `sub`, ping 30 s, cierre 4401 al expirar).
  Resource Server OIDC contra Auth0 (RS256/JWKS cache por kid; rechaza ID tokens —
  T11); DB de **solo lectura** (`default_transaction_read_only=on`, T9); consume los
  4 eventos con cola efímera para push best-effort (**ADR-0016**, nueva).
- Contrato WSS formalizado: `apps/api-gateway/docs/asyncapi.yaml` (cierra el TODO);
  OpenAPI ajustada (currency en tasa oficial, 404 en los current, `spread_pct` real).
- 78 tests (unit/contract/integration/e2e) en verde; verificado en vivo en el compose
  (puerto host 8800): health ok en DB/broker/auth y 401 correcto contra el tenant real.
- Fichas y índices actualizados: los 5 servicios implementados; eventos con el
  gateway como consumidor real. Pendiente: SPA + client M2M de prueba (HITL), MFA.

## 2026-07-26 — Barrido de coherencia post-0.3.0
- Índices y fichas del knowledge sincronizados con el estado real: 5 servicios
  (los 4 de datos implementados; api-gateway con tenant Auth0 y OpenAPI 3.1 listos
  pero **sin código**), engine con fases 1 y 2 + señales, `p2p.snapshot` con
  consumidor real (no «previsto»), gates 0/1 aprobados HITL, 5 PRDs y
  ADR-0001…0015 en el índice raíz.
- Conteos de tests actualizados a los reales: bcv 54, binance 48 (engine 77,
  historico 39 ya estaban). Anotado que en dev el compose fija `TOP_K=200` en el
  ingestor-binance (default del código: top-100).

## 2026-07-22 — Motor de reglas de señales (RF-4) implementado
- El indicator-engine ya **emite** `signals.emitted` (ADR-0015): ruleset versionado
  (`config/senales.v1.yaml`), evaluación por nivel sobre la vista de indicadores vigentes,
  dedup por cooldown (60 min/tipo) y evidencia (regla + insumos). Nueva hypertable `signals`
  (migración 002). 77 tests; verificado e2e en vivo (snapshot → `correccion_inminente` al bus
  y a la tabla). RF-4/RF-5 satisfechos; el api-gateway aún no consume el evento.
- `signals.emitted` pasa de «contrato definido» a **«implementado»** en índices y knowledge;
  tabla `signals` movida de planificada a implementada.

## 2026-07-20 — Coherencia post-fase-2 + contrato `signal.v1`
- Auditoría e2e de la doc contra el código tras la fase 2: corregida la deriva de tratar
  «fase 2» como «P2P + señales» (el código las separó). Actualizados motor-indicadores,
  knowledge del engine (fase 2 implementada, 49 tests), gate-0 (4→5 PRDs), gate-1,
  api-contracts y architecture. Nuevo **ADR-0014** (microestructura P2P: reúso de
  `indicators.updated`, ventanas sobre histórico, frescura entre lados, aplazamiento de
  señales).
- **`schemas/signal.v1.json`** definido (4.º schema de eventos): payload con `type` abierto,
  `direction` enum, `evidence` {rule, inputs} para trazabilidad. Contract test de forma
  (9 casos) en el engine. **Solo contrato**: la emisión depende del motor de reglas (RF-4),
  aún pendiente. `signals.emitted` pasa de «diseñado» a «contrato definido; emisión pendiente».

## 2026-07-17 — api-gateway: spec OpenAPI 3.1 (fase 03)
- Contrato REST formal en `apps/api-gateway/docs/openapi.yaml`, generado desde la
  sección REST de `docs/02-design/api-contracts.md` y ADR-0012. 8 endpoints `/api/v1`,
  seguridad OAuth2 `authorizationCode` contra el tenant Auth0 con los 5 scopes, decimales
  como string, paginación obligatoria (rango máx. 90 d → 422), errores RFC 7807 y
  cabeceras `X-RateLimit-*`. Validado con `openapi-spec-validator`.
- Campos dependientes de la fase 2 del engine marcados preliminares (brecha/spreads/volúmenes
  `null`; vocabulario de señales pendiente de `signal.v1`). Siguen abiertos: AsyncAPI del
  WSS `/ws/v1` y la app SPA del tenant.

## 2026-07-14 — Rama feat-ai-dlc cerrada
- Cerrada tras nivelar develop (0 commits exclusivos): borrada local y en origin.
  Todo su contenido — ingestor-historico (ADR-0013), evidencia diagramática de los
  tres ejes, tenant Auth0 — vive en develop (`8658d68` y posteriores).
- Ramas vivas: `main` (pendiente merge + tag v0.2.0) y `develop` (integración).
  `repo-history.md` regenerado con el mapa main+develop.

## 2026-07-14 — Auditoría de coherencia AI-DLC: evidencia diagramática de los tres ejes
- Hallazgo: los gates 0/1 se cerraron con la sustancia en tablas (STRIDE/DREAD/ASVS) pero
  solo 3 diagramas Mermaid en el repo (C4 Context/Container + gitGraph) — faltaba el eje
  comportamiento y casi todo trazabilidad según el catálogo de la metodología.
- Se generaron los 9 faltantes inline: mindmap (charter), journey (api-streaming),
  requirementDiagram (motor-indicadores; RF-4 sin `verifies` a propósito — fase 2),
  DFD + quadrant DREAD (threat-model), sequence + state TasaOficial + ER dominio +
  classDiagram hexagonal (architecture). El ASCII art de architecture se retiró.
- Fixes de forma: cabeceras de metadatos en los 4 design docs de apps y plan de pruebas;
  `ingesta-historica.md` 0.1.1→0.2.0. Los gates conservan su firma; la evidencia nueva
  queda anotada como adenda en cada gate.
- Tenant Auth0 `dev-higerotech.us.auth0.com` aprovisionado el mismo día: API audience
  `https://api.vesmarketwatch/` (RS256, 900 s, RBAC con permisos en el token), roles
  viewer/operator con los 5 permisos, attack protection (bfp 10 intentos, bpd con
  block+aviso, sit). Detalle y config del gateway en `apps/api-gateway/docs/design.md`.
  Gotcha del CLI: `auth0 api patch` bloquea leyendo stdin en entornos no-TTY (cerrar
  stdin con `$null |`) y PS 5.1 exige escapar `\"` en el JSON de `--data`.

## 2026-07-11 — ingestor-historico: backfill de históricos de precio (ADR-0013)
- Quinto servicio, batch por demanda (CLI `cargar`/`stats`), sin bus: carga exports
  CSV del sistema previo (top-100 combinado con 3 bancos principales) en la nueva
  hypertable `historical_market_snapshots`, idempotente por `(captured_at, source_id)`.
- Parseo adaptativo (heurística de columnas, bancos dinámicos, anotaciones de
  liquidez, fechas EN/ISO, fallback ObjectId); archivo ajeno → rechazo completo,
  fila corrupta → descarte contado.
- Varianza histórica vía `stats`: precio base y por banco, log-retornos, por día de
  mercado (UTC−4). Verificado en vivo: 1.064 filas (2025-12-02→12-11), recarga
  0/1.064, varianza σ²≈65.3 (σ≈8.08) sobre media 417.03.
- PRD `ingesta-historica.md` **approved (HITL 2026-07-11)** — Gate 0 incremental
  cerrado; 39 tests; migración montada en el compose. Carga oficial confirmada en la
  DB de desarrollo: 1.064 filas, `repo-history.md` regenerado tras el commit `31289f5`.

## 2026-07-11 — Gates 0 y 1 cerrados (HITL) y corte de versión 0.2.0
- Ambos gates firmados por Jeremi Alcalá; la aprobación del Gate 0 cubre la versión
  de requisitos actualizada por ADR-0012 (auth OIDC con Auth0, supersede ADR-0003).
- CHANGELOG: `[Unreleased]` cortado a **0.2.0** (convención AI-DLC: Gate 1 → 0.2.0);
  cabeceras de metadatos (Estado approved / Versión 0.2.0) sincronizadas en charter,
  glosario, data-classification, 4 PRDs, architecture, threat-model, api-contracts y C4.
- Nueva documentación viva de fase 03: `docs/03-implementation/repo-history.md`
  (gitGraph + bitácora derivados del historial real + trazabilidad tag↔versión↔ADR).
- Pendientes: taggear `v0.2.0` sobre el merge a `main`; residuales HITL del charter
  (apps consumidoras, marco legal); `signal.v1`/umbrales (engine fase 2); secret store
  (fase 05); api-gateway sin implementar (Resource Server, ADR-0012).

## 2026-07-07 — Verificación de pendientes de Gate 0 y Gate 1
- Gate 0: retención de alias → resuelto (ADR-0011 implementado); quedan como
  decisiones humanas los TODO del charter (apps consumidoras, marco legal).
- Gate 1: ADRs 0001–0011 (0010 proposed pero implementada de facto — el bundle
  OKF se mantiene desde 2026-07-05); contratos de eventos formales (3 de 4
  schemas, p2p-snapshot v1.1); abiertos: signal.v1/umbrales (engine fase 2),
  secret store (fase 05). Threat model T2/T10 citan ahora el ADR-0011.
- Ambos gates listos para la firma humana («Aprobado por» sigue pendiente).

## 2026-07-06 — ADR-0011 implementado: merchant_ref en producción
- `Pseudonimizador` en el dominio del ingestor-binance: HMAC-SHA256 sobre `userNo`
  (nunca el alias), 32 hex; en el evento (contrato v1.1 aditivo, `merchant_ref`
  requerido) y en el crudo persistido. `MERCHANT_HMAC_KEY` obligatoria (fail fast).
- Verificado en vivo: dos corridas con la misma clave → 88/96 anunciantes
  correlacionados entre snapshots; cero alias/ID crudos en disco. Suite en 48 tests.
- El motor de ingesta de Binance queda completo; sin pendientes en el servicio.

## 2026-07-06 — Identidad de anunciantes P2P: pseudonimización HMAC (ADR-0011)
- Decisión humana que cierra el TODO de data-classification: conservar historia de
  anunciantes como `merchant_ref` (HMAC-SHA256, clave dedicada `MERCHANT_HMAC_KEY`,
  sin rotación programada); alias e ID crudos siguen sin persistir.
- Habilita (fase 2 del engine): dedup de profundidad, concentración de mercado,
  recurrencia de manipuladores (T2) y forense de señales (T10).
- Implementación pendiente en `ingestor-binance` (`minimizar_crudo` + contrato
  p2p-snapshot v1.1, aditivo); PRD y data-classification actualizados.

## 2026-07-06 — Auditoría de coherencia docs↔implementación
- Minimización de datos aplicada al crudo P2P (`minimizar_crudo`): el alias e
  identificadores del anunciante ya no tocan disco — cierra la brecha con
  data-classification (el TODO de confirmación humana sigue abierto).
- ADR-0008/0009 → accepted (implementados por ingestor-bcv, con notas de cómo);
  Gate 1 y README raíz actualizados al estado real; índices del bundle
  (servicios/eventos/métricas) sincronizados; tabla de persistencia de
  architecture.md con estado por tabla.

## 2026-07-06 — ingestor-binance implementado (última fuente)
- Spike del endpoint P2P resuelto (ADR-0005): HTTP 200 con la forma esperada,
  ~643 anuncios USDT/VES; fixtures reales versionados. `tradeType` = perspectiva
  del taker.
- Servicio completo: polling educado (presupuesto, backoff+jitter, breaker),
  validación de schema de la fuente, sanitización, outliers MAD etiquetados
  (con piso relativo 2 % calibrado con datos reales), crudo 90 d y `p2p.snapshot`
  (contrato `schemas/p2p-snapshot.v1.json`). 40 tests; flujo productor→bus
  verificado en vivo (100 anuncios/lado).
- Con esto las 3 fuentes/servicios de datos están implementados; falta fase 2 del
  engine (brecha) y el api-gateway.

## 2026-07-05 — indicator-engine fase 1: primer consumidor del bus
- Motor implementado como consumidor de `official.rate.updated`: validación contra
  schema compartido, DLQ, idempotencia por `event_id`, hypertable `indicators`
  (calc_version) y emisión de `indicators.updated` con `triggered_by`.
- Contratos formales en `schemas/` (official-rate.v1, indicators.v1) verificados por
  contract tests en ambos lados; sobre estándar unificado a `occurred_at`.
- Flujo ingestor→bus→engine verificado en vivo (5 monedas del sitio real del BCV).
- PRD motor-indicadores accepted (fase 1); pendiente fase 2: P2P y señales.

## 2026-07-05 — Re-validación HITL de tasas suspect (ADR-0007 accepted)
- Job HITL implementado en `ingestor-bcv`: CLI `revalidar listar|aprobar|rechazar`,
  estado terminal `rejected`, expiración por TTL (24 h, `system:timeout`) y auditoría
  quién/cuándo/por qué (migración 002 sobre `official_rates`).
- Previo en la misma fecha: `docker-compose.yml` raíz (RabbitMQ 4 + TimescaleDB pg16
  en puerto 5433) y suites integration/e2e; la suite del servicio llega a 53 tests.

## 2026-07-05 — Creación del bundle
- Bundle OKF v0.1 inicial (ADR-0010): services, events, tables, metrics.
- Refleja: Gate 0/1 documentados; `ingestor-bcv` implementado (multi-moneda, hexagonal,
  TLS anclado, 28 tests, dry-run verificado con 5 monedas); resto de servicios en diseño.

## 2026-07-05 — Hitos previos del proyecto (resumen)
- v0.1.0: estructura AI-DLC completa hasta Gate 1 (charter, PRDs, threat model, C4, ADR-0001…0006).
- ADR-0007/0008/0009 (proposed): máquina de estados de la tasa, publicación solo-en-cambio, modelo bitemporal.
- Alcance de ingesta BCV ampliado de solo-USD a multi-moneda con descubrimiento dinámico.
