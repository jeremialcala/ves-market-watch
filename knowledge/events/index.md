---
type: Index
title: Eventos AMQP
description: Eventos del bus market.events (RabbitMQ topic exchange) — el contrato entre servicios.
timestamp: 2026-07-26T00:00:00Z
---

# Eventos — bus `market.events`

Todos los eventos llevan sobre estándar `{event_id, event_type, schema_version,
occurred_at, producer}` (idempotencia y trazabilidad — ADR-0004). Contratos formales
en `../../schemas/` (JSON Schema 2020-12), verificados por contract tests en productor
y consumidor. Eventos inválidos → DLQ `market.events.dlq`.

| Routing key | Productor | Consumidor | Estado |
|---|---|---|---|
| [official.rate.updated](official-rate-updated.md) | ingestor-bcv | indicator-engine (pipeline) · api-gateway (push WSS) | **Implementado** (ambos lados) |
| [p2p.snapshot](p2p-snapshot.md) | ingestor-binance | indicator-engine (pipeline) · api-gateway (push WSS) | **Implementado** (ambos lados) |
| [indicators.updated](indicators-updated.md) | indicator-engine | api-gateway (push WSS) | **Implementado** (ambos lados, 2026-07-26) |
| [signals.emitted](signals-emitted.md) | indicator-engine | api-gateway (push WSS + `GET /signals`) | **Implementado** (ambos lados, RF-4/ADR-0015 · consumidor 2026-07-26) |
| [analysis.updated](analysis-updated.md) | indicator-engine | api-gateway (push WSS + `GET /analysis/current`) | **Implementado** (ambos lados, RF-6/ADR-0019 · 2026-08-01) |

El consumo del api-gateway es de **cola efímera** (push WSS best-effort, ADR-0016):
el consumidor durable con DLQ del pipeline sigue siendo el indicator-engine.

Contratos completos: `../../docs/02-design/api-contracts.md`.
