# ADR-0017: Front-end/SPA en el monorepo — React + Auth0, tokens en memoria y CORS allowlist

- **Estado:** accepted
- **Fecha:** 2026-07-27
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 03-implementation
- **Versión:** Unreleased (se sincroniza al próximo corte)
- **Controles OWASP afectados:** A01 (control de acceso), A03 (XSS/inyección), A05 (validación), A07 (authN)

## Contexto
Con v0.4.0 el pipeline completo termina en el api-gateway, pero no existe ningún
consumidor: el charter tenía el front-end en no-scope («proyecto aparte») y el
threat model lo daba «fuera de este repo» (T12). El usuario decidió (HITL,
2026-07-27) incorporarlo al monorepo para cerrar el flujo de punta a punta con
el mismo ciclo AI-DLC (gates, CHANGELOG, knowledge, compose). Hay que fijar:
dónde vive, con qué stack, cómo maneja los tokens (T12), cómo habla con el
gateway desde un origen distinto, y cómo se tipan los contratos.

## Decisión
1. **`apps/web-spa` en el monorepo** (enmienda HITL registrada en el charter).
   Misma estructura que las demás apps (README, `docs/design.md` con cabecera,
   pirámide `tests/`, Dockerfile con contexto raíz, servicio en el compose). El
   PRD propio es `docs/01-requirements/web-spa-dashboard.md`.
2. **Stack: React + Vite + TypeScript con `@auth0/auth0-react`** (SDK oficial:
   Auth Code + PKCE, cache de tokens y refresh rotation resueltos). Gráficos con
   **Recharts** (declarativo, tooltips que muestran el string decimal exacto).
3. **Manejo de tokens = exactamente los controles de T12**:
   `cacheLocation: "memory"` (nunca localStorage), access token de vida corta
   (900 s, ya fijado en el tenant), `useRefreshTokens: true` con **rotación**
   habilitada en el tenant (esta ADR habilita `allow_offline_access` en la API —
   ADR-0012 lo prometía y el tenant no lo tenía), y renovación proactiva del
   token del WSS a `exp − 60 s` con reconexión + reposición de estado por REST
   (ADR-0016: el push es best-effort). Al **recargar la página** no hay tokens
   en memoria: el SDK re-autentica en **silencio por iframe** (`prompt=none`
   contra la cookie de sesión SSO de Auth0 — `useRefreshTokensFallback: true` +
   Allowed Web Origins en la app del tenant), sin login visible y sin tocar
   storage. *(Enmienda 2026-07-28: la versión inicial deshabilitaba el fallback
   y cada F5 mandaba a Universal Login visible — visto en el rodaje real.)*
4. **CORS por allowlist en el gateway** (nueva env `ALLOWED_ORIGINS`, default
   `http://localhost:5173,http://localhost:8080`): solo `GET`, header
   `Authorization`, sin credentials (bearer, no cookies), `expose_headers` para
   `X-RateLimit-*`/`Retry-After`. Sin proxy de Vite: un solo mecanismo idéntico
   en dev (5173) y en el build nginx (8080), ejercitado a diario. El WSS no
   requiere CORS (los navegadores no lo aplican a WebSocket); validar `Origin`
   en el handshake queda anotado como hardening futuro (T15).
5. **Tipos del contrato generados y COMMITEADOS**: `openapi-typescript` desde
   `apps/api-gateway/docs/openapi.yaml` → `src/api/types.gen.ts`, con un check
   de frescura en la suite (regenera y diffea). Razones: el `.dockerignore`
   excluye `docs/` del contexto de build, y el diff de tipos hace visible en PR
   cualquier cambio de contrato. Los fixtures de tests se declaran `satisfies`
   contra esos tipos (contrato verificado en compilación).
6. **Decimales como string de punta a punta**: prohibido `parseFloat`/`Number`
   para lógica (`lib/decimal.ts` compara y formatea sobre el string); la única
   conversión a `number` es `toChartNumber()` para coordenadas de gráfico, con
   el string original siempre visible en tooltips/etiquetas.
7. **Distribución**: dev con `npm run dev` (5173, HMR con guard que cierra el
   WSS en cada recarga — límite de 5 conexiones por usuario); build estático
   multi-stage `node:24-alpine → nginx:alpine` servido en el compose (8080:80)
   con `try_files` de SPA, cache de assets hasheados y CSP básica (T12).

## Alternativas consideradas
- **Repo aparte (fiel al charter original)**: aísla tooling Node, pero duplica
  scaffolding AI-DLC, separa el compose y desincroniza contratos. Descartada por
  el usuario (HITL).
- **Proxy de Vite en dev en vez de CORS**: evita CORS en dev pero no en el build
  nginx; dos mecanismos y el camino real sin ejercitar. Descartada.
- **Tipos a mano o validación runtime (ajv) del contrato**: menos fiel o más
  coste; `openapi-typescript` + `satisfies` da verificación en compilación con
  cero peso en runtime. Validación runtime queda como opcional futuro.
- **localStorage para sobrevivir recargas**: rompe T12 directamente. Descartada.
- **Sin fallback de iframe (versión inicial)**: cada recarga terminaba en un
  redirect visible a Universal Login. El iframe `prompt=none` da la misma
  garantía de T12 (nada en storage; la sesión vive en la cookie de Auth0) con
  UX de recarga silenciosa. Corregida en el rodaje.
- **lightweight-charts/uPlot/visx**: excelentes para casos específicos, pero API
  imperativa o de muy bajo nivel para un dashboard mixto v1. Descartadas.

## Consecuencias
- (+) El flujo completo (login → REST → WSS → UI) vive en un solo repo con los
  mismos gates y trazabilidad; la primera «app consumidora» del charter existe.
- (+) T12 pasa de control declarativo externo a implementación verificable aquí
  (tests + revisión de `AuthProvider`); T15 (origen no autorizado) queda
  mitigada por la allowlist CORS.
- (−) Entra tooling Node/npm al monorepo (lockfile commiteado, SCA futura en CI
  — Gate 2); `.gitignore`/`.dockerignore` se amplían para node_modules/dist.
- (−) `types.gen.ts` commiteado puede desfasarse del YAML: mitigado por el check
  de frescura en la suite.
- (−) Varias pestañas del mismo usuario compiten por el cupo de 5 conexiones
  WSS; elección de líder (BroadcastChannel) queda para v2.
