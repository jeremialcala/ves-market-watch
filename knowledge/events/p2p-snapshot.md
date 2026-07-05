---
type: AMQP Event
title: p2p.snapshot
description: Snapshot normalizado de anuncios P2P de Binance para un lado del mercado (BUY o SELL) — diseñado.
resource: ../../docs/02-design/api-contracts.md
tags: [binance, p2p, diseñado]
timestamp: 2026-07-05T00:00:00Z
---

# p2p.snapshot

Productor: [ingestor-binance](../services/ingestor-binance.md) · Consumidor:
[indicator-engine](../services/indicator-engine.md). **Diseñado, sin implementar.**

Payload (resumen): lado (BUY/SELL), lista top-K de anuncios normalizados (precio,
cantidad, límites min/max, bancos/métodos de pago, tipo de anunciante, flag outlier),
`partial=true` si la captura fue incompleta.

Pendiente fase 03: JSON Schema `p2p-snapshot.v1` (referenciado en contratos y PRD).
