# Threat Model — VES Market Watch (sistema completo)

- **Alcance:** sistema completo (4 servicios + RabbitMQ + TimescaleDB)
- **Fecha / versión:** 2026-07-05 / v1
- **Clasificación de datos:** ver `docs/00-project/data-classification.md`

## Diagrama de flujo de datos
Ver `docs/architecture/c4-container.md` — trust boundaries marcados:
Internet↔gateway, fuentes externas↔ingestores, servicios↔broker, servicios↔DB.

## Análisis STRIDE
| Componente | Spoofing | Tampering | Repudiation | Info Disclosure | DoS | Elevation |
|---|---|---|---|---|---|---|
| ingestor-binance | Endpoint P2P suplantado (MITM) | Anuncios manipulados / respuesta alterada | Sin registro de snapshots capturados | — (datos públicos) | Baneo/429 de Binance; payloads gigantes | — |
| ingestor-bcv | Dominio BCV suplantado (DNS/MITM) | Tasa falsa inyectada; HTML alterado | Sin auditoría de tasas capturadas | — | Caída del sitio BCV; parser roto | — |
| RabbitMQ | Servicio se conecta con credencial ajena | Eventos inválidos/malformados publicados | Publicaciones sin trazabilidad | Credenciales AMQP filtradas | Tormenta de eventos; colas llenas | Usuario AMQP con permisos excesivos |
| indicator-engine | — | Datos envenenados → señales falsas; duplicados/reorden | Señal sin evidencia de inputs | — | Backlog de eventos | — |
| api-gateway | Tokens falsificados; credential stuffing | Manipulación de parámetros de consulta | Accesos sin log | Errores verbosos; enumeración de clients | Flood REST/WSS; scraping histórico | Consumidor accede a scopes ajenos |
| TimescaleDB | Conexión con rol ajeno | SQL injection vía parámetros | Cambios sin auditoría | Dump de credenciales de clientes | Consultas de histórico sin límites | Rol de servicio con privilegios amplios |

## Amenazas priorizadas (DREAD)
Escala 1–3 por factor (Damage, Reproducibility, Exploitability, Affected users, Discoverability). Score = suma.

| ID | Amenaza | D | R | E | A | D | Score | Control / ADR |
|---|---|---|---|---|---|---|---|---|
| T1 | Tasa oficial falsa entra al sistema (MITM/parse erróneo del BCV) | 3 | 2 | 2 | 3 | 2 | 12 | TLS anclado + validación de rango + estado `suspect` — ADR-0006, A04/A08 |
| T2 | Anuncios P2P manipulados distorsionan indicadores y señales | 3 | 3 | 3 | 3 | 3 | 15 | Filtro outliers MAD/IQR, mediana/VWAP top-N, `low_confidence` — A08; recurrencia de manipuladores rastreable vía `merchant_ref` — ADR-0011 |
| T3 | Credential stuffing / fuerza bruta contra /auth/token | 2 | 3 | 3 | 2 | 3 | 13 | Rate limit + lockout + secrets hasheados argon2 — ADR-0003, A07 |
| T4 | DoS sobre API/WSS (flood, scraping de histórico) | 2 | 3 | 3 | 3 | 3 | 14 | Cuotas por token/IP, límites WSS, paginación y rangos máximos — A10 |
| T5 | Eventos malformados/inyectados en el bus rompen el engine | 3 | 2 | 2 | 3 | 2 | 12 | Schema validation + DLQ + usuarios AMQP mínimos — ADR-0004, A05/A01 |
| T6 | Fuga de secretos (claves JWT, credenciales DB/AMQP) | 3 | 1 | 2 | 3 | 2 | 11 | Secret store + rotación ≤ 90 d + secrets scanning CI — A02/A04 |
| T7 | Baneo de IP por Binance por polling agresivo | 3 | 2 | 3 | 3 | 3 | 14 | Circuit breaker + backoff + presupuesto de requests — ADR-0005, A10 |
| T8 | Compromiso de dependencia (supply chain) en cualquier servicio | 3 | 1 | 2 | 3 | 2 | 11 | Lockfiles + SCA en CI + imágenes por digest — A03 |
| T9 | SQL injection vía parámetros de histórico en gateway | 3 | 2 | 2 | 3 | 3 | 13 | Queries parametrizadas + validación estricta de inputs — A05 |
| T10 | Señales sin trazabilidad (repudio/no reproducibles) | 2 | 3 | 2 | 2 | 2 | 11 | Evidencia de inputs + `calc_version` + logging estructurado — A09; forense de anunciantes entre snapshots vía `merchant_ref` — ADR-0011 |

## Controles y trazabilidad
| Amenaza | Control | Verificación (fase 04-testing) |
|---|---|---|
| T1 | ADR-0006; validación de rango en PRD ingesta-bcv RF-3 | Test de integración con fixture de HTML alterado y tasa fuera de rango |
| T2 | PRD motor-indicadores escenario negativo 1; ADR-0011 | Etiquetado MAD verificado en ingestor-binance (unit tests + dato real); filtrado final con snapshots sintéticos manipulados en engine fase 2 |
| T3 | ADR-0003; PRD api-streaming escenarios 2 y 7 | Test de rate limit y lockout; revisión de logs de seguridad |
| T4 | PRD api-streaming RF-4 | Test de carga con exceso de cuota; fuzzing de paginación |
| T5 | ADR-0004; PRD motor-indicadores escenario 4 | Test contract de eventos + inyección de evento inválido → DLQ |
| T6 | Política de secretos (data-classification) | Secrets scanning en CI; revisión de rotación |
| T7 | ADR-0005 | Simulación de 429 → verificación de circuit breaker |
| T8 | Pipeline CI (Gate 2) | SCA con umbral de severidad |
| T9 | PRD api-streaming escenario 5 | SAST + tests de inyección |
| T10 | PRD motor-indicadores RF-3 | Auditoría de una señal end-to-end |
