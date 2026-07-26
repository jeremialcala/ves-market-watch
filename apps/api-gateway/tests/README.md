# Tests — api-gateway (pirámide AI-DLC, 78 tests)

```bash
python -m pytest tests -q            # unit + contract siempre; integration/e2e
                                     # se saltan con instrucciones si no hay infra
docker compose up -d --wait          # (raíz del repo) habilita integration/e2e
```

- `unit/` — dominio y políticas sin infraestructura: paginación y rango ≤ 90 días,
  rate limit (reloj inyectado), profundidad por bandas, gestor de suscripciones
  (whitelist y límites 5/10), validación de tokens (expirado, audiencia ajena =
  ID token, issuer ajeno, alg ≠ RS256, kid desconocido, fallback `scope`) y el
  protocolo WSS in-process (4401/4403/1008, subscribe/error, expiración en sesión).
- `contract/` — cada respuesta REST (200 y errores RFC 7807) validada contra los
  schemas de `docs/openapi.yaml` (OpenAPI 3.1 = JSON Schema 2020-12); cabeceras
  `X-RateLimit-*`, 429 con `Retry-After`, 404 sin datos.
- `integration/` — repositorio contra TimescaleDB real (última tasa `valid`, una
  fila por día, time_bucket, señales con evidencia; **INSERT rechazado por el pool
  read-only**) y consumidor de push contra RabbitMQ real (evento válido llega al
  suscriptor; inválido contra su schema se descarta).
- `e2e/` — app completa contra DB y bus reales: `/health` todo ok, REST autenticado
  sirve lo sembrado conforme al contrato, y un `signals.emitted` publicado en el
  bus llega como frame por el WSS suscrito.

La autenticación de tests usa un par RSA propio expuesto como JWKS estático
(`soporte_auth.py`): misma ruta de validación que producción, sin red ni Auth0.
Los markers `integration`/`e2e` hacen probe y skip elegante sin infraestructura.
