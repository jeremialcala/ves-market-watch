# Diseño — api-gateway

## Capas
- **Dominio:** `Consumidor`, `Token`, `Suscripción`; políticas de scopes y cuotas.
- **Casos de uso:** `EmitirToken`, `ConsultarIndicadores`, `ConsultarHistorico`, `GestionarSuscripciónWSS`.
- **Puertos:** `ClientRepository`, `IndicatorReadRepository`, `EventConsumer` (push WSS), `KeyStore`.
- **Adaptadores:** FastAPI (REST+WSS), asyncpg (solo lectura + api_clients), aio-pika, secret store.

## Seguridad
- Secrets de cliente: argon2id. Claves JWT con `kid` y rotación ≤ 90 días.
- Validación estricta de inputs (fechas/intervalos/tópicos whitelisted); queries parametrizadas.
- Límites WSS: ≤ 5 conexiones y ≤ 10 suscripciones por client_id; cierre 4401 al expirar token.
- Logging de seguridad: authN fallida, rate limits, revocaciones (sin PII innecesaria).

## Pendiente (fase 03)
- `<TODO: elegir secret store concreto (Vault / variables cifradas / KMS)>`
- `<TODO: especificación OpenAPI 3.1 y AsyncAPI generadas desde api-contracts.md>`
