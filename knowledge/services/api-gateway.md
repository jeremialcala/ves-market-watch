---
type: Service
title: api-gateway
description: Capa de acceso REST + WSS para usuarios autenticados; Resource Server OIDC con Auth0 — specs listas (tenant Auth0, OpenAPI 3.1), sin código.
resource: ../../apps/api-gateway/
tags: [python, fastapi, diseñado, api, wss]
timestamp: 2026-07-26T00:00:00Z
---

# api-gateway

**Estado: specs listas, sin código.** FastAPI. **Resource Server** OIDC: valida access tokens
de Auth0 (RS256 vía JWKS; `iss`/`aud`/`exp`, scopes/permisos), no emite tokens — ADR-0012
(supersede ADR-0003). REST `/api/v1` (tasas, indicadores, profundidad, señales, histórico
paginado) y WSS `/ws/v1` con tópicos whitelisted. Rate limiting por token/IP; errores RFC 7807.

Consume del bus [indicators.updated](../events/indicators-updated.md) y
[signals.emitted](../events/signals-emitted.md) para push WSS; lee histórico de las
[tablas](../tables/index.md) con rol de solo lectura.

## Referencias
- PRD: `../../docs/01-requirements/api-streaming.md` · Contratos: `../../docs/02-design/api-contracts.md`
- ADR-0012 (supersede ADR-0003) · Amenazas T3, T4, T9, T11, T12.

## Hecho (fase 03)
- Tenant Auth0 dev aprovisionado (2026-07-14, ADR-0012): API/audience, permisos,
  roles, attack protection. Detalle en `apps/api-gateway/docs/design.md`.
- Spec OpenAPI 3.1 (2026-07-17): `apps/api-gateway/docs/openapi.yaml`,
  8 endpoints `/api/v1`.

## Pendiente (fase 03)
- AsyncAPI formal del canal WSS `/ws/v1`.
- App SPA del tenant Auth0.
- **Todo el código del servicio**: consumo de los 4 eventos del bus y exposición
  REST/WSS (config `AUTH0_DOMAIN`, `AUTH0_ISSUER`, `AUTH0_AUDIENCE`, `JWKS_URI`).
