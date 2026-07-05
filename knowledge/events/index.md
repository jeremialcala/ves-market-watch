---
type: Index
title: Eventos AMQP
description: Eventos del bus market.events (RabbitMQ topic exchange) — el contrato entre servicios.
timestamp: 2026-07-05T00:00:00Z
---

# Eventos — bus `market.events`

Todos los eventos llevan sobre estándar `{event_id, schema_version, produced_at, producer}`
(idempotencia y trazabilidad — ADR-0004). Eventos inválidos → DLQ `market.events.dlq`.

| Routing key | Productor | Consumidor | Estado |
|---|---|---|---|
| [official.rate.updated](official-rate-updated.md) | ingestor-bcv | indicator-engine | **Implementado** (lado productor) |
| [p2p.snapshot](p2p-snapshot.md) | ingestor-binance | indicator-engine | Diseñado |
| [indicators.updated](indicators-updated.md) | indicator-engine | api-gateway | Diseñado |
| [signals.emitted](signals-emitted.md) | indicator-engine | api-gateway | Diseñado |

Contratos completos: `../../docs/02-design/api-contracts.md`.
