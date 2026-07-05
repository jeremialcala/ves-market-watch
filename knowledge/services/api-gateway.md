---
type: Service
title: api-gateway
description: Capa de acceso REST + WSS para aplicaciones consumidoras, con OAuth2/JWT — diseñado, sin implementar.
resource: ../../apps/api-gateway/
tags: [python, fastapi, diseñado, api, wss]
timestamp: 2026-07-05T00:00:00Z
---

# api-gateway

**Estado: diseñado, sin código.** FastAPI. OAuth2 client credentials → JWT (RS256/EdDSA,
exp ≤ 15 min, scopes) — ADR-0003. REST `/api/v1` (tasas, indicadores, profundidad,
señales, histórico paginado) y WSS `/ws/v1` con tópicos whitelisted. Rate limiting por
token/IP; errores RFC 7807.

Consume del bus [indicators.updated](../events/indicators-updated.md) y
[signals.emitted](../events/signals-emitted.md) para push WSS; lee histórico de las
[tablas](../tables/index.md) con rol de solo lectura.

## Referencias
- PRD: `../../docs/01-requirements/api-streaming.md` · Contratos: `../../docs/02-design/api-contracts.md`
- ADR-0003 · Amenazas T3, T4, T9.

## Pendiente (fase 03)
- Secret store concreto (Vault / KMS / entorno cifrado).
- OpenAPI 3.1 y AsyncAPI formales.
