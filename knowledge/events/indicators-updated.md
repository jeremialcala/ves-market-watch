---
type: AMQP Event
title: indicators.updated
description: Conjunto de indicadores recalculados tras un evento de fuente — diseñado.
resource: ../../docs/02-design/api-contracts.md
tags: [indicadores, diseñado]
timestamp: 2026-07-05T00:00:00Z
---

# indicators.updated

Productor: [indicator-engine](../services/indicator-engine.md) · Consumidor:
[api-gateway](../services/api-gateway.md) (push WSS). **Diseñado, sin implementar.**

Payload (resumen): [brecha cambiaria](../metrics/brecha-cambiaria.md) abs/%,
spreads compra/venta, volúmenes agregados, `as_of`, `official_stale`, `confidence`,
`calc_version`.
