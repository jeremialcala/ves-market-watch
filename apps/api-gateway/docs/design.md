# Diseño — api-gateway

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

## Pendiente (fase 03)
- `<TODO: aprovisionar tenant Auth0: API/audience, permisos, roles (viewer/operator), attack protection>`
- `<TODO: parámetros de config del gateway (AUTH0_DOMAIN, AUTH0_ISSUER, AUTH0_AUDIENCE, JWKS_URI)>`
- `<TODO: especificación OpenAPI 3.1 y AsyncAPI generadas desde api-contracts.md>`
