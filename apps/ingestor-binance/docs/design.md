# Diseño — ingestor-binance

## Capas (Clean Architecture)
- **Dominio:** `Anuncio`, `SnapshotP2P`, `Lado`; reglas de normalización y etiquetado de outliers.
- **Casos de uso:** `CapturarSnapshot(lado)` — orquesta fuente → normalización → publicación → persistencia.
- **Puertos:** `P2PMarketSource` (fuente), `EventPublisher` (bus), `SnapshotRepository` (DB).
- **Adaptadores:** cliente HTTP Binance (httpx, TLS verificado, timeout+límite de tamaño),
  publicador AMQP (aio-pika), repositorio TimescaleDB (asyncpg).

## Resiliencia
- Backoff exponencial con jitter (429/5xx); circuit breaker con presupuesto de requests/min.
- Validación JSON Schema de la respuesta; snapshot inválido → descarte + alerta (nunca publicar).

## Pendiente (fase 03)
- `<TODO: spike del endpoint P2P actual (forma, paginación, límites reales)>`
- `<TODO: JSON Schema p2p-snapshot.v1>`
