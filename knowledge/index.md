---
type: OKF Bundle
title: VES Market Watch — Knowledge Bundle
description: Contexto curado del proyecto en Open Knowledge Format (OKF v0.1) para consumo por agentes y humanos.
tags: [okf, contexto, ves, fx]
timestamp: 2026-07-26T00:00:00Z
---

# VES Market Watch — Knowledge Bundle

Plataforma que trackea la brecha entre la tasa oficial VES/USD (BCV) y el mercado P2P
VES/USDT (Binance), con motor de indicadores y salida REST/WSS. Este bundle es la
**entrada de contexto para agentes**: resume qué existe, en qué estado está y dónde vive
la fuente de verdad (los documentos AI-DLC y el código).

## Estado del proyecto (resumen vivo)

- Fase AI-DLC: Gates 0 y 1 **aprobados HITL** (2026-07-11); fase 03 en curso.
- **Implementados los 4 servicios de datos:** [ingestor-bcv](services/ingestor-bcv.md)
  (multi-moneda, HITL), [ingestor-binance](services/ingestor-binance.md) (polling
  P2P educado, emite `p2p.snapshot`), [indicator-engine](services/indicator-engine.md)
  con fases 1 y 2 + señales (consume `official.rate.updated` y `p2p.snapshot`;
  emite `indicators.updated` y `signals.emitted`) e
  [ingestor-historico](services/ingestor-historico.md) (backfill batch, sin bus).
  Flujos productor→bus verificados en vivo contra las fuentes reales. Contratos
  formales en `../schemas/`.
- Sin código: api-gateway (tenant Auth0 y spec OpenAPI 3.1 ya listos). Siguiente
  paso natural: **implementar el api-gateway** (consumir los eventos del bus y
  exponer REST/WSS).
- Historia de cambios: [log.md](log.md) y `../CHANGELOG.md`.

## Mapa del bundle

| Sección | Contenido |
|---|---|
| [services/](services/index.md) | Los 5 servicios de la plataforma y su estado |
| [events/](events/index.md) | Eventos AMQP del bus `market.events` |
| [tables/](tables/index.md) | Tablas TimescaleDB (implementadas y planificadas) |
| [metrics/](metrics/index.md) | Indicadores financieros que produce la plataforma |

## Fuentes de verdad (fuera del bundle)

- Requisitos: `../docs/01-requirements/` (5 PRDs con escenarios de abuso y ASVS).
- Diseño: `../docs/02-design/` (arquitectura, threat model STRIDE/DREAD, contratos API).
- Decisiones: `../docs/00-project/adr/` (ADR-0001…0015; una decisión = una ADR).
- Gates: `../.ai-dlc/gates/`.

## Convenciones del bundle

OKF v0.1: un concepto = un archivo markdown con frontmatter YAML (`type` obligatorio).
Los links markdown entre conceptos forman el grafo. Al cambiar el sistema, actualiza el
concepto afectado y registra la entrada en [log.md](log.md). No dupliques aquí lo que ya
dice un PRD/ADR: enlázalo.
