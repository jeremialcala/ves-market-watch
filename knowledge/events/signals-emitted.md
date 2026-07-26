---
type: AMQP Event
title: signals.emitted
description: Señal financiera disparada por el motor de reglas sobre la microestructura P2P, con evidencia trazable — implementado (RF-4).
resource: ../../schemas/signal.v1.json
tags: [señales, implementado]
timestamp: 2026-07-22T00:00:00Z
---

# signals.emitted

Productor: [indicator-engine](../services/indicator-engine.md) · Consumidor:
[api-gateway](../services/api-gateway.md). **Implementado (RF-4, 2026-07-22):** el
motor evalúa el ruleset versionado (`apps/indicator-engine/config/senales.v1.yaml`,
ADR-0015) sobre la microestructura vigente y emite este evento; el api-gateway aún
no lo consume (servicio sin implementar).

Payload: `{type, direction, currency, as_of, calc_version, triggered_by,
evidence: {rule, inputs}}` (contrato `schemas/signal.v1.json`). El `occurred_at`
del sobre es la hora de emisión; `as_of` es el instante del dato que disparó la
regla. `type` es de vocabulario abierto por convención (catálogo en
[microestructura P2P](../metrics/microestructura-p2p.md): `arranque_alcista`,
`techo_inminente`, `correccion_inminente`); `direction` ∈ {alcista, bajista, neutral}.

`evidence` (regla versionada `<type>@v<version>` + mapa indicador→valor) hace cada
señal auditable y reproducible (amenaza T10, A09). Nunca se emiten señales desde
datos `low_confidence`, ni el mismo tipo dentro del `cooldown` (dedup, RF-4/A08).
Las señales se persisten en la tabla [signals](../tables/signals.md).
