# Diseño — web-spa

- **Estado:** review — implementado 2026-07-27; pendiente client_id real del tenant (F1) y e2e autenticado en vivo
- **Fecha:** 2026-07-27
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 03-implementation
- **Versión:** Unreleased (se sincroniza al próximo corte)

Primera app consumidora de la plataforma (enmienda HITL del charter, ADR-0017):
SPA React que consume EXCLUSIVAMENTE los contratos públicos del api-gateway —
`docs/openapi.yaml` (REST) y `docs/asyncapi.yaml` (WSS). Sin acceso a DB ni bus.

## Capas
- **`lib/` (puro)**: `decimal.ts` — comparación/signo/formato es-VE sobre el
  string exacto del contrato, sin float (única excepción: `toChartNumber` para
  coordenadas de gráfico); `freshness.ts` — umbrales espejo del backend (P2P
  20 min, oficial 6 h).
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
- **`components/`/`views/`**: paneles del dashboard (brecha como stat tile —
  dataviz: un headline no es un gráfico) y vista de histórico con Recharts
  (paleta categórica/divergente **validada** con el validador del skill dataviz,
  light y dark; un solo eje por gráfico; tooltips con el string exacto).

## Seguridad (T12 aplicado)
- Tokens nunca en localStorage/sessionStorage (verificable en DevTools).
- Refresh rotation + access token de 900 s (tenant); reconexión WSS con token
  renovado; el token solo viaja en la URL del handshake WSS (mandato del
  contrato; el gateway lo redacta en sus logs).
- nginx: CSP sin `unsafe-inline` para scripts, `frame-ancestors 'none'`
  (clickjacking), `nosniff`, `connect-src` limitado a gateway + tenant.
- Lockfile commiteado (SCA en CI — Gate 2); cero secretos en el bundle.

## Verificación
- **65 tests** (unit / component / contract) con **86,5 % de ramas** (umbral
  Gate 2: 80 %): decimal exhaustivo, reducers, políticas WSS, StreamClient
  contra servidor WS mockeado, endpoints contra MSW, paneles con fixtures
  `satisfies` los tipos del contrato, HistoryView/DepthChart con recharts
  stubbeado. Wiring (App/AuthProvider/useStream/main) excluido de cobertura:
  lo verifica el e2e en vivo.
- `tests/e2e/live-gateway.test.ts` (`npm run test:e2e:live`): token M2M real →
  REST + WSS contra el gateway vivo; skip elegante sin credenciales.
- Build de producción y contenedor nginx verificados (compose, puerto 8080).

## Pendiente
- F1 de ADR-0017: app SPA en el tenant (client_id → `src/config.ts`), client
  M2M de prueba, rotation/offline_access — requiere `auth0 login` (HITL).
- Checklist e2e con login real (plan de verificación de ADR-0017).
- Multi-pestaña (BroadcastChannel) y code-splitting del Histórico (v2).
