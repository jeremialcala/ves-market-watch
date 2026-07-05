---
type: AMQP Event
title: signals.emitted
description: Señal financiera disparada por una regla sobre indicadores, con evidencia trazable — diseñado.
resource: ../../docs/02-design/api-contracts.md
tags: [señales, diseñado]
timestamp: 2026-07-05T00:00:00Z
---

# signals.emitted

Productor: [indicator-engine](../services/indicator-engine.md) · Consumidor:
[api-gateway](../services/api-gateway.md). **Diseñado, sin implementar.**

Payload (resumen): `{type, direction, evidence: {inputs, rule}, calc_version, emitted_at}`.
La evidencia hace cada señal auditable y reproducible (amenaza T10). Nunca se emiten
señales desde datos `low_confidence` ni duplicadas (idempotencia por `event_id`).
