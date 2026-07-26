---
type: AMQP Event
title: indicators.updated
description: Conjunto de indicadores recalculados tras un evento de fuente — implementado (fases 1 y 2).
resource: ../../schemas/indicators.v1.json
tags: [indicadores, implementado]
timestamp: 2026-07-26T00:00:00Z
---

# indicators.updated

Productor: [indicator-engine](../services/indicator-engine.md) · Consumidor previsto:
[api-gateway](../services/api-gateway.md) (push WSS). **Implementado (fases 1 y 2).**

Contrato: `schemas/indicators.v1.json` (validado por contract test del engine).
Payload: `{as_of, calc_version, official_stale, triggered_by, indicators: [{indicator,
currency, value}]}` + sobre estándar. `triggered_by` referencia el `event_id` del
evento origen (trazabilidad V16). Valores como string decimal exacto, nunca float.

Se emiten `official_rate` y `official_rate_change_abs/pct` por moneda (fase 1) y,
desde la fase 2 (implementada 2026-07-20), la
[brecha](../metrics/brecha-cambiaria.md), los precios de referencia P2P, spreads,
volúmenes y la microestructura entre lados.

Mensajes persistentes, publisher confirms, exchange `market.events`.
