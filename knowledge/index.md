---
type: OKF Bundle
title: VES Market Watch — Knowledge Bundle
description: Contexto curado del proyecto en Open Knowledge Format (OKF v0.1) para consumo por agentes y humanos.
tags: [okf, contexto, ves, fx]
timestamp: 2026-07-31T00:00:00Z
---

# VES Market Watch — Knowledge Bundle

Plataforma que trackea la brecha entre la tasa oficial VES/USD (BCV) y el mercado P2P
VES/USDT (Binance), con motor de indicadores y salida REST/WSS. Este bundle es la
**entrada de contexto para agentes**: resume qué existe, en qué estado está y dónde vive
la fuente de verdad (los documentos AI-DLC y el código).

## Estado del proyecto (resumen vivo)

- Fase AI-DLC: Gates 0 y 1 **aprobados HITL** (2026-07-11); fase 03 en curso.
- **Los 5 servicios implementados y verificados en vivo** (2026-07-26):
  [ingestor-bcv](services/ingestor-bcv.md) (multi-moneda, HITL),
  [ingestor-binance](services/ingestor-binance.md) (polling P2P educado),
  [indicator-engine](services/indicator-engine.md) (fases 1 y 2 + señales),
  [ingestor-historico](services/ingestor-historico.md) (backfill batch, sin bus) y
  [api-gateway](services/api-gateway.md) (REST `/api/v1` + WSS `/ws/v1`, Resource
  Server Auth0 — puerto 8800 en dev). El pipeline completo fuente → bus →
  indicadores/señales → REST/WSS está operativo; contratos formales en
  `../schemas/` + OpenAPI/AsyncAPI del gateway.
- **Front-end [web-spa](services/web-spa.md) implementado** (2026-07-27,
  ADR-0017): dashboard React autenticado vía Auth0 con stream WSS + histórico;
  CORS por allowlist en el gateway. Pendiente HITL: `auth0 login` para
  aprovisionar la app SPA (client_id) y el client M2M del e2e en vivo.
- El push WSS del gateway ya **se auto-recupera** ante caídas del bus, con alerta
  por transición y `/health` honesto (2026-07-30).
- El `web-spa` viste el **sistema de diseño Higerotech** con tema claro/oscuro e
  interfaz ES/EN (2026-07-31, ADR-0018); los bloques que la plataforma todavía
  no calcula van marcados `demo · sin fuente`.
- Siguiente paso natural: aprovisionar el tenant (F1 de ADR-0017), checklist
  e2e con login real, y preparar la fase 04 (Gate 2).
- Historia de cambios: [log.md](log.md) y `../CHANGELOG.md`.

## Mapa del bundle

| Sección | Contenido |
|---|---|
| [services/](services/index.md) | Las 6 apps (5 servicios + `web-spa`) y su estado |
| [events/](events/index.md) | Eventos AMQP del bus `market.events` |
| [tables/](tables/index.md) | Tablas TimescaleDB (implementadas y planificadas) |
| [metrics/](metrics/index.md) | Indicadores financieros que produce la plataforma |

## Fuentes de verdad (fuera del bundle)

- Requisitos: `../docs/01-requirements/` (6 PRDs con escenarios de abuso y ASVS).
- Diseño: `../docs/02-design/` (arquitectura, threat model STRIDE/DREAD, contratos API).
- Decisiones: `../docs/00-project/adr/` (ADR-0001…0018; una decisión = una ADR).
- Gates: `../.ai-dlc/gates/`.

## Convenciones del bundle

OKF v0.1: un concepto = un archivo markdown con frontmatter YAML (`type` obligatorio).
Los links markdown entre conceptos forman el grafo. Al cambiar el sistema, actualiza el
concepto afectado y registra la entrada en [log.md](log.md). No dupliques aquí lo que ya
dice un PRD/ADR: enlázalo.
