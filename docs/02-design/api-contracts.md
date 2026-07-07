# Contratos de API — VES Market Watch

Los contratos de **eventos** ya son formales: JSON Schema 2020-12 en `schemas/` (raíz),
verificados por contract tests en productor y consumidor. Las tablas REST/WSS de abajo
siguen siendo esqueleto: la especificación OpenAPI 3.1 formal se generará con el
api-gateway.

## Autenticación
| Endpoint | Método | Request | Response | Auth |
|---|---|---|---|---|
| `/auth/token` | POST | `grant_type=client_credentials`, `client_id`, `client_secret` | `{access_token, token_type, expires_in}` JWT RS256, exp ≤ 15 min | Basic (client) |

Scopes: `read:rates`, `read:indicators`, `read:signals`, `read:depth`, `stream:events`.

## REST — `/api/v1` (Bearer JWT)
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

## WSS — `/ws/v1?token=<JWT>`
Mensaje de suscripción: `{"action":"subscribe","topics":["indicators","signals"]}`
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
| `signals.emitted` | indicator-engine | api-gateway | `schemas/signal.v1.json` (pendiente — engine fase 2) |

Todos los eventos llevan sobre: `{event_id, event_type, schema_version, occurred_at,
producer}` para idempotencia y trazabilidad (implementado así en ingestor-bcv e
indicator-engine; los schemas viven en `schemas/` en la raíz del repo). Eventos
inválidos → DLQ `market.events.dlq`.
