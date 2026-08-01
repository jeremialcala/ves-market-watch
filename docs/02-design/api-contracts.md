# Contratos de API — VES Market Watch

- **Estado:** approved (Gate 1, HITL 2026-07-11) — eventos formales (5/5), REST con
  OpenAPI 3.1 y WSS con AsyncAPI 3.0; todo implementado por el api-gateway
- **Fecha:** 2026-08-01
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 02-design
- **Versión:** 0.6.0

Los contratos de **eventos** son formales: JSON Schema 2020-12 en `schemas/` (raíz),
verificados por contract tests en productor y consumidor. La superficie **REST** tiene
spec formal OpenAPI 3.1 en `apps/api-gateway/docs/openapi.yaml` (2026-07-17; ajustada al
implementarse el gateway, 2026-07-26) y el canal **WSS** su spec AsyncAPI 3.0 en
`apps/api-gateway/docs/asyncapi.yaml` (2026-07-26); las tablas de abajo son el resumen
legible. **Todo está implementado**: el api-gateway sirve REST/WSS y consume los 5
eventos (`signals.emitted` se emite desde RF-4/ADR-0015 y se sirve por `GET /signals`
y push WSS — ADR-0016; `analysis.updated` desde RF-6/ADR-0019, servido por
`GET /analysis/current` y el tópico `analysis`, y **ampliado de forma aditiva** con el
objeto `reading` en RF-7/ADR-0021).

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
`permissions`/`scope`. `/analysis/current` **reutiliza `read:indicators`** a propósito
(ADR-0019): es la lectura de esos mismos indicadores, y un permiso nuevo daría 403 a
todo token ya emitido. Scopes/permisos: `read:rates`, `read:indicators`, `read:signals`,
`read:depth`, `stream:events`.

## REST — `/api/v1` (Bearer access token de Auth0)
| Endpoint | Método | Parámetros | Respuesta (resumen) | Scope |
|---|---|---|---|---|
| `/rates/official/current` | GET | — | `{rate, value_date, captured_at, stale}` | read:rates |
| `/rates/official/history` | GET | `from, to, page` | serie paginada | read:rates |
| `/rates/p2p/current` | GET | `side=buy\|sell` | `{best_price, median, vwap, volume, as_of, confidence}` | read:rates |
| `/indicators/current` | GET | — | brecha abs/%, spreads, volúmenes, `official_stale` | read:indicators |
| `/indicators/history` | GET | `from, to, interval=5m\|1h\|1d, page` | serie agregada paginada (rango máx. 90 días/request) | read:indicators |
| `/analysis/current` | GET | `currency` (def. `VES`) | lectura de los medidores (banda, escala con sus cortes, posición y proximidad a cada regla) más `reading`: régimen, ejes y afirmaciones ordenadas del mercado | read:indicators |
| `/market/depth` | GET | `side` | niveles `{price_band, cum_volume}` | read:depth |
| `/signals` | GET | `from, to, type, page` | señales con evidencia (`inputs`, `rule`, `calc_version`) | read:signals |
| `/health` | GET | — | estado por componente (sin detalles internos) | público |

Reglas transversales: paginación obligatoria en históricos; validación estricta de
fechas/intervalos; errores RFC 7807 sin detalles internos; rate limit por token
(headers `X-RateLimit-*`).

## WSS — `/ws/v1?token=<access_token>`
Spec formal: `apps/api-gateway/docs/asyncapi.yaml` (AsyncAPI 3.0). El token es el access
token de Auth0 (el navegador no puede fijar cabecera `Authorization` en el handshake
WebSocket). Se valida al conectar y en cada reconexión; la URL con el token se redacta en
logs. Mensaje de suscripción: `{"action":"subscribe","topics":["indicators","signals"]}`.
Tópicos permitidos (whitelist): `rates.official`, `p2p.snapshot`, `indicators`,
`signals`, `analysis`.

**Semántica del push (ADR-0016):** el servidor retransmite el **payload canónico del
evento del bus**, validado contra su schema, en el sobre
`{topic, event_id, occurred_at, data}` — sin proyecciones propias por tópico (una sola
fuente de verdad de contratos). Mapeo routing key → tópico:

| Tópico (server→client) | `data` = payload de | Contrato |
|---|---|---|
| `rates.official` | `official.rate.updated` | `schemas/official-rate.v1.json` |
| `p2p.snapshot` | `p2p.snapshot` | `schemas/p2p-snapshot.v1.json` |
| `indicators` | `indicators.updated` | `schemas/indicators.v1.json` |
| `signals` | `signals.emitted` | `schemas/signal.v1.json` |
| `analysis` | `analysis.updated` | `schemas/analysis.v1.json` |

Límites: ≤ 5 conexiones y ≤ 10 suscripciones por usuario (`sub`); ping del servidor cada
30 s; cierres 4401 (sin token/inválido/expirado), 4403 (sin `stream:events`), 1008
(límite de conexiones).

## Eventos internos (AMQP `market.events`, topic exchange)
| Routing key | Productor | Consumidor | Schema |
|---|---|---|---|
| `p2p.snapshot` | ingestor-binance | indicator-engine · api-gateway (push) | `schemas/p2p-snapshot.v1.json` (v1.1: `merchant_ref`, ADR-0011) |
| `official.rate.updated` | ingestor-bcv | indicator-engine · api-gateway (push) | `schemas/official-rate.v1.json` |
| `indicators.updated` | indicator-engine | api-gateway (push WSS) | `schemas/indicators.v1.json` |
| `signals.emitted` | indicator-engine | api-gateway (`GET /signals` + push WSS) | `schemas/signal.v1.json` (emitido RF-4/ADR-0015 · consumido 2026-07-26, ADR-0016) |
| `analysis.updated` | indicator-engine | api-gateway (`GET /analysis/current` + push WSS) | `schemas/analysis.v1.json` (RF-6/ADR-0019, ambos lados 2026-08-01; campo `reading` **aditivo** desde RF-7/ADR-0021) |

Todos los eventos llevan sobre: `{event_id, event_type, schema_version, occurred_at,
producer}` para idempotencia y trazabilidad (implementado así en ingestor-bcv e
indicator-engine; los schemas viven en `schemas/` en la raíz del repo). Eventos
inválidos → DLQ `market.events.dlq`.
