# api-gateway

Capa de acceso para usuarios autenticados: API REST + WebSocket (WSS). **Resource Server**
OIDC/OAuth2 — la identidad y la emisión de tokens viven en Auth0 (ADR-0012).

## Qué hace
- Valida access tokens de Auth0 (RS256 vía JWKS; `iss`/`aud`/`exp`). **No emite tokens.**
- REST `/api/v1`: tasas, indicadores, profundidad, señales, histórico (paginado, rango máx.).
- WSS `/ws/v1`: push de `rates.official`, `p2p.snapshot`, `indicators`, `signals`.
- Rate limiting por token/IP, scopes/permisos por endpoint/tópico, errores RFC 7807.

## Requisitos y diseño
- PRD: `../../docs/01-requirements/api-streaming.md`
- Contratos: `../../docs/02-design/api-contracts.md` · ADR-0012 (supersede ADR-0003)
- Amenazas T3, T4, T9, T11, T12 en `../../docs/02-design/threat-model.md`

## Estructura
```
src/api_gateway/
tests/                  # pirámide: unit / integration / contract / e2e
docs/design.md
```
