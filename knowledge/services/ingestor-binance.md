---
type: Service
title: ingestor-binance
description: Ingesta del mercado P2P de Binance (USDT/VES) con polling educado y eventos p2p.snapshot — implementado.
resource: ../../apps/ingestor-binance/
tags: [python, implementado, binance, p2p]
timestamp: 2026-07-06T00:00:00Z
---

# ingestor-binance

**Implementado** — verificado contra el endpoint vivo (spike 2026-07-05: ADR-0005
resuelto, fixtures reales versionados). Python 3.12, hexagonal, mismas convenciones
que [ingestor-bcv](ingestor-bcv.md).

Cada 60 s (± jitter) captura ambos lados del par USDT/VES (top-100 paginado,
perspectiva del taker), normaliza, **etiqueta** outliers y publica
[p2p.snapshot](../events/p2p-snapshot.md); el crudo queda en
[p2p_snapshots_raw](../tables/p2p_snapshots_raw.md) (retención 90 d, RF-5).

## Propiedades implementadas
- Polling educado (ADR-0005): User-Agent identificable, presupuesto de requests/min,
  backoff exponencial con jitter (429/5xx), circuit breaker con cooldown y half-open
  (alerta solo al abrir) — nunca rotación de IPs.
- Validación de cada página contra el schema de la fuente
  (`apps/ingestor-binance/schemas/`): cambio de esquema → descarte + alerta, jamás
  se publica corrupto (A10).
- Sanitización de textos de la fuente (A05) y outliers por MAD (k=3.5) con fallback
  para MAD=0 y piso de desviación relativa del 2 % (calibrado con el fixture real).
- Pseudonimización de anunciantes (ADR-0011): `merchant_ref = HMAC-SHA256(clave
  dedicada, userNo)` en 32 hex, en el crudo y en el evento (contrato v1.1); alias e
  ID crudos jamás tocan disco ni bus. `MERCHANT_HMAC_KEY` requerida (fail fast).
- Defensas de red: TLS estricto, timeout, tope de bytes por streaming (zip-bomb).
- Páginas incompletas → snapshot `partial=true`; CLI `python -m ingestor_binance
  [--once] [--dry-run]`. 40 tests (unit/contract/integration/e2e).

## Referencias
- PRD: `../../docs/01-requirements/ingesta-binance-p2p.md` · Diseño: `../../apps/ingestor-binance/docs/design.md`
- ADR-0005 (spike resuelto) · Contrato: `../../schemas/p2p-snapshot.v1.json` · Amenazas T2, T7.

## Pendiente
- Nada en este servicio (ADR-0011 implementado 2026-07-06, correlación verificada en
  vivo: 88/96 anunciantes correlacionados entre dos corridas). El consumo de
  `p2p.snapshot` (precio de referencia, brecha) es la fase 2 del
  [indicator-engine](indicator-engine.md).
