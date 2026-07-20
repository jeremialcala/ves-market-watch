---
type: AMQP Event
title: signals.emitted
description: Señal financiera disparada por una regla sobre la microestructura P2P, con evidencia trazable — contrato definido (signal.v1); emisión pendiente del motor de reglas.
resource: ../../schemas/signal.v1.json
tags: [señales, contrato-definido]
timestamp: 2026-07-20T00:00:00Z
---

# signals.emitted

Productor: [indicator-engine](../services/indicator-engine.md) · Consumidor:
[api-gateway](../services/api-gateway.md). **Contrato definido
(`schemas/signal.v1.json`, 2026-07-20); emisión pendiente** del motor de reglas
(RF-4) y de la calibración HITL de umbrales.

Payload: `{type, direction, currency, as_of, calc_version, triggered_by,
evidence: {rule, inputs}}`. El `occurred_at` del sobre es la hora de emisión; `as_of`
es el instante del dato de mercado que disparó la regla. `type` es de vocabulario
abierto por convención (catálogo canónico en
[microestructura P2P](../metrics/microestructura-p2p.md): `arranque_alcista`,
`techo_inminente`, `correccion_inminente`); `direction` ∈ {alcista, bajista, neutral}.

`evidence` (regla versionada + mapa indicador→valor) hace cada señal auditable y
reproducible (amenaza T10, A09). Nunca se emiten señales desde datos `low_confidence`
ni duplicadas (idempotencia por `event_id`). El contract test de forma vive en
`apps/indicator-engine/tests/contract/test_signal_event_schema.py`.
