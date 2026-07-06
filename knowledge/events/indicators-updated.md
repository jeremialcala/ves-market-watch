---
type: AMQP Event
title: indicators.updated
description: Conjunto de indicadores recalculados tras un evento de fuente — implementado (fase 1, derivados de tasa oficial).
resource: ../../schemas/indicators.v1.json
tags: [indicadores, implementado]
timestamp: 2026-07-05T00:00:00Z
---

# indicators.updated

Productor: [indicator-engine](../services/indicator-engine.md) · Consumidor previsto:
[api-gateway](../services/api-gateway.md) (push WSS). **Implementado en fase 1.**

Contrato: `schemas/indicators.v1.json` (validado por contract test del engine).
Payload: `{as_of, calc_version, official_stale, triggered_by, indicators: [{indicator,
currency, value}]}` + sobre estándar. `triggered_by` referencia el `event_id` del
evento origen (trazabilidad V16). Valores como string decimal exacto, nunca float.

Fase 1 emite `official_rate` y `official_rate_change_abs/pct` por moneda; la
[brecha](../metrics/brecha-cambiaria.md), spreads y volúmenes se suman en fase 2.

Mensajes persistentes, publisher confirms, exchange `market.events`.
