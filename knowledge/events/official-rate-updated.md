---
type: AMQP Event
title: official.rate.updated
description: Se emite cuando cambia el valor o la fecha-valor de una tasa oficial del BCV (una emisión por moneda).
resource: ../../docs/02-design/api-contracts.md
tags: [bcv, implementado, tasa-oficial]
timestamp: 2026-07-05T00:00:00Z
---

# official.rate.updated

Productor: [ingestor-bcv](../services/ingestor-bcv.md) · Consumidor previsto:
[indicator-engine](../services/indicator-engine.md).

Semántica **solo-en-cambio** (ADR-0008): la ausencia de eventos no significa fuente caída
— eso lo dice [official_rate_source_health](../tables/official_rate_source_health.md).
Solo tasas `valid` se publican (ADR-0007); comparación contra la última tasa persistida
en DB, no en memoria (sobrevive reinicios).

Payload (resumen): `{currency, rate, value_date, captured_at, source}` + sobre estándar.
Una emisión **por moneda** que cambió (multi-moneda desde la implementación).

Mensajes persistentes, publisher confirms, exchange `market.events`.
