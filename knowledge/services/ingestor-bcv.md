---
type: Service
title: ingestor-bcv
description: Ingesta las tasas oficiales de cambio del BCV (multi-moneda) y publica cambios al bus. Único servicio implementado.
resource: ../../apps/ingestor-bcv/
tags: [python, implementado, bcv, scraping]
timestamp: 2026-07-05T00:00:00Z
---

# ingestor-bcv

Python 3.12, arquitectura hexagonal. Consulta bcv.org.ve 2×/hora (con jitter) y captura
**todas** las monedas de la sección «tipo de cambio de referencia» (hoy USD, EUR, CNY,
TRY, RUB) con descubrimiento dinámico de monedas nuevas.

## Comportamiento clave
- TLS anclado a `certs/bcv-ca-bundle.pem` — nunca `verify=False` (ADR-0006).
- Validación de plausibilidad por moneda (|Δ| ≤ 20 %); anomalías → estado `suspect`, HITL (ADR-0007).
- Re-validación HITL: CLI `python -m ingestor_bcv revalidar listar|aprobar|rechazar`
  (nota y usuario auditables); aprobar publica al bus y fija la nueva referencia;
  sospechas sin revisión en `SUSPECT_TTL_HOURS` (24) expiran a `rejected` (ADR-0007).
- Persiste **toda** captura en [official_rates](../tables/official_rates.md);
  publica [official.rate.updated](../events/official-rate-updated.md) **solo si cambió** (ADR-0008).
- Salud de fuente en [official_rate_source_health](../tables/official_rate_source_health.md):
  3 fallos consecutivos → alerta + `stale_since`.
- CLI daemon: `python -m ingestor_bcv [--once] [--dry-run]`. 53 tests
  (unit/contract sin infra + integration/e2e contra RabbitMQ/TimescaleDB del
  `docker-compose.yml` raíz, con skip elegante sin infra).

## Referencias
- PRD: `../../docs/01-requirements/ingesta-bcv.md` · Diseño: `../../apps/ingestor-bcv/docs/design.md`
- ADRs: 0006 (TLS), 0007 (estados, accepted), 0008 (solo-en-cambio), 0009 (bitemporal)
- Amenaza T1 en `../../docs/02-design/threat-model.md`

## Pendiente
- Nada en este servicio; el siguiente paso natural del sistema es el
  [indicator-engine](indicator-engine.md) como consumidor del evento.
