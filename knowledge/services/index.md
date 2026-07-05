---
type: Index
title: Servicios
description: Los cuatro servicios de VES Market Watch y su estado de implementación.
timestamp: 2026-07-05T00:00:00Z
---

# Servicios

| Servicio | Estado | Rol |
|---|---|---|
| [ingestor-bcv](ingestor-bcv.md) | **Implementado** (dry-run verificado) | Ingesta tasas oficiales BCV (multi-moneda) |
| [ingestor-binance](ingestor-binance.md) | Diseñado | Ingesta anuncios P2P USDT/VES |
| [indicator-engine](indicator-engine.md) | Diseñado | Cálculo reactivo de indicadores y señales |
| [api-gateway](api-gateway.md) | Diseñado | REST + WSS con OAuth2/JWT |

Comunicación entre servicios: solo vía eventos del bus (ver [events/](../events/index.md)).
Arquitectura general: `../../docs/02-design/architecture.md` y C4 en `../../docs/architecture/`.
