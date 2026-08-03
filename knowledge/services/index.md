---
type: Index
title: Servicios
description: Las seis apps de Criterio (5 servicios + web-spa) y su estado de implementación.
timestamp: 2026-07-30T00:00:00Z
---

# Servicios

| Servicio | Estado | Rol |
|---|---|---|
| [ingestor-bcv](ingestor-bcv.md) | **Implementado** (multi-moneda, HITL; verificado en vivo) | Ingesta tasas oficiales BCV |
| [ingestor-binance](ingestor-binance.md) | **Implementado** (verificado en vivo) | Ingesta anuncios P2P USDT/VES |
| [indicator-engine](indicator-engine.md) | **Fases 1 y 2 + señales implementadas** (tasas oficiales, microestructura P2P, `signals.emitted`) | Cálculo reactivo de indicadores y señales |
| [api-gateway](api-gateway.md) | **Implementado** (2026-07-26; verificado en vivo, 90 tests) | REST `/api/v1` + WSS `/ws/v1`; Resource Server OIDC (Auth0) |
| [ingestor-historico](ingestor-historico.md) | **Implementado** (batch por demanda, verificado con export real) | Backfill de históricos de precio + varianza histórica |
| [web-spa](web-spa.md) | **Implementado** (2026-07-27, ADR-0017; rediseño Higerotech 2026-07-31, ADR-0018; pendiente client_id del tenant) | Dashboard web autenticado (React, ES/EN, claro/oscuro); consume REST/WSS del gateway |

Comunicación entre servicios: solo vía eventos del bus (ver [events/](../events/index.md));
la excepción es el ingestor-historico, que por diseño no publica al bus (ADR-0013).
Arquitectura general: `../../docs/02-design/architecture.md` y C4 en `../../docs/architecture/`.
