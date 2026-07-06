# PRD — Ingesta Binance P2P (VES/USDT)

- **Fase AI-DLC:** 01-requirements
- **Estado:** accepted — implementado en `apps/ingestor-binance` (2026-07-06).
  RF-6 (métricas operativas) cubierto con logs estructurados por ciclo; su export
  a un sistema de métricas queda para fase 05-deployment.

## Problema y contexto
Para medir el mercado paralelo se necesita capturar de forma continua los anuncios P2P
de Binance para el par USDT/VES (ambos lados), con la menor latencia posible y sin
provocar bloqueos por abuso del endpoint.

## Objetivos / No-objetivos
- Objetivos: captura continua de anuncios (precio, cantidad, límites, bancos, métodos de
  pago), normalización a un modelo interno, publicación de eventos `p2p.snapshot` al bus.
- No-objetivos: ejecutar órdenes, autenticarse como usuario de Binance, capturar chats
  o datos de transacciones entre particulares.

## Usuarios y escenarios
Usuario directo: el motor de indicadores (consumidor interno de los eventos).

### Escenarios positivos
1. Cada N segundos (configurable, inicial 60 s) el ingestor consulta el endpoint público
   de búsqueda P2P para BUY y SELL, pagina hasta top-K anuncios (inicial K=100) y publica
   un snapshot normalizado.
2. Ante respuesta parcial (menos páginas), publica snapshot marcado como `partial=true`.
3. Ante HTTP 429/5xx aplica backoff exponencial con jitter y reintenta sin perder el ciclo.

### Escenarios negativos / abuso (requerido por Gate 0)
1. **Cambio de esquema de respuesta**: un campo esperado desaparece → el ingestor valida
   contra JSON Schema, descarta el snapshot, emite alerta y NO publica datos corruptos (A10).
2. **Anuncios manipulados / outliers**: precios absurdos (p. ej. 10× el mercado) para
   distorsionar señales → se etiquetan como outliers en la normalización; el filtrado
   final es responsabilidad del motor de indicadores.
3. **Bloqueo o baneo de IP por Binance**: rate limit agresivo → circuit breaker detiene
   consultas, alerta, y reanuda con backoff; nunca rotación agresiva de IPs (respeto ToS).
4. **Respuesta gigante o maliciosa (zip-bomb / payload enorme)**: límite de tamaño de
   respuesta y timeout estricto de lectura (A10, DoS).
5. **MITM / endpoint suplantado**: verificación estricta de TLS y pinning del dominio (A08).
6. **Inyección vía contenido de anuncios**: los textos (nombres de bancos, condiciones)
   se tratan como datos no confiables; sanitización antes de persistir o reemitir (A05).

## Requisitos funcionales
- RF-1: Consultar ambos lados (BUY/SELL) del par USDT/VES con frecuencia configurable.
- RF-2: Capturar por anuncio: precio, cantidad disponible, límite min/max, métodos de
  pago/bancos, tipo de anunciante (merchant/user), métricas públicas del anunciante.
- RF-3: Normalizar a evento `p2p.snapshot` versionado (schema registry ligero en repo).
- RF-4: Publicar al exchange `market.events` de RabbitMQ con confirmación (publisher confirms).
- RF-5: Persistir snapshot crudo (90 días) para reproceso.
- RF-6: Métricas operativas: latencia de ciclo, anuncios capturados, errores, backoffs.

## Requisitos de seguridad (mapeados a OWASP ASVS)
| Req | ASVS | Nivel | OWASP Top 10 |
|---|---|---|---|
| Validación de respuesta contra JSON Schema antes de publicar | V5.1 | L1 | A05, A10 |
| TLS 1.2+ verificado hacia Binance; sin desactivar verificación de certificados | V9.1 | L1 | A04, A08 |
| Timeouts, límite de tamaño de respuesta y circuit breaker | V11 | L1 | A10 |
| Credenciales del bus (RabbitMQ) desde secret store, no en código | V6/V14 | L1 | A02 |
| Eventos publicados con firma de esquema/versión para integridad | V13 | L2 | A08 |
| Logging de seguridad: fallos de validación y anomalías de fuente | V16 | L1 | A09 |
| Dependencias con lockfile y SCA en CI | — | L1 | A03 |

## Métricas de éxito
- ≥ 99 % de ciclos completados en horario 06:00–22:00 VET.
- Latencia consulta→evento publicado ≤ 5 s (p95).
- 0 snapshots corruptos publicados al bus.

## Dependencias y riesgos
- Depende de: RabbitMQ (ADR-0004), esquemas de eventos (02-design), TimescaleDB (ADR-0002).
- Riesgo principal: cambio unilateral del endpoint por Binance (ver charter y ADR-0005).
