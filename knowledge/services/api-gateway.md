---
type: Service
title: api-gateway
description: Capa de acceso REST + WSS para usuarios autenticados; Resource Server OIDC con Auth0 — implementado (2026-07-26) y verificado en vivo contra la infra del compose y el tenant real.
resource: ../../apps/api-gateway/
tags: [python, fastapi, implementado, api, wss]
timestamp: 2026-08-01T12:00:00Z
---

# api-gateway

**Estado: implementado (2026-07-26).** FastAPI + uvicorn, hexagonal
(`domain/application/adapters`). **Resource Server** OIDC: valida access tokens de
Auth0 (RS256 vía JWKS con cache por `kid`; `iss`/`aud`/`exp`; rechaza ID tokens y
audiencias ajenas — T11), autoriza por el claim `permissions` (fallback `scope`),
no emite tokens — ADR-0012 (supersede ADR-0003). Decisiones de implementación en
**ADR-0016** (cola efímera de push, retransmisión del payload canónico, rate limit
in-memory, profundidad como proyección interim).

- **REST `/api/v1`** — los 9 endpoints del contrato
  (`apps/api-gateway/docs/openapi.yaml`): tasa oficial current/history, P2P
  current, indicadores current/history, **análisis current**, profundidad,
  señales y health (público). `/analysis/current` sirve la lectura de los
  medidores tal como la publicó el motor (RF-6, ADR-0019) desde
  [indicator_analysis](../tables/indicator_analysis.md), con el permiso
  `read:indicators` reutilizado y 404 si la revisión es más vieja que la
  frescura P2P — el gateway no reclasifica bandas ni recalcula escalas.
  Errores RFC 7807; paginación obligatoria con rango máx. 90 días (422); rate
  limit por token (ventana fija 60 s, cabeceras `X-RateLimit-*`, 429 con
  `Retry-After`); decimales siempre string exacto.
- **WSS `/ws/v1?token=…`** (`docs/asyncapi.yaml`): whitelist de tópicos
  `{rates.official, p2p.snapshot, indicators, signals, analysis}`, ≤ 5 conexiones y ≤ 10
  suscripciones por `sub`, ping 30 s, cierre 4401 al expirar el token, token
  redactado en logs. Push = payload del evento del bus validado contra su schema
  (`{topic, event_id, occurred_at, data}`).
- **Emisor**: valida contra el **dominio propio** `auth.higerotech.com`
  (ADR-0020). El `iss` de los tokens dejó de ser el canónico, y `AUTH0_ISSUER` /
  `JWKS_URI` se movieron junto al SPA en la misma ventana: por separado son 401
  en todo.
- **Datos**: asyncpg de **solo lectura** (`default_transaction_read_only=on`,
  defensa T9) sobre [official_rates](../tables/official_rates.md),
  [indicators](../tables/indicators.md), [signals](../tables/signals.md),
  [indicator_analysis](../tables/indicator_analysis.md) y
  [p2p_snapshots_raw](../tables/p2p_snapshots_raw.md). La profundidad
  (`/market/depth`) se proyecta del último crudo minimizado (bandas de 0,5 %) —
  interim hasta que el engine materialice `p2p_top_of_book` (ADR-0016).
- **Vigencia de la tasa oficial** (2026-08-02, ADR-0022): `stale` y
  `official_stale` salen de la **fecha-valor**, no de la antigüedad de captura.
  El BCV publica el viernes por la tarde la tasa del lunes, así que medirlo en
  horas encendía la bandera cada fin de semana. La regla vive en
  `domain/vigencia.py`, **duplicada a propósito** con la del motor: los dos
  servicios se despliegan por separado y la alternativa era que el REST dijera
  «vigente» de la misma tasa que el análisis marca rancia. `STALE_THRESHOLD_HOURS`
  se retiró.
- **Bus**: consume los 5 eventos de `market.events` con **cola efímera**
  (exclusiva, auto-delete): el push es best-effort, el estado consultable vive en
  REST/DB (ADR-0016). Evento inválido contra su schema → descarte con log.
  **Sobrevive a caídas del bus** (2026-07-30): arranca sin broker y reintenta con
  backoff hasta engancharse; la `RobustConnection` re-declara cola, bindings y
  consumidor al reconectar; cada transición emite una alerta (CRITICAL) y
  `/health` reporta `broker: down` mientras no haya consumo real.

## Verificación
- **104 tests** (unit, contract contra el `openapi.yaml`, integration contra
  TimescaleDB/RabbitMQ reales — incl. rechazo de INSERT por el pool read-only —
  y e2e: REST autenticado + evento en el bus → frame por el WSS suscrito). La
  autenticación de tests usa un par RSA/JWKS local (`tests/soporte_auth.py`).
- **En vivo** (compose raíz, puerto host **8800**): `/api/v1/health` →
  `{"status":"ok","components":{"database":"ok","broker":"ok","auth":"ok"}}` y
  401 `problem+json` sin token, validando contra el tenant Auth0 real.
- **Reconexión verificada en vivo** (2026-07-30): `rabbitmqctl close_connection`
  sobre la conexión del gateway → alerta de caída y **restablecido en 28 ms**,
  con la cola efímera, sus bindings y el consumidor de vuelta.

## Referencias
- PRD: `../../docs/01-requirements/api-streaming.md` · Contratos:
  `../../docs/02-design/api-contracts.md`, `apps/api-gateway/docs/openapi.yaml`,
  `apps/api-gateway/docs/asyncapi.yaml`
- ADR-0012 (auth OIDC) · ADR-0016 (implementación) · Amenazas T3, T4, T9, T11, T12.

## Pendiente
- MFA del tenant cuando haya usuarios reales.
- Validar `Origin` en el handshake WSS (hoy queda fuera de CORS por diseño del
  navegador; hardening futuro de T15).
