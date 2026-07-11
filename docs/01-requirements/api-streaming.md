# PRD — API REST y Streaming WSS

- **Estado:** approved (Gate 0, HITL 2026-07-11; cubre la versión actualizada por
  ADR-0012) — pendiente de implementación (`api-gateway`, fase 03)
- **Fecha:** 2026-07-11
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 01-requirements
- **Versión:** 0.2.0

## Problema y contexto
Las aplicaciones externas necesitan consumir tanto el histórico (REST) como los eventos e
indicadores en tiempo real (WSS), con autenticación y límites de uso.

## Objetivos / No-objetivos
- Objetivos: API REST versionada para tasas, indicadores, profundidad, señales e
  histórico; canal WSS con suscripción por tópicos; authN/Z vía **OIDC con Auth0**
  (Authorization Code con PKCE) — el gateway es Resource Server y valida access tokens
  (ADR-0012).
- No-objetivos: construir IdP/login propios (delegado a Auth0); front-end/SPA consumidor
  (proyecto aparte); facturación por uso.

## Usuarios y escenarios
Usuarios: **personas** autenticadas vía Auth0 (OIDC), que acceden a través de un
front-end/SPA (cliente público). Autorización por roles/permisos de Auth0 (`viewer`,
`operator`) mapeados a scopes de la API.

### Escenarios positivos
1. Usuario inicia sesión vía Auth0 (Universal Login, Auth Code + PKCE), el SPA obtiene un
   access token y consulta `GET /api/v1/indicators/current` con `Authorization: Bearer`.
2. El SPA abre WSS con el access token, se suscribe a `indicators` y `signals`, y recibe
   eventos push en tiempo real.
3. Usuario consulta histórico con paginación y agregación por intervalo.

### Escenarios negativos / abuso (requerido por Gate 0)
1. **Token expirado/alterado**: firma inválida contra el JWKS de Auth0 → 401; sin
   información de diagnóstico interna en la respuesta (A07).
2. **Ataques al login** (credential stuffing, fuerza bruta, breached passwords): mitigados
   en el tenant de Auth0 (Universal Login con attack protection, bot detection, MFA); el
   gateway ya no expone `/auth/token` (A07, A09).
3. **ID token / token de otra audiencia usado como bearer**: el gateway valida `aud`
   (=API) e `iss` (=tenant) y rechaza cualquier otro token (confused deputy, A01/A07).
4. **Scraping masivo del histórico**: rate limit por token/IP, paginación obligatoria,
   límites de rango de fechas por request (DoS, A10).
5. **Conexiones WSS zombies o flooding de suscripciones**: máximo de conexiones y
   suscripciones por usuario (`sub`); heartbeat/ping con desconexión por inactividad (A10).
6. **Inyección en parámetros de consulta** (fechas, intervalos, tópicos): validación
   estricta de tipos y whitelisting de tópicos; queries parametrizadas (A05).
7. **Elevación entre usuarios**: autorización por scopes/permisos del token
   (`read:indicators`, `read:signals`); un usuario no accede a scopes que su rol no otorga (A01).
8. **Replay de tokens en WSS**: expiración corta + validación de `exp` en cada reconexión;
   el token en `?token=` nunca se registra en logs (A07, A09).

## Requisitos funcionales
- RF-1: Endpoints REST versionados (ver `docs/02-design/api-contracts.md`).
- RF-2: WSS con suscripción por tópicos: `rates.official`, `p2p.snapshot`, `indicators`, `signals`.
- RF-3: OIDC Authorization Code + PKCE con Auth0; el gateway valida el access token JWT
  (RS256) contra el JWKS de Auth0 (verifica `iss`, `aud`, `exp`); expiración ≤ 15 min. El
  gateway no emite tokens ni almacena credenciales de usuario.
- RF-4: Rate limiting por token y por IP; cuotas configurables por usuario/rol.
- RF-5: Respuestas con metadatos de frescura (`as_of`, `official_stale`, `confidence`).

## Requisitos de seguridad (mapeados a OWASP ASVS)
| Req | ASVS | Nivel | OWASP Top 10 |
|---|---|---|---|
| OIDC (Auth Code + PKCE) con Auth0; validación de access token por JWKS (RS256, `iss`/`aud`/`exp`) | V2/V3 | L2 | A07 |
| Rechazo de ID token o token de otra audiencia como bearer (validación estricta de `aud`) | V3 | L2 | A01, A07 |
| Scopes/permisos (Auth0 RBAC) y autorización por endpoint/tópico | V4 | L2 | A01 |
| Validación estricta de inputs (fechas, intervalos, tópicos) | V5 | L1 | A05 |
| Rate limiting y cuotas por token/IP; límites WSS | V11 | L2 | A10 |
| TLS 1.2+ obligatorio (HSTS); WSS sobre TLS | V9 | L1 | A04 |
| Gestión de credenciales, MFA y claves de firma delegada a Auth0 (el gateway no almacena secrets ni claves) | V6 | L2 | A02, A04 |
| Logging de seguridad: authN fallida, rate limit (sin registrar el token de `?token=`) | V16 | L2 | A09 |
| Errores uniformes sin stack traces ni detalles internos | V10 | L1 | A10 |

## Métricas de éxito
- Latencia REST ≤ 300 ms (p95) para consultas actuales; ≤ 2 s para histórico.
- Push WSS ≤ 1 s desde publicación interna del indicador.
- 100 % de endpoints cubiertos por contrato OpenAPI/AsyncAPI.

## Dependencias y riesgos
- Depende de: motor de indicadores, TimescaleDB, esquema de eventos, ADR-0012 (OIDC/Auth0),
  tenant de Auth0 (API/audience, RBAC, attack protection configurados).
- Riesgo: dependencia de disponibilidad y costo (por MAU) de Auth0; requiere un front-end/SPA
  (cliente público) aún inexistente para completar el flujo de login.
