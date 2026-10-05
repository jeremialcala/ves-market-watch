# Clasificación de Datos

- **Estado:** approved (Gate 0, HITL 2026-07-11)
- **Fecha:** 2026-07-11
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 00-project
- **Versión:** 0.2.0

Niveles: Público < Interno < Confidencial < Restringido.

| Dato | Clasificación | Regulación | Cifrado en reposo | Cifrado en tránsito | Retención |
|---|---|---|---|---|---|
| Tasa oficial BCV (VES/USD) | Público | N/A (dato oficial público) | No requerido | TLS 1.2+ | ≥ 12 meses (histórico) |
| Anuncios P2P: precio, cantidad, límites, métodos de pago | Público (origen) / Interno (agregado) | N/A | No requerido | TLS 1.2+ | Snapshots crudos 90 días; agregados ≥ 12 meses |
| Alias/nickname de anunciantes P2P | Interno | Potencial dato pseudónimo — minimizar | N/A | TLS 1.2+ | **No persistir** — resuelto 2026-07-06 (ADR-0011): `minimizar_crudo` redacta alias e identificadores crudos; solo se conservan `userType`, métricas públicas y el pseudónimo `merchant_ref` |
| Pseudónimo de anunciante `merchant_ref` (HMAC-SHA256, clave dedicada) | Interno | No reversible sin la clave (ADR-0011) | No requerido | TLS 1.2+ | 90 días con el crudo; agregados derivados (concentración, recurrencia) ≥ 12 meses |
| Clave HMAC de pseudonimización (`MERCHANT_HMAC_KEY`) | Restringido | ASVS V6 — sin rotación programada (ADR-0011) | Sí (secret store) | N/A | Vigencia del proyecto; rotar solo ante compromiso (rompe correlación histórica) |
| Indicadores y señales calculadas | Interno | N/A | No requerido | TLS 1.2+ | ≥ 12 meses |
| Lectura pública del portal (`/portal/v1`): el subconjunto de indicadores, señales y agregados P2P que muestra el Dashboard público | **Público** — reclasificado desde Interno el 2026-10-04 (ADR-0028) | N/A | No requerido | TLS 1.2+ | Lo que se sirve es la vista actual y ventanas fijas (24 h, 14 d, 30 d); la retención la fija el dato de origen. Solo agregados y por lista blanca: nunca `merchant_ref` ni cifras por anunciante |
| Identidad de usuarios (email, nombre, `sub` de Auth0) | Confidencial | Datos personales — minimizar; system of record = Auth0 (ADR-0012) | En Auth0 (fuera del sistema) | TLS 1.2+ | En Auth0; el gateway no la persiste (solo `sub` en logs de auditoría) |
| Credenciales de usuarios (contraseñas, MFA) | Restringido | Gestionadas por Auth0 — el sistema nunca las ve (ADR-0012) | En Auth0 | TLS 1.2+ | En Auth0 |
| Claves de firma JWT (privadas) | Restringido | ASVS V6 — gestionadas por Auth0 (ADR-0012); no son activo propio | En Auth0 | N/A | Rotación gestionada por Auth0 |
| Claves del acceso Comunidad: API key de Resend (solo envío, solo el subdominio de correo), secreto de Turnstile y, si se usa, secreto del cliente confidencial de Auth0 | Restringido | ASVS V6 (ADR-0029) | Sí (Auth0 o secret store, no en código) | TLS 1.2+ | Rotar ante compromiso o salida de quien las tenga |
| Secretos de infraestructura (DB, RabbitMQ) | Restringido | ASVS V6/V14 | Sí (secret store, no en código) | TLS 1.2+ | Rotación periódica |
| Logs de acceso a la API (IP, client_id, endpoint) | Confidencial | Datos personales (IP) — minimizar | Sí | TLS 1.2+ | 90 días |
| Logs operativos de ingesta | Interno | N/A | No requerido | TLS 1.2+ | 30 días |

Notas:
- El sistema no maneja pagos ni datos de salud. La identidad de usuarios (login) se delega
  a Auth0 (ADR-0012): el gateway procesa claims mínimos (`sub`, y `email` si el scope lo
  incluye) en tránsito y solo persiste `sub` en logs de auditoría. La superficie regulada se
  limita a IPs en logs y a esa identidad pseudónima.
- Minimización: no almacenar datos de anunciantes que no alimenten un indicador.
