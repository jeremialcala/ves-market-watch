---
type: AMQP Event
title: p2p.snapshot
description: Snapshot normalizado de anuncios P2P de Binance para un lado del mercado (BUY o SELL) — implementado.
resource: ../../schemas/p2p-snapshot.v1.json
tags: [binance, p2p, implementado]
timestamp: 2026-07-06T00:00:00Z
---

# p2p.snapshot

Productor: [ingestor-binance](../services/ingestor-binance.md) · Consumidor previsto:
[indicator-engine](../services/indicator-engine.md) (fase 2). **Implementado.**

Contrato: `schemas/p2p-snapshot.v1.json` (validado por contract test del productor).
Payload: `{side (BUY/SELL, perspectiva del taker), asset, fiat, captured_at, partial,
ads: [{adv_no, price, available_amount, min_limit, max_limit, trade_methods[],
merchant, outlier}]}` + sobre estándar. Decimales como string exacto; textos
sanitizados (A05); outliers **etiquetados, no filtrados** (el filtrado y el
`confidence` son del engine). `partial=true` si alguna página del top-K no llegó.

El `event_id` del sobre es el snapshot_id de idempotencia para el consumidor.
Mensajes persistentes, publisher confirms, exchange `market.events`.
