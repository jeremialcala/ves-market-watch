---
type: Log
title: Historia del knowledge bundle
description: Registro cronológico de cambios en el contexto del proyecto (más reciente primero).
timestamp: 2026-07-05T00:00:00Z
---

# Log

## 2026-07-06 — Identidad de anunciantes P2P: pseudonimización HMAC (ADR-0011)
- Decisión humana que cierra el TODO de data-classification: conservar historia de
  anunciantes como `merchant_ref` (HMAC-SHA256, clave dedicada `MERCHANT_HMAC_KEY`,
  sin rotación programada); alias e ID crudos siguen sin persistir.
- Habilita (fase 2 del engine): dedup de profundidad, concentración de mercado,
  recurrencia de manipuladores (T2) y forense de señales (T10).
- Implementación pendiente en `ingestor-binance` (`minimizar_crudo` + contrato
  p2p-snapshot v1.1, aditivo); PRD y data-classification actualizados.

## 2026-07-06 — Auditoría de coherencia docs↔implementación
- Minimización de datos aplicada al crudo P2P (`minimizar_crudo`): el alias e
  identificadores del anunciante ya no tocan disco — cierra la brecha con
  data-classification (el TODO de confirmación humana sigue abierto).
- ADR-0008/0009 → accepted (implementados por ingestor-bcv, con notas de cómo);
  Gate 1 y README raíz actualizados al estado real; índices del bundle
  (servicios/eventos/métricas) sincronizados; tabla de persistencia de
  architecture.md con estado por tabla.

## 2026-07-06 — ingestor-binance implementado (última fuente)
- Spike del endpoint P2P resuelto (ADR-0005): HTTP 200 con la forma esperada,
  ~643 anuncios USDT/VES; fixtures reales versionados. `tradeType` = perspectiva
  del taker.
- Servicio completo: polling educado (presupuesto, backoff+jitter, breaker),
  validación de schema de la fuente, sanitización, outliers MAD etiquetados
  (con piso relativo 2 % calibrado con datos reales), crudo 90 d y `p2p.snapshot`
  (contrato `schemas/p2p-snapshot.v1.json`). 40 tests; flujo productor→bus
  verificado en vivo (100 anuncios/lado).
- Con esto las 3 fuentes/servicios de datos están implementados; falta fase 2 del
  engine (brecha) y el api-gateway.

## 2026-07-05 — indicator-engine fase 1: primer consumidor del bus
- Motor implementado como consumidor de `official.rate.updated`: validación contra
  schema compartido, DLQ, idempotencia por `event_id`, hypertable `indicators`
  (calc_version) y emisión de `indicators.updated` con `triggered_by`.
- Contratos formales en `schemas/` (official-rate.v1, indicators.v1) verificados por
  contract tests en ambos lados; sobre estándar unificado a `occurred_at`.
- Flujo ingestor→bus→engine verificado en vivo (5 monedas del sitio real del BCV).
- PRD motor-indicadores accepted (fase 1); pendiente fase 2: P2P y señales.

## 2026-07-05 — Re-validación HITL de tasas suspect (ADR-0007 accepted)
- Job HITL implementado en `ingestor-bcv`: CLI `revalidar listar|aprobar|rechazar`,
  estado terminal `rejected`, expiración por TTL (24 h, `system:timeout`) y auditoría
  quién/cuándo/por qué (migración 002 sobre `official_rates`).
- Previo en la misma fecha: `docker-compose.yml` raíz (RabbitMQ 4 + TimescaleDB pg16
  en puerto 5433) y suites integration/e2e; la suite del servicio llega a 53 tests.

## 2026-07-05 — Creación del bundle
- Bundle OKF v0.1 inicial (ADR-0010): services, events, tables, metrics.
- Refleja: Gate 0/1 documentados; `ingestor-bcv` implementado (multi-moneda, hexagonal,
  TLS anclado, 28 tests, dry-run verificado con 5 monedas); resto de servicios en diseño.

## 2026-07-05 — Hitos previos del proyecto (resumen)
- v0.1.0: estructura AI-DLC completa hasta Gate 1 (charter, PRDs, threat model, C4, ADR-0001…0006).
- ADR-0007/0008/0009 (proposed): máquina de estados de la tasa, publicación solo-en-cambio, modelo bitemporal.
- Alcance de ingesta BCV ampliado de solo-USD a multi-moneda con descubrimiento dinámico.
