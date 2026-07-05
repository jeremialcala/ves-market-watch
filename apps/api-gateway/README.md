# api-gateway

Capa de acceso para aplicaciones consumidoras: API REST + WebSocket (WSS) con OAuth2/JWT.

## Qué hace
- Emite tokens (`/auth/token`, client credentials → JWT RS256/EdDSA, exp ≤ 15 min).
- REST `/api/v1`: tasas, indicadores, profundidad, señales, histórico (paginado, rango máx.).
- WSS `/ws/v1`: push de `rates.official`, `p2p.snapshot`, `indicators`, `signals`.
- Rate limiting por token/IP, scopes por endpoint/tópico, errores RFC 7807.

## Requisitos y diseño
- PRD: `../../docs/01-requirements/api-streaming.md`
- Contratos: `../../docs/02-design/api-contracts.md` · ADR-0003
- Amenazas T3, T4, T9 en `../../docs/02-design/threat-model.md`

## Estructura
```
src/api_gateway/
tests/                  # pirámide: unit / integration / contract / e2e
docs/design.md
```
