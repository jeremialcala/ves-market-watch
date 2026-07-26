---
type: Service
title: api-gateway
description: Capa de acceso REST + WSS para usuarios autenticados; Resource Server OIDC con Auth0 — implementado (2026-07-26) y verificado en vivo contra la infra del compose y el tenant real.
resource: ../../apps/api-gateway/
tags: [python, fastapi, implementado, api, wss]
timestamp: 2026-07-26T00:00:00Z
---

# api-gateway

**Estado: implementado (2026-07-26).** FastAPI + uvicorn, hexagonal
(`domain/application/adapters`). **Resource Server** OIDC: valida access tokens de
Auth0 (RS256 vía JWKS con cache por `kid`; `iss`/`aud`/`exp`; rechaza ID tokens y
audiencias ajenas — T11), autoriza por el claim `permissions` (fallback `scope`),
no emite tokens — ADR-0012 (supersede ADR-0003). Decisiones de implementación en
**ADR-0016** (cola efímera de push, retransmisión del payload canónico, rate limit
in-memory, profundidad como proyección interim).

- **REST `/api/v1`** — los 8 endpoints del contrato
  (`apps/api-gateway/docs/openapi.yaml`): tasa oficial current/history, P2P
  current, indicadores current/history, profundidad, señales y health (público).
  Errores RFC 7807; paginación obligatoria con rango máx. 90 días (422); rate
  limit por token (ventana fija 60 s, cabeceras `X-RateLimit-*`, 429 con
  `Retry-After`); decimales siempre string exacto.
- **WSS `/ws/v1?token=…`** (`docs/asyncapi.yaml`): whitelist de tópicos
  `{rates.official, p2p.snapshot, indicators, signals}`, ≤ 5 conexiones y ≤ 10
  suscripciones por `sub`, ping 30 s, cierre 4401 al expirar el token, token
  redactado en logs. Push = payload del evento del bus validado contra su schema
  (`{topic, event_id, occurred_at, data}`).
- **Datos**: asyncpg de **solo lectura** (`default_transaction_read_only=on`,
  defensa T9) sobre [official_rates](../tables/official_rates.md),
  [indicators](../tables/indicators.md), [signals](../tables/signals.md) y
  [p2p_snapshots_raw](../tables/p2p_snapshots_raw.md). La profundidad
  (`/market/depth`) se proyecta del último crudo minimizado (bandas de 0,5 %) —
  interim hasta que el engine materialice `p2p_top_of_book` (ADR-0016).
- **Bus**: consume los 4 eventos de `market.events` con **cola efímera**
  (exclusiva, auto-delete): el push es best-effort, el estado consultable vive en
  REST/DB (ADR-0016). Evento inválido contra su schema → descarte con log.

## Verificación
- **78 tests** (unit, contract contra el `openapi.yaml`, integration contra
  TimescaleDB/RabbitMQ reales — incl. rechazo de INSERT por el pool read-only —
  y e2e: REST autenticado + evento en el bus → frame por el WSS suscrito). La
  autenticación de tests usa un par RSA/JWKS local (`tests/soporte_auth.py`).
- **En vivo** (compose raíz, puerto host **8800**): `/api/v1/health` →
  `{"status":"ok","components":{"database":"ok","broker":"ok","auth":"ok"}}` y
  401 `problem+json` sin token, validando contra el tenant Auth0 real.

## Referencias
- PRD: `../../docs/01-requirements/api-streaming.md` · Contratos:
  `../../docs/02-design/api-contracts.md`, `apps/api-gateway/docs/openapi.yaml`,
  `apps/api-gateway/docs/asyncapi.yaml`
- ADR-0012 (auth OIDC) · ADR-0016 (implementación) · Amenazas T3, T4, T9, T11, T12.

## Pendiente
- App SPA del tenant Auth0 (se crea junto con el front-end) y un client M2M de
  prueba para verificar en vivo el flujo autenticado con token real (HITL).
- MFA del tenant cuando haya usuarios reales.
