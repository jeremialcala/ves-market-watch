---
type: Service
title: ingestor-binance
description: Ingesta continua de anuncios P2P de Binance (USDT/VES) — diseñado, sin implementar.
resource: ../../apps/ingestor-binance/
tags: [python, diseñado, binance, p2p]
timestamp: 2026-07-05T00:00:00Z
---

# ingestor-binance

**Estado: diseñado, sin código.** Polling educado al endpoint público de búsqueda P2P
(60 s por lado, top-100, backoff con jitter, circuit breaker — ADR-0005). Normaliza
anuncios (precio, cantidad, límites, bancos, métodos de pago) contra JSON Schema y publica
[p2p.snapshot](../events/p2p-snapshot.md). Persiste snapshots crudos (retención 90 días).

## Referencias
- PRD: `../../docs/01-requirements/ingesta-binance-p2p.md` · ADR-0005
- Amenazas T2 (ads manipulados) y T7 (baneo) en el threat model.

## Pendiente (fase 03)
- Spike del endpoint P2P real (forma, paginación, límites).
- JSON Schema `p2p-snapshot.v1`.
