# PRD — API REST y Streaming WSS

- **Fase AI-DLC:** 01-requirements
- **Estado:** review

## Problema y contexto
Las aplicaciones externas necesitan consumir tanto el histórico (REST) como los eventos e
indicadores en tiempo real (WSS), con autenticación y límites de uso.

## Objetivos / No-objetivos
- Objetivos: API REST versionada para tasas, indicadores, profundidad, señales e
  histórico; canal WSS con suscripción por tópicos; authN/Z JWT (OAuth2 client credentials).
- No-objetivos: portal de desarrolladores/self-service de credenciales (fase posterior);
  facturación por uso.

## Usuarios y escenarios
Usuarios: aplicaciones consumidoras registradas (client_id/secret).

### Escenarios positivos
1. Consumidor obtiene token (`POST /auth/token`, client credentials) y consulta
   `GET /api/v1/indicators/current`.
2. Consumidor abre WSS con token, se suscribe a `indicators` y `signals`, y recibe eventos
   push en tiempo real.
3. Consumidor consulta histórico con paginación y agregación por intervalo.

### Escenarios negativos / abuso (requerido por Gate 0)
1. **Token expirado/alterado**: firma inválida → 401; sin información de diagnóstico
   interna en la respuesta (A07).
2. **Credential stuffing / fuerza bruta en /auth/token**: rate limiting agresivo por IP y
   client_id, bloqueo temporal con backoff, alerta (A07, A09).
3. **Scraping masivo del histórico**: rate limit por token, paginación obligatoria,
   límites de rango de fechas por request (DoS, A10).
4. **Conexiones WSS zombies o flooding de suscripciones**: máximo de conexiones y
   suscripciones por client_id; heartbeat/ping con desconexión por inactividad (A10).
5. **Inyección en parámetros de consulta** (fechas, intervalos, tópicos): validación
   estricta de tipos y whitelisting de tópicos; queries parametrizadas (A05).
6. **Elevación entre consumidores**: scopes por token (`read:indicators`, `read:signals`);
   un consumidor no puede administrar ni ver credenciales de otros (A01).
7. **Replay de tokens en WSS**: expiración corta + validación de `exp` en cada reconexión;
   revocación por `client_id` (A07).

## Requisitos funcionales
- RF-1: Endpoints REST versionados (ver `docs/02-design/api-contracts.md`).
- RF-2: WSS con suscripción por tópicos: `rates.official`, `p2p.snapshot`, `indicators`, `signals`.
- RF-3: OAuth2 client credentials → JWT firmado (RS256/EdDSA), expiración ≤ 15 min.
- RF-4: Rate limiting por token y por IP; cuotas configurables por consumidor.
- RF-5: Respuestas con metadatos de frescura (`as_of`, `official_stale`, `confidence`).

## Requisitos de seguridad (mapeados a OWASP ASVS)
| Req | ASVS | Nivel | OWASP Top 10 |
|---|---|---|---|
| OAuth2 client credentials + JWT firmado asimétrico | V2/V3 | L2 | A07 |
| Scopes y autorización por endpoint/tópico | V4 | L2 | A01 |
| Validación estricta de inputs (fechas, intervalos, tópicos) | V5 | L1 | A05 |
| Rate limiting y cuotas por token/IP; límites WSS | V11 | L2 | A10 |
| TLS 1.2+ obligatorio (HSTS); WSS sobre TLS | V9 | L1 | A04 |
| Secretos de clientes hasheados (argon2); claves JWT en secret store con rotación | V6 | L2 | A02, A04 |
| Logging de seguridad: authN fallida, rate limit, tokens revocados | V16 | L2 | A09 |
| Errores uniformes sin stack traces ni detalles internos | V10 | L1 | A10 |

## Métricas de éxito
- Latencia REST ≤ 300 ms (p95) para consultas actuales; ≤ 2 s para histórico.
- Push WSS ≤ 1 s desde publicación interna del indicador.
- 100 % de endpoints cubiertos por contrato OpenAPI/AsyncAPI.

## Dependencias y riesgos
- Depende de: motor de indicadores, TimescaleDB, esquema de eventos, ADR-0003 (JWT).
- Riesgo: gestión manual de credenciales de consumidores en fase inicial (HITL).
