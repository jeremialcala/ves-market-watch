# Clasificación de Datos

Niveles: Público < Interno < Confidencial < Restringido.

| Dato | Clasificación | Regulación | Cifrado en reposo | Cifrado en tránsito | Retención |
|---|---|---|---|---|---|
| Tasa oficial BCV (VES/USD) | Público | N/A (dato oficial público) | No requerido | TLS 1.2+ | ≥ 12 meses (histórico) |
| Anuncios P2P: precio, cantidad, límites, métodos de pago | Público (origen) / Interno (agregado) | N/A | No requerido | TLS 1.2+ | Snapshots crudos 90 días; agregados ≥ 12 meses |
| Alias/nickname de anunciantes P2P | Interno | Potencial dato pseudónimo — minimizar | No requerido | TLS 1.2+ | **No persistir** salvo necesidad analítica `<TODO: confirmar>` |
| Indicadores y señales calculadas | Interno | N/A | No requerido | TLS 1.2+ | ≥ 12 meses |
| Credenciales de consumidores (client_id/secret OAuth2) | Restringido | Buenas prácticas ASVS V2 | Hash (argon2/bcrypt) | TLS 1.2+ | Mientras el consumidor esté activo |
| Claves de firma JWT (privadas) | Restringido | ASVS V6 | Sí (KMS/secret store) | N/A | Rotación ≤ 90 días |
| Secretos de infraestructura (DB, RabbitMQ) | Restringido | ASVS V6/V14 | Sí (secret store, no en código) | TLS 1.2+ | Rotación periódica |
| Logs de acceso a la API (IP, client_id, endpoint) | Confidencial | Datos personales (IP) — minimizar | Sí | TLS 1.2+ | 90 días |
| Logs operativos de ingesta | Interno | N/A | No requerido | TLS 1.2+ | 30 días |

Notas:
- El sistema no maneja pagos, PII de usuarios finales ni datos de salud. La superficie
  regulada se limita a IPs en logs y credenciales de consumidores.
- Minimización: no almacenar datos de anunciantes que no alimenten un indicador.
