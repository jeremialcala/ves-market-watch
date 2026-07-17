# Diseño — api-gateway

- **Estado:** review — diseño según Gate 1 (ADR-0012); pendiente de implementación (fase 03)
- **Fecha:** 2026-07-14
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 02-design
- **Versión:** 0.2.0

Rol: **Resource Server** (OIDC/OAuth2). La identidad y la emisión de tokens viven en Auth0
(ADR-0012); el gateway solo **valida** access tokens y autoriza por scopes/permisos.

## Capas
- **Dominio:** `Usuario` (claims: `sub`, permisos/roles), `Suscripción`; políticas de scopes/permisos y cuotas.
- **Casos de uso:** `ValidarAccessToken`, `ConsultarIndicadores`, `ConsultarHistorico`, `GestionarSuscripciónWSS`.
- **Puertos:** `TokenValidator` (JWKS de Auth0), `IndicatorReadRepository`, `EventConsumer` (push WSS).
- **Adaptadores:** FastAPI (REST+WSS), cliente JWKS de Auth0 (cache por `kid`), asyncpg (solo lectura), aio-pika.

## Seguridad
- Validación del access token: firma RS256 vía JWKS de Auth0; verifica `iss` (tenant),
  `aud` (=API), `exp`/`nbf`. Rechaza el ID token y tokens de otra audiencia (T11).
- Sin secrets de cliente ni claves de firma propias: gestión delegada a Auth0.
- Autorización por claim `permissions`/`scope` (Auth0 RBAC), por endpoint/tópico.
- Validación estricta de inputs (fechas/intervalos/tópicos whitelisted); queries parametrizadas.
- Límites WSS: ≤ 5 conexiones y ≤ 10 suscripciones por usuario (`sub`); cierre 4401 al
  expirar token; el token de `?token=` no se registra en logs.
- Logging de seguridad: authN fallida, rate limits (sin PII innecesaria; solo `sub` para auditoría).

## Tenant Auth0 (aprovisionado 2026-07-14)

Tenant de desarrollo: `dev-higerotech.us.auth0.com` (config pública por diseño, ADR-0012 —
no hay secretos de firma del lado del gateway).

| Recurso | Valor |
|---|---|
| API (Resource Server) | `VES Market Watch API` — id `6a56683fbcee12f7916916ae` |
| Audience | `https://api.vesmarketwatch/` |
| Firma / vigencia | RS256; access token 900 s (también `token_lifetime_for_web`); sin offline access |
| RBAC | `enforce_policies: true`, `token_dialect: access_token_authz` (permisos viajan en el claim `permissions`) |
| Permisos | `read:rates`, `read:indicators`, `read:signals`, `read:depth`, `stream:events` |
| Rol `viewer` (`rol_04JPNH53SrEU3ybX`) | Los 5 permisos (todo el catálogo actual es de solo lectura/streaming) |
| Rol `operator` (`rol_WqmKgWUWzfl8ICD9`) | Los mismos 5; se diferenciará con el permiso admin de re-validación HITL (ADR-0007) cuando exista |
| Attack protection | Brute-force: block+user_notification, 10 intentos · Breached-password: block+admin_notification (inmediata) · Suspicious-IP throttling: block+admin_notification |

Config del gateway (variables de entorno, todas públicas):

```env
AUTH0_DOMAIN=dev-higerotech.us.auth0.com
AUTH0_ISSUER=https://dev-higerotech.us.auth0.com/
AUTH0_AUDIENCE=https://api.vesmarketwatch/
JWKS_URI=https://dev-higerotech.us.auth0.com/.well-known/jwks.json
```

## Contratos
- **REST:** `docs/openapi.yaml` (OpenAPI 3.1, generada desde `api-contracts.md` — 2026-07-17,
  validada con `openapi-spec-validator`). 8 endpoints `/api/v1`, seguridad OAuth2 con los 5
  scopes de Auth0.

## Pendiente (fase 03)
- `<TODO: especificación AsyncAPI del canal WSS /ws/v1 (bloqueada en parte por signal.v1 del engine fase 2)>`
- `<TODO: app SPA (cliente público, Auth Code + PKCE) en el tenant — se crea junto con el front-end; MFA del tenant se decide cuando haya usuarios reales>`
