# Diseño — web-spa

- **Estado:** review — implementado 2026-07-27; pendiente client_id real del tenant (F1) y e2e autenticado en vivo
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

## Paleta de series tras el rediseño — DEFECTO ABIERTO
Hasta el 2026-07-30 las series usaban una paleta **validada** con el validador
del skill dataviz (azul `#2a78d6` compra / naranja `#eb6834` venta). El rediseño
las mapeó a los acentos de marca, y al re-pasar el validador (2026-07-31) el
resultado es:

| Comprobación | Oscuro (`--dark-3` #2D3134) | Claro (`--dark-3` #FFFFFF) |
|---|---|---|
| Separación CVD, par compra/venta | ΔE **13,2** ✔ | ΔE **5,9** ✘ (protan) |
| Separación CVD, trío con salvia | ΔE **9,2** ✔ | ΔE **5,2** ✘ |
| Banda de luminosidad | ✘ (los tres, demasiado claros) | ✔ |
| Piso de croma | ✘ (teal 0,077 y salvia 0,034 leen gris) | ✘ |
| Contraste vs. superficie | ✔ (≥ 3:1) | ✔ (≥ 3:1) |

En **oscuro** el par que de verdad codifica lado (compra ↔ venta) supera el
objetivo de ΔE ≥ 8 con holgura; los dos fallos son de estilo de paleta, no de
lectura. En **claro** el par cae **por debajo del piso de 6**: ahí la regla dice
que ya no basta con la codificación secundaria que la UI sí tiene (cada lado va
rotulado y con su cifra en tinta). **Un lector protanope no distingue compra de
venta en tema claro.**

No se repinta aquí porque elegir pasos nuevos de las rampas de marca es decisión
de diseño, no de implementación. Queda en «Pendiente» con el remedio concreto.

## Shell responsive (2026-07-31)
El diseño declara la tira de estado dentro de `isWide`: **en compacto no
existe**, y su información se reparte en vez de perderse. La escalera, medida en
el navegador (las media queries no corren en jsdom):

| Ancho | Barra | Tira de estado | Vista actual |
|---|---|---|---|
| ≥ 1080 px | ancha, 1 fila | completa (estado · suscripciones · último evento · cuota · calc) | — |
| 760–1079 px | ancha, 2 filas | se repliegan suscripciones y cuota | — |
| 480–759 px | compacta | ausente → punto + antigüedad en la barra; detalle completo en la línea meta del menú | visible |
| < 480 px | compacta | ídem | retirada |
| < 360 px | compacta, título con elipsis | ídem | retirada |

Lo que **nunca** se repliega es el estado del stream: en ancho va como `Tag`, en
compacto como punto + antigüedad, y en ambos casos es región viva (`role=status`,
`aria-live="polite"`) con el estado en texto accesible — el color del punto no
codifica solo. La etiqueta de vista lleva `flex: none` a propósito: sin él, flex
la estruja a 0 px mucho antes de su punto de corte y el texto queda partido a
media palabra; o entra entera, o se retira.

## Bloques sin fuente de datos (regla RF-5 aplicada al rediseño)
El diseño pide secciones que la plataforma **no calcula**: régimen de mercado,
percentiles de backtest de los medidores, escenarios con probabilidades y
riesgos. Se implementan —el dueño del producto lo pidió así para poder evaluar
el diseño completo— y **cada una lleva el sello `demo · sin fuente`**
(`components/DemoBadge.tsx`) más la explicación en la bajada de la sección. Lo
que sí se deriva de verdad se deriva: sparkline de 24 h, mapa de calor de 14 d
× hora (VET) y comparativas 7/30/90 d salen de `/indicators/history`
(`state/useHistorialBrecha.ts`, dos llamadas filtradas por indicador y moneda);
la descomposición reparte el precio P2P con la tasa oficial vigente y el VWAP.

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
  como cifra héroe con su sparkline de 24 h, panel de instrumentos, descomposición,
  mapa de calor, referencia P2P, microestructura, tasas oficiales, cronología de
  señales con la evidencia desplegable **en línea** y profundidad), **análisis**
  (ADR-0018: escenarios y riesgos sellados como demo; presión de liquidez real),
  **histórico** con Recharts, e **intradía** (2026-07-29, RF-7): parrilla de small
  multiples con todos los indicadores del día operativo VET agrupados por oficial /
  compra / venta / microestructura, cada panel con último valor, sparkline con la
  apertura marcada y la variación intradía (Δ abs y %). El color sigue codificando
  UNA sola cosa —el lado del mercado—, ahora mapeado a los acentos de marca (teal
  compra / coral venta / salvia sin lado); el signo de la Δ va en glifo + texto; un
  solo eje por gráfico; tooltips con el string exacto.

## Seguridad (T12 aplicado)
- Tokens nunca en localStorage/sessionStorage (verificable en DevTools).
- Refresh rotation + access token de 900 s (tenant); reconexión WSS con token
  renovado; el token solo viaja en la URL del handshake WSS (mandato del
  contrato; el gateway lo redacta en sus logs).
- nginx: CSP sin `unsafe-inline` para scripts, `frame-ancestors 'none'`
  (clickjacking), `nosniff`, `connect-src` limitado a gateway + tenant.
- Lockfile commiteado (SCA en CI — Gate 2); cero secretos en el bundle.

## Verificación
- **162 tests** (unit / component / contract) con **88,9 % de ramas** (umbral
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
- F1 de ADR-0017: app SPA en el tenant (client_id → `src/config.ts`), client
  M2M de prueba, rotation/offline_access — requiere `auth0 login` (HITL).
- Checklist e2e con login real (plan de verificación de ADR-0017).
- Multi-pestaña (BroadcastChannel) y code-splitting del Histórico (v2) — el
  bundle pasó de 500 kB al entrar el rediseño.
- Retirar los bloques `demo · sin fuente` a medida que el `indicator-engine`
  calcule lo que representan (régimen, percentiles del ruleset, escenarios).
- **Paleta de series en tema claro** (defecto abierto, ver arriba): elegir pasos
  de las rampas de marca que pasen la separación CVD (objetivo ΔE ≥ 8), o vestir
  las series con textura además del color. Reservar los acentos actuales para el
  cromo de la interfaz, donde no codifican dato.
