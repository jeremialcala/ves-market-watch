# Diseño — api-gateway

- **Estado:** approved (implementado y verificado en vivo 2026-07-26; ADR-0012 + ADR-0016)
- **Fecha:** 2026-07-26
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 03-implementation
- **Versión:** 0.4.0

Rol: **Resource Server** (OIDC/OAuth2). La identidad y la emisión de tokens viven en Auth0
(ADR-0012); el gateway solo **valida** access tokens y autoriza por scopes/permisos.
Decisiones de implementación (cola efímera de push, payload canónico, read-only,
rate limit in-memory, profundidad interim): **ADR-0016**.

## Capas (hexagonal, `src/api_gateway/`)
- **Dominio** (`domain/`): `Usuario` (sub, permisos del claim `permissions`, `exp`),
  paginación y rango ≤ 90 días (`paginacion.py`), rate limit de ventana fija con
  reloj inyectable (`rate_limit.py`), profundidad por bandas de 0,5 % desde el
  mejor precio (`profundidad.py`, pura) y errores propios (`errores.py`).
- **Aplicación** (`application/`): puertos `TokenValidator` y `LecturaRepository`
  (`ports.py`); casos de uso de lectura que arman las respuestas del contrato con
  frescura (`consultas.py` — un indicador P2P más viejo que `P2P_FRESCURA_MIN` no
  se sirve como vigente); `GestorSuscripciones` WSS (whitelist de tópicos, límites
  por `sub`, difusión best-effort — `suscripciones.py`).
- **Adaptadores** (`adapters/`):
  - `auth/jwks.py` — `ValidadorTokenAuth0`: RS256 vía JWKS con cache por `kid` y
    refresco acotado (≥ 60 s entre fetches); exige `aud` = API e `iss` = tenant —
    un ID token o un token ajeno falla (T11); el motivo del rechazo se loguea,
    nunca se responde.
  - `timescale/repository.py` — asyncpg de **solo lectura**
    (`default_transaction_read_only=on`, T9); queries parametrizadas; numeric →
    string exacto; `DISTINCT ON` para «última fila por día/indicador»;
    `time_bucket` + `last()` para el histórico agregado.
  - `amqp/consumer.py` — cola **efímera** (exclusiva, auto-delete) sobre
    `market.events` con bind a los 4 routing keys; valida cada evento contra su
    schema (`schemas/`) y difunde `{topic, event_id, occurred_at, data}`.
    **Auto-recuperable** (2026-07-30): si el bus no está al arrancar, un
    supervisor reintenta con backoff exponencial + jitter hasta conectar; una
    vez conectado, la `RobustConnection` re-declara cola, bindings y consumidor.
    Cada transición (caída / restablecimiento) emite **una** alerta por episodio
    vía `AlertNotifier` (`adapters/alertas.py`, CRITICAL en log).
  - `http/` — FastAPI: REST (`rest.py`, cadena token → permiso → rate limit por
    endpoint), WSS (`ws.py`, cierres 4401/4403/1008, ping 30 s, cierre programado
    al `exp` del token) y problemas RFC 7807 (`problem.py`).
- **Arranque** (`app.py`, `__main__.py`): fábrica con inyección para tests; si el
  broker falta al arrancar, REST sirve igual, `/health` reporta `degraded` y el
  push WSS se engancha solo en cuanto el bus vuelva (sin reinicio); el access log
  redacta `token=` de la query del handshake WSS.

## Seguridad
- Validación del access token: firma RS256 vía JWKS de Auth0; verifica `iss` (tenant),
  `aud` (=API), `exp`/`nbf`. Rechaza el ID token y tokens de otra audiencia (T11).
- Sin secrets de cliente ni claves de firma propias: gestión delegada a Auth0.
- Autorización por claim `permissions`/`scope` (Auth0 RBAC), por endpoint/tópico.
- Validación estricta de inputs (fechas/intervalos/tópicos whitelisted); queries
  parametrizadas + pool de solo lectura (T9, defensa en profundidad).
- Límites WSS: ≤ 5 conexiones y ≤ 10 suscripciones por usuario (`sub`); cierre 4401 al
  expirar token; el token de `?token=` no se registra en logs.
- Rate limit por `sub` (ventana fija 60 s, `X-RateLimit-*`, 429 + `Retry-After`) — T4.
- **CORS por allowlist** (2026-07-27, ADR-0017): env `ALLOWED_ORIGINS` (default
  `http://localhost:5173,http://localhost:8080` — el web-spa en dev y en nginx),
  solo `GET`, header `Authorization`, sin credentials, `expose_headers` para
  `X-RateLimit-*`/`Retry-After` (T15). El WSS no pasa por CORS (browsers no lo
  aplican); validar `Origin` en el handshake queda como hardening futuro.
- Logging de seguridad: authN fallida (motivo solo en log), rate limits (sin PII; solo `sub`).

## Tenant Auth0 (aprovisionado 2026-07-14)

Tenant de desarrollo: `dev-higerotech.us.auth0.com` (config pública por diseño, ADR-0012 —
no hay secretos de firma del lado del gateway).

| Recurso | Valor |
|---|---|
| API (Resource Server) | `VES Market Watch API` — id `6a56683fbcee12f7916916ae` |
| Audience | `https://api.vesmarketwatch/` |
| Firma / vigencia | RS256; access token 900 s (también `token_lifetime_for_web`); sin offline access |
| RBAC | `enforce_policies: true`, `token_dialect: access_token_authz` (permisos viajan en el claim `permissions`) |
| Permisos | `read:rates`, `read:indicators`, `read:signals`, `read:depth`, `stream:events` |
| Rol `viewer` (`rol_04JPNH53SrEU3ybX`) | Los 5 permisos (todo el catálogo actual es de solo lectura/streaming) |
| Rol `operator` (`rol_WqmKgWUWzfl8ICD9`) | Los mismos 5; se diferenciará con el permiso admin de re-validación HITL (ADR-0007) cuando exista |
| Attack protection | Brute-force: block+user_notification, 10 intentos · Breached-password: block+admin_notification (inmediata) · Suspicious-IP throttling: block+admin_notification |

Config del gateway (variables de entorno, todas públicas):

```env
AUTH0_DOMAIN=dev-higerotech.us.auth0.com
AUTH0_ISSUER=https://dev-higerotech.us.auth0.com/
AUTH0_AUDIENCE=https://api.vesmarketwatch/
JWKS_URI=https://dev-higerotech.us.auth0.com/.well-known/jwks.json
```

## Contratos
- **REST:** `docs/openapi.yaml` (OpenAPI 3.1, validada con `openapi-spec-validator`).
  8 endpoints `/api/v1`, seguridad OAuth2 con los 5 scopes; ajustes al implementarse:
  `currency` opcional en tasa oficial, 404 en los «current» sin datos, `spread_pct`
  (la microestructura real del engine) en lugar de spreads por lado inexistentes.
- **WSS:** `docs/asyncapi.yaml` (AsyncAPI 3.0, 2026-07-26 — cierra el TODO): canal
  `/ws/v1`, mensajes subscribe/unsubscribe/subscribed/error/ping y push con el
  payload canónico de los eventos referenciando `schemas/` (sin duplicar contratos).

## Verificación
- **90 tests** en verde: unit (dominio + validador con JWKS RSA local propio),
  contract (respuestas vs. `openapi.yaml`, errores RFC 7807), integration
  (TimescaleDB y RabbitMQ reales; INSERT rechazado por el pool read-only) y e2e
  (REST autenticado + `signals.emitted` del bus → frame WSS). Ver `tests/README.md`.
- **En vivo** (compose raíz, puerto host 8800): `/api/v1/health` →
  `{"status":"ok","components":{"database":"ok","broker":"ok","auth":"ok"}}` con la
  plataforma completa corriendo, y 401 `problem+json` sin token contra el tenant real.
  Corte forzado de la conexión del gateway (`rabbitmqctl close_connection`,
  2026-07-30): alerta de caída inmediata, **restablecido en 28 ms** con la cola
  efímera, sus 4 bindings y el consumidor restaurados (verificado con
  `rabbitmqctl list_queues`/`list_bindings`) — el resto de servicios sin tocar.

## Pendiente
- `<TODO: aprovisionar en el tenant Auth0 la app SPA (cliente público, Auth Code + PKCE) que
  consume este gateway — el front-end ya existe (`apps/web-spa`, ADR-0017), falta su client_id;
  client M2M de prueba para el e2e autenticado en vivo (HITL); MFA del tenant se decide cuando
  haya usuarios reales>`
