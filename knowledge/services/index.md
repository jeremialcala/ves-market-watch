---
type: Index
title: Servicios
description: Los cuatro servicios de VES Market Watch y su estado de implementación.
timestamp: 2026-07-05T00:00:00Z
---

# Servicios

| Servicio | Estado | Rol |
|---|---|---|
| [ingestor-bcv](ingestor-bcv.md) | **Implementado** (multi-moneda, HITL; verificado en vivo) | Ingesta tasas oficiales BCV |
| [ingestor-binance](ingestor-binance.md) | **Implementado** (verificado en vivo) | Ingesta anuncios P2P USDT/VES |
| [indicator-engine](indicator-engine.md) | **Fase 1 implementada** (tasas oficiales; P2P y señales en fase 2) | Cálculo reactivo de indicadores y señales |
| [api-gateway](api-gateway.md) | Diseñado, sin código | REST + WSS con OAuth2/JWT |

Comunicación entre servicios: solo vía eventos del bus (ver [events/](../events/index.md)).
Arquitectura general: `../../docs/02-design/architecture.md` y C4 en `../../docs/architecture/`.
