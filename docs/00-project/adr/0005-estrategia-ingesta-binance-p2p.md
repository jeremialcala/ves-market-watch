# ADR-0005: Estrategia de ingesta del mercado P2P de Binance

- **Estado:** accepted
- **Fecha:** 2026-07-05
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 02-design
- **Controles OWASP afectados:** A08, A10

## Contexto
Binance no publica una API oficial documentada para P2P. El portal P2P expone un endpoint
público de búsqueda de anuncios (`/bapi/c2c/.../adv/search`) usado por su propia web.
Se requiere captura continua sin violar ToS ni provocar bloqueos.

## Decisión
Polling educado al endpoint público de búsqueda P2P: frecuencia inicial 60 s por lado,
top-100 anuncios paginados, User-Agent identificable, presupuesto máximo de requests/min,
backoff exponencial con jitter ante 429/5xx y circuit breaker que suspende ciclos ante
señales de bloqueo. La fuente queda tras un puerto (`P2PMarketSource`) para poder sustituir
el mecanismo (otro endpoint, proveedor de datos, scraping headless) sin tocar el dominio.

Spike técnico resuelto (2026-07-05): el endpoint respondió HTTP 200 con la forma
esperada (`{code:"000000", success, data:[{adv:{advNo, price, surplusAmount,
minSingleTransAmount, maxSingleTransAmount, tradeMethods[...]}, advertiser:{userType,…}}],
total}`) para USDT/VES en ambos lados (~643 anuncios publicados). Respuestas reales
versionadas como fixtures en `apps/ingestor-binance/tests/fixtures/`. Nota de semántica:
el parámetro `tradeType` es la perspectiva del taker (BUY = anuncios de vendedores).

## Alternativas consideradas
| Opción | Pros | Contras | Riesgo de seguridad |
|---|---|---|---|
| Endpoint público con polling educado (elegida) | Datos completos (límites, bancos), sin credenciales | No documentado; puede cambiar; riesgo de rate limit | Bajo; sin secretos de Binance |
| Scraping headless (navegador) | Resiliente a cambios de API | Pesado, frágil, mayor huella | Medio (superficie del navegador) |
| Proveedor de datos de terceros | Estable, con SLA | Costo; dependencia; posible menor granularidad | Medio (supply chain A03) |

## Consecuencias
- Positivas: máxima granularidad (profundidad, bancos, límites) a costo cero.
- Negativas / deuda asumida: fragilidad ante cambios unilaterales; monitoreo de esquema obligatorio.
- Impacto en threat model: origina T7 (baneo) y parte de T2 (datos manipulados); controles definidos en el PRD de ingesta.
