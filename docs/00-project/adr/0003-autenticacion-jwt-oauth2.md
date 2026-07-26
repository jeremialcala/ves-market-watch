# ADR-0003: OAuth2 client credentials + JWT para consumidores de API/WSS

- **Estado:** superseded by ADR-0012
- **Fecha:** 2026-07-05
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 02-design
- **Controles OWASP afectados:** A01, A02, A04, A07

> **Superada (2026-07-07) por [ADR-0012](0012-autenticacion-oidc-auth0.md):** el acceso pasó
> de máquina-a-máquina a **usuarios humanos** con login OIDC. El Authorization Server ya no
> es el propio gateway sino **Auth0**; el gateway pasa a ser Resource Server (solo valida
> tokens). Se conserva este documento por trazabilidad histórica.

## Contexto
Las aplicaciones consumidoras (machine-to-machine) necesitan autenticación con scopes y
revocación, tanto en REST como en WSS. Elegido por el usuario frente a API keys simples.

## Decisión
OAuth2 grant `client_credentials` emitiendo JWT firmado asimétricamente (RS256 o EdDSA),
expiración ≤ 15 min, con scopes (`read:*`, `stream:events`). Secrets de cliente hasheados
con argon2id. Claves de firma en secret store con rotación ≤ 90 días y `kid` en header
para rotación sin corte. En WSS, el token se valida al conectar y en cada reconexión.

## Alternativas consideradas
| Opción | Pros | Contras | Riesgo de seguridad |
|---|---|---|---|
| OAuth2 + JWT (elegida) | Estándar, scopes, expiración corta, stateless en gateway | Más piezas (emisión, rotación de claves) | Bajo si la gestión de claves es correcta |
| API Key estática | Simple | Sin expiración; revocación torpe; viaja en cada request | Medio |
| mTLS | Fuerte | Operación de certificados pesada para pocos consumidores | Bajo pero costoso |

## Consecuencias
- Positivas: revocación por client_id, scopes por tópico/endpoint, replay acotado por exp corto.
- Negativas / deuda asumida: gestión de credenciales manual en fase inicial (sin portal).
- Impacto en threat model: mitiga T3 (stuffing, junto a rate limit) y elevación entre consumidores.
