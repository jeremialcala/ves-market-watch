# Tests — api-gateway (pirámide AI-DLC)

- `unit/` — validación de inputs, políticas de scopes, generación/verificación JWT.
- `integration/` — rate limiting, lockout por fuerza bruta, expiración WSS (4401).
- `contract/` — respuestas REST vs. OpenAPI; eventos WSS vs. AsyncAPI.
- `e2e/` — flujo consumidor completo: token → REST → WSS push.
- `security/` — inyección en parámetros, tokens alterados, replay.
