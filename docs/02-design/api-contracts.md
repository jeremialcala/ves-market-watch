# Contratos de API — VES Market Watch

- **Estado:** approved (Gate 1, HITL 2026-07-11) — eventos formales; REST/WSS esqueleto
  hasta el api-gateway
- **Fecha:** 2026-07-11
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 02-design
- **Versión:** 0.2.0

Los contratos de **eventos** ya son formales: JSON Schema 2020-12 en `schemas/` (raíz),
verificados por contract tests en productor y consumidor. La superficie **REST** ya tiene
spec formal OpenAPI 3.1 en `apps/api-gateway/docs/openapi.yaml` (2026-07-17); las tablas de
abajo son su resumen legible. El canal **WSS** sigue como esqueleto hasta la spec AsyncAPI
(fase 03, en parte bloqueada por `signal.v1`, aún sin definir — la fase 2 del engine se
entregó sin el evento de señales; ver la fase de señales pendiente en `motor-indicadores.md`).

## Autenticación (OIDC con Auth0 — ADR-0012)
El gateway **no emite tokens**: es Resource Server. El login y la emisión ocurren en Auth0
(OIDC Authorization Code + PKCE); el front-end/SPA obtiene el access token y lo presenta al
gateway. Endpoints relevantes (en el tenant de Auth0, no en el gateway):

| Endpoint (Auth0) | Uso |
|---|---|
| `https://<tenant>/.well-known/openid-configuration` | Discovery OIDC (metadatos, `jwks_uri`) |
| `https://<tenant>/authorize` | Inicio del flujo Auth Code + PKCE (login del usuario) |
| `https://<tenant>/oauth/token` | Canje del `code` por access token + ID token |
| `https://<tenant>/.well-known/jwks.json` | Claves públicas (RS256) para validar la firma |

El gateway valida cada **access token** (no el ID token): firma RS256 vía JWKS, y `iss`
(=tenant), `aud` (=API `https://api.vesmarketwatch/`), `exp`/`nbf`. Autorización por el claim
`permissions`/`scope`. Scopes/permisos: `read:rates`, `read:indicators`, `read:signals`,
`read:depth`, `stream:events`.

## REST — `/api/v1` (Bearer access token de Auth0)
| Endpoint | Método | Parámetros | Respuesta (resumen) | Scope |
|---|---|---|---|---|
| `/rates/official/current` | GET | — | `{rate, value_date, captured_at, stale}` | read:rates |
| `/rates/official/history` | GET | `from, to, page` | serie paginada | read:rates |
| `/rates/p2p/current` | GET | `side=buy\|sell` | `{best_price, median, vwap, volume, as_of, confidence}` | read:rates |
| `/indicators/current` | GET | — | brecha abs/%, spreads, volúmenes, `official_stale` | read:indicators |
| `/indicators/history` | GET | `from, to, interval=5m\|1h\|1d, page` | serie agregada paginada (rango máx. 90 días/request) | read:indicators |
| `/market/depth` | GET | `side` | niveles `{price_band, cum_volume}` | read:depth |
| `/signals` | GET | `from, to, type, page` | señales con evidencia (`inputs`, `rule`, `calc_version`) | read:signals |
| `/health` | GET | — | estado por componente (sin detalles internos) | público |

Reglas transversales: paginación obligatoria en históricos; validación estricta de
fechas/intervalos; errores RFC 7807 sin detalles internos; rate limit por token
(headers `X-RateLimit-*`).

## WSS — `/ws/v1?token=<access_token>`
El token es el access token de Auth0 (el navegador no puede fijar cabecera `Authorization`
en el handshake WebSocket). Se valida al conectar y en cada reconexión; la URL con el token
se redacta en logs. Mensaje de suscripción:
`{"action":"subscribe","topics":["indicators","signals"]}`
Tópicos permitidos (whitelist): `rates.official`, `p2p.snapshot`, `indicators`, `signals`.

| Evento (server→client) | Payload (resumen) | Disparador |
|---|---|---|
| `rates.official` | `{rate, value_date, stale}` | `official.rate.updated` |
| `p2p.snapshot` | `{side, best_price, median, vwap, volume, confidence}` | snapshot normalizado |
| `indicators` | `{gap_abs, gap_pct, spread_buy, spread_sell, volumes, as_of}` | `indicators.updated` |
| `signals` | `{type, direction, evidence, emitted_at}` | `signals.emitted` |

Límites: ≤ 5 conexiones y ≤ 10 suscripciones por client_id; ping/pong 30 s; cierre por
token expirado con código 4401.

## Eventos internos (AMQP `market.events`, topic exchange)
| Routing key | Productor | Consumidor | Schema |
|---|---|---|---|
| `p2p.snapshot` | ingestor-binance | indicator-engine | `schemas/p2p-snapshot.v1.json` (v1.1: `merchant_ref`, ADR-0011) |
| `official.rate.updated` | ingestor-bcv | indicator-engine | `schemas/official-rate.v1.json` |
| `indicators.updated` | indicator-engine | api-gateway | `schemas/indicators.v1.json` |
| `signals.emitted` | indicator-engine | api-gateway | `schemas/signal.v1.json` (pendiente — fase de señales, aún sin implementar) |

Todos los eventos llevan sobre: `{event_id, event_type, schema_version, occurred_at,
producer}` para idempotencia y trazabilidad (implementado así en ingestor-bcv e
indicator-engine; los schemas viven en `schemas/` en la raíz del repo). Eventos
inválidos → DLQ `market.events.dlq`.
