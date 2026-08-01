# api-gateway

Capa de acceso para usuarios autenticados: API REST + WebSocket (WSS). **Resource Server**
OIDC/OAuth2 — la identidad y la emisión de tokens viven en Auth0 (ADR-0012).
**Implementado y verificado en vivo (2026-07-26).** Decisiones de implementación: ADR-0016.

## Qué hace
- Valida access tokens de Auth0 (RS256 vía JWKS con cache por `kid`; `iss`/`aud`/`exp`;
  rechaza ID tokens y audiencias ajenas — T11). **No emite tokens.** Autoriza por el
  claim `permissions` (RBAC de Auth0; fallback `scope`).
- REST `/api/v1` (contrato: `docs/openapi.yaml`): tasa oficial current/history,
  referencia P2P, indicadores current/history, profundidad, señales y health público.
  Errores RFC 7807; paginación obligatoria (rango máx. 90 días → 422); decimales
  siempre string exacto; rate limit por token (60 s, `X-RateLimit-*`, 429).
- WSS `/ws/v1?token=…` (contrato: `docs/asyncapi.yaml`): push de `rates.official`,
  `p2p.snapshot`, `indicators`, `signals` — payload canónico del evento validado
  contra `schemas/` (cola AMQP efímera, best-effort). Límites: ≤ 5 conexiones y
  ≤ 10 suscripciones por usuario; ping 30 s; cierre 4401 al expirar el token; el
  token de la query se redacta en logs.
- Lee TimescaleDB con pool de **solo lectura** (`default_transaction_read_only=on`,
  defensa T9): `official_rates`, `indicators`, `signals`, `p2p_snapshots_raw`.

## Ejecución

```bash
# vía compose (raíz del repo) — publicado en el puerto host 8800
docker compose up -d --build --wait api-gateway
curl http://localhost:8800/api/v1/health

# local (requiere la infra del compose)
python -m api_gateway
```

Config por entorno (defaults del código apuntan al compose de dev y al tenant
`dev-higerotech.us.auth0.com`): `AUTH0_ISSUER`, `AUTH0_AUDIENCE`, `JWKS_URI`,
`DATABASE_URL`, `AMQP_URL`, `HTTP_HOST`/`HTTP_PORT`, `RATE_LIMIT_PER_MIN`,
`P2P_FRESCURA_MIN`, `WSS_MAX_CONEXIONES`/`WSS_MAX_SUSCRIPCIONES`.

## Estructura
```
src/api_gateway/
  domain/        # Usuario, paginación/rangos, rate limit, profundidad (puras)
  application/   # puertos, casos de uso de lectura, gestor de suscripciones WSS
  adapters/      # auth/jwks (Auth0), timescale (read-only), amqp (push), http (REST+WSS)
tests/           # 90 tests: unit / contract / integration / e2e (ver tests/README.md)
docs/            # design.md · openapi.yaml (REST) · asyncapi.yaml (WSS)
```

## Requisitos y diseño
- PRD: `../../docs/01-requirements/api-streaming.md`
- Contratos: `../../docs/02-design/api-contracts.md` · ADR-0012 · ADR-0016
- Amenazas T3, T4, T9, T11, T12 en `../../docs/02-design/threat-model.md`

## Pendiente
- App SPA del tenant + client M2M de prueba para el e2e autenticado en vivo (HITL).
- MFA del tenant cuando haya usuarios reales.
