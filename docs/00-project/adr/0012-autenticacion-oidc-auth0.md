# ADR-0012: Autenticación OIDC (Authorization Code + PKCE) con Auth0; api-gateway como Resource Server

- **Estado:** accepted
- **Fecha:** 2026-07-07
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 02-design
- **Controles OWASP afectados:** A07 (identificación y autenticación), A01 (control de acceso), A02 (fallas criptográficas — delegadas), A04 (diseño seguro)
- **Supersede a:** ADR-0003

## Contexto
ADR-0003 asumió consumidores **máquina-a-máquina** y que el propio api-gateway fuera el
Authorization Server: emitía JWT vía `client_credentials` en `/auth/token`, almacenaba
secrets de cliente (argon2id) y rotaba las claves de firma. La decisión de acceso a la data
cambió (2026-07-07): los consumidores serán **usuarios humanos** que inician sesión, no solo
aplicaciones. Esto exige una capa de **identidad** (OIDC) además de autorización (OAuth2):
login, gestión de usuarios, recuperación de contraseña, MFA y protección contra ataques.
Construir y operar todo eso in-house (IdP casero) es costoso y de alto riesgo. Se decide
delegar identidad y autorización a **Auth0** (OpenID Provider gestionado); el gateway deja
de emitir tokens y pasa a ser **Resource Server** que solo los valida.

## Decisión
- **Flujo:** OIDC **Authorization Code + PKCE** desde un cliente público (front-end/SPA)
  contra la Universal Login de Auth0. Auth0 emite un **ID token** (identidad, para el
  front-end) y un **access token** JWT (autorización, `aud` = la API de VMW).
- **Validación en el gateway (Resource Server):** valida el **access token** (nunca el ID
  token) en cada request. Firma **RS256** verificada contra el **JWKS** de Auth0 (cache por
  `kid`), y verificación estricta de `iss` (tenant), `aud` (identificador de la API),
  `exp`/`nbf` y `azp`. Rechaza tokens cuya audiencia no sea la API → evita usar el ID token
  como bearer (confused deputy).
- **Autorización:** se define una API en Auth0 (audience, p. ej. `https://api.vesmarketwatch/`)
  cuyos permisos mapean a los scopes existentes: `read:rates`, `read:indicators`,
  `read:signals`, `read:depth`, `stream:events`. El RBAC de Auth0 asigna permisos por rol
  (`viewer`, `operator`); viajan en el claim `permissions`/`scope` y el gateway autoriza por
  endpoint/tópico.
- **WSS:** el token viaja como `?token=<access_token>` en el handshake (los navegadores no
  permiten cabecera `Authorization` en WebSocket); se valida al conectar y en cada
  reconexión, con cierre `4401` al expirar. La URL con el token **nunca se registra** (se
  redacta en logs).
- **Config del gateway** (todo público, sin secretos de firma): `AUTH0_DOMAIN`,
  `AUTH0_ISSUER`, `AUTH0_AUDIENCE`, `JWKS_URI`. No requiere `client_secret` para validar.
- **Se retira del gateway:** endpoint `/auth/token`, almacenamiento de secrets de cliente
  (argon2id), `KeyStore` de claves de firma JWT y su rotación ≤ 90 d, y la tabla
  `api_clients`. Esas responsabilidades pasan a Auth0.
- **Vigencia:** access token de vida corta (≤ 15 min); refresh token con rotación gestionado
  por Auth0/SPA. MFA y attack protection (brute-force, breached-password, bot detection) se
  habilitan en el tenant.

## Alternativas consideradas
| Opción | Pros | Contras | Riesgo de seguridad |
|---|---|---|---|
| Auth0 OIDC Auth Code+PKCE (elegida) | Identidad gestionada (login, MFA, recuperación, attack protection); estándar; gateway sin claves de firma ni secrets de cliente; menos superficie propia | Dependencia de proveedor externo (lock-in, costo por MAU, disponibilidad); la config del tenant es un activo crítico | Bajo si el tenant se configura bien |
| Gateway como Authorization Server propio (ADR-0003) | Sin dependencia externa; control total | Construir/operar login, MFA, recuperación, rotación de claves y attack protection; mucha superficie propia | Medio-alto (IdP casero) |
| Keycloak auto-hospedado (OIDC) | Open source, sin costo de licencia, control | Operación, hardening, parches y alta disponibilidad a nuestro cargo | Medio |
| Solo M2M `client_credentials` (sin identidad humana) | Simple, ya diseñado | No cubre usuarios humanos con login — no cumple el requisito | N/A (no cumple) |

## Consecuencias
- Positivas: identidad humana con login/MFA/recuperación sin construirlos; gateway stateless
  sin claves de firma ni secrets de cliente (elimina la parte JWT de T6 y el `/auth/token`
  propio de T3); autorización por roles/permisos centralizada; onboarding de usuarios en Auth0.
- Negativas / deuda asumida: dependencia de Auth0 (disponibilidad, costo por MAU, lock-in),
  mitigable con abstracción OIDC estándar (issuer/JWKS/discovery) que permite migrar a otro
  OP; nueva **PII de usuarios** (`email`, `sub`) entra al alcance regulatorio (ver
  `data-classification.md`); requiere un front-end/SPA (cliente público) que hoy no existe;
  la config del tenant (allowlist de `redirect_uri`, audiencia, RBAC, attack protection) es
  un activo crítico de configuración.
- Impacto en threat model: reencuadra T3 (login ahora en Auth0 con attack protection
  gestionada) y reduce T6 (Auth0 gestiona las claves de firma). Añade T11 (uso de ID token /
  token de otra audiencia como bearer, mitigado por validación estricta de `aud`/`iss`) y la
  amenaza de robo de token en el navegador vía XSS (token en memoria, vida corta; el SPA está
  fuera de este repo). Introduce a **Auth0** como nuevo sistema externo y límite de confianza
  (browser↔Auth0, gateway↔JWKS de Auth0).
