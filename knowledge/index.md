---
type: OKF Bundle
title: Criterio — Knowledge Bundle
description: Contexto curado del proyecto en Open Knowledge Format (OKF v0.1) para consumo por agentes y humanos.
tags: [okf, contexto, ves, fx]
timestamp: 2026-08-01T00:00:00Z
---

# Criterio — Knowledge Bundle

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
  CORS por allowlist en el gateway. El tenant está aprovisionado (app SPA y
  client M2M) desde 2026-07-27.
- El push WSS del gateway ya **se auto-recupera** ante caídas del bus, con alerta
  por transición y `/health` honesto (2026-07-30).
- El `web-spa` viste el **sistema de diseño Higerotech** con tema claro/oscuro e
  interfaz ES/EN (2026-07-31, ADR-0018); los bloques que la plataforma todavía
  no calcula van marcados `demo · sin fuente`.
- **El panel de medidores dejó de ser demo** (2026-08-01, ADR-0019): el motor
  publica por revisión la [lectura de cada
  indicador](metrics/lectura-de-indicadores.md) —banda dentro de los percentiles
  reales de su ventana de 90 días y proximidad a las reglas del ruleset— vía
  [analysis.updated](events/analysis-updated.md), `GET /api/v1/analysis/current`
  y el tópico WSS `analysis`. Es descripción del presente, no pronóstico.
- **La tarjeta de régimen dejó de ser maqueta** (2026-08-01, ADR-0021): el motor
  publica además la [lectura del mercado como un todo](metrics/lectura-de-mercado.md)
  en el campo `reading` del mismo evento — régimen de dos ejes con umbrales
  versionados y la **atribución** de qué lado movió la brecha, sobre la identidad
  exacta `Δbrecha = Δparalelo − Δoficial`. Describe el presente en lenguaje llano;
  no aconseja ni pronostica, y hay tests que lo defienden. El SPA baja de 3 sellos
  demo a 2.
- **Login sin fricción, verificado en vivo** (2026-08-01, ADR-0020): dominio
  propio `auth.higerotech.com` + desarrollo por túneles de Cloudflare. Entrar es
  un redirect silencioso sin clics y la sesión sobrevive al F5, con los tokens
  **solo en memoria** (T12 intacto).
- **La tasa oficial rige por fecha valor, no por antigüedad** (2026-08-02,
  ADR-0022): el BCV publica por la tarde la tasa del siguiente día hábil, así que
  medir rancidez en horas marcaba `official_stale` tres días de cada semana sobre
  una tasa vigente —y con esa bandera el motor suprime la atribución—. La regla es
  transversal: motor y gateway.
- **Una medición y una afirmación no comparten condición de publicación**
  (2026-08-02, ADR-0023): las dos deltas del movimiento salen del claim de
  atribución al campo `gap_legs` y se publican siempre; la atribución sigue
  callándose cuando no hay nada que atribuir.
- **El producto se llama Criterio** (2026-08-03, ADR-0024): cambian las etiquetas
  —incluidas las tres del tenant de Auth0—, no los identificadores. El `audience`
  conserva `vesmarketwatch` porque es una clave, no un nombre pendiente.
- Siguiente paso natural: decidir la topología de despliegue real (los túneles
  son de desarrollo) y preparar la fase 04 (Gate 2).
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
- Decisiones: `../docs/00-project/adr/` (ADR-0001…0024; una decisión = una ADR).
- Gates: `../.ai-dlc/gates/`.

## Convenciones del bundle

OKF v0.1: un concepto = un archivo markdown con frontmatter YAML (`type` obligatorio).
Los links markdown entre conceptos forman el grafo. Al cambiar el sistema, actualiza el
concepto afectado y registra la entrada en [log.md](log.md). No dupliques aquí lo que ya
dice un PRD/ADR: enlázalo.
