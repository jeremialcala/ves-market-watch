---
type: Index
title: Servicios
description: Los cinco servicios de VES Market Watch y su estado de implementación.
timestamp: 2026-07-11T00:00:00Z
---

# Servicios

| Servicio | Estado | Rol |
|---|---|---|
| [ingestor-bcv](ingestor-bcv.md) | **Implementado** (multi-moneda, HITL; verificado en vivo) | Ingesta tasas oficiales BCV |
| [ingestor-binance](ingestor-binance.md) | **Implementado** (verificado en vivo) | Ingesta anuncios P2P USDT/VES |
| [indicator-engine](indicator-engine.md) | **Fase 1 implementada** (tasas oficiales; P2P y señales en fase 2) | Cálculo reactivo de indicadores y señales |
| [api-gateway](api-gateway.md) | Diseñado, sin código | REST + WSS; Resource Server OIDC (Auth0) |
| [ingestor-historico](ingestor-historico.md) | **Implementado** (batch por demanda, verificado con export real) | Backfill de históricos de precio + varianza histórica |

Comunicación entre servicios: solo vía eventos del bus (ver [events/](../events/index.md));
la excepción es el ingestor-historico, que por diseño no publica al bus (ADR-0013).
Arquitectura general: `../../docs/02-design/architecture.md` y C4 en `../../docs/architecture/`.
