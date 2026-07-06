# Diseño del Sistema — VES Market Watch

## Estilo arquitectónico
Microservicios ligeros con **Clean Architecture** por servicio: dominio en el centro,
casos de uso, y adaptadores (HTTP, AMQP, DB) en el borde. Regla de dependencia: el dominio
no conoce infraestructura. Comunicación entre servicios **event-driven** vía RabbitMQ
(topic exchange `market.events`); el api-gateway es el único punto de entrada externo.

## Contextos acotados (DDD)
| Bounded Context | Servicio | Responsabilidad | Entidades núcleo |
|---|---|---|---|
| Ingesta P2P | `ingestor-binance` | Capturar y normalizar anuncios P2P | Anuncio, SnapshotP2P, Lado |
| Ingesta Oficial | `ingestor-bcv` | Capturar y validar tasa oficial | TasaOficial |
| Indicadores | `indicator-engine` | Calcular indicadores y señales | Indicador, Señal, PrecioReferencia, Profundidad |
| Acceso | `api-gateway` | AuthN/Z, REST, WSS, rate limiting | Consumidor, Token, Suscripción |

## Flujo de datos
```
Binance P2P ──HTTPS──> ingestor-binance ──p2p.snapshot──────┐
                                                            ├─> RabbitMQ (market.events) ──> indicator-engine
Sitio BCV  ──HTTPS──> ingestor-bcv ──official.rate.updated──┘                                   │
                                                                    indicators.updated / signals.emitted
                                                                                                │
TimescaleDB <── persistencia (snapshots, tasas, indicadores) <──────────────────────────────────┤
                                                                                                v
Apps consumidoras <──REST/WSS (JWT)── api-gateway <─────────────────────────────────────────────┘
```

## Vista C4
Ver `docs/architecture/c4-context.md` y `c4-container.md` (Mermaid, con trust boundaries).

## Contratos de API
Ver `docs/02-design/api-contracts.md` (REST + eventos WSS/AMQP).

## Persistencia (TimescaleDB — ADR-0002)
| Tabla (hypertable) | Contenido | Retención | Estado |
|---|---|---|---|
| `official_rates` | Tasas BCV multi-moneda: valor, fecha-valor, captured_at, status (ADR-0007), auditoría HITL | ≥ 12 meses | ✔ implementada |
| `official_rate_source_health` | Salud de la fuente BCV (fallos consecutivos, stale_since) | vigencia | ✔ implementada |
| `p2p_snapshots_raw` | Snapshot crudo (JSONB, anunciante minimizado) por lado | 90 días (nativa) | ✔ implementada |
| `indicators` | Indicadores calculados con calc_version (formato largo) | ≥ 12 meses | ✔ implementada |
| `processed_events` | Idempotencia del consumidor del engine | vigencia | ✔ implementada |
| `p2p_top_of_book` | Mejor precio/volúmenes por snapshot | ≥ 12 meses | planificada |
| `signals` | Señales emitidas con evidencia | ≥ 12 meses | planificada |
| `api_clients` | Consumidores OAuth2 (secret hasheado) | vigencia | planificada |

Migraciones por servicio en `apps/<servicio>/db/migrations/` (montadas en el init del
`docker-compose.yml`). Agregados continuos 5 min / 1 h / 1 d para intradía: planificados.

## Patrones de seguridad seleccionados (por amenaza DREAD priorizada)
| Amenaza | Patrón / Control | OWASP |
|---|---|---|
| T1 Tasa oficial falsa (MITM/parse) | TLS anclado + validación de rango + estado `suspect` | A04, A08 |
| T2 Datos P2P manipulados | Filtro outliers (MAD/IQR) + `low_confidence` + supresión de señales | A08 |
| T3 Credential stuffing en /auth/token | Rate limit + lockout con backoff + logging de seguridad | A07, A09 |
| T4 DoS API/WSS | Cuotas por token/IP, límites de conexión WSS, paginación obligatoria | A10 |
| T5 Eventos inválidos en el bus | Schema validation + DLQ + usuarios AMQP con permisos mínimos por servicio | A05, A08, A01 |
| T6 Fuga de secretos | Secret store, rotación, secrets scanning en CI | A02, A04 |
| T7 Baneo por abuso a Binance | Circuit breaker + backoff + presupuesto de requests | A10 |
| T8 Supply chain (deps) | Lockfiles + SCA + imágenes base fijadas por digest | A03 |
