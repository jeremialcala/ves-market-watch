# ingestor-binance

Servicio de ingesta del mercado P2P de Binance (USDT/VES). Deriva de la convención del
servicio de referencia `worker-amqp` del template AI-DLC (Python + RabbitMQ).

## Qué hace
- Polling educado del endpoint público de búsqueda P2P (ambos lados, top-100), cada 60 s.
- Normaliza anuncios (precio, cantidad, límites, bancos, métodos de pago) contra JSON Schema.
- Publica eventos `p2p.snapshot` al exchange `market.events` (publisher confirms).
- Persiste snapshots crudos en TimescaleDB (retención 90 días).

## Requisitos y diseño
- PRD: `../../docs/01-requirements/ingesta-binance-p2p.md`
- Estrategia de fuente: ADR-0005 · Amenazas: T2, T7 en `../../docs/02-design/threat-model.md`

## Estructura
```
src/ingestor_binance/   # dominio, casos de uso, adaptadores (http, amqp, db)
tests/                  # pirámide: unit / integration / contract / e2e
docs/design.md          # decisiones locales del servicio
```
