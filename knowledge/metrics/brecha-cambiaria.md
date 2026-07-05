---
type: Metric
title: Brecha cambiaria BCV↔P2P
description: Diferencia (absoluta y porcentual) entre el precio de referencia P2P y la tasa oficial BCV. Indicador central de la plataforma.
tags: [indicador-nucleo, diseñado]
timestamp: 2026-07-05T00:00:00Z
---

# Brecha cambiaria

```
gap_abs = precio_referencia_p2p − tasa_oficial_usd
gap_pct = gap_abs / tasa_oficial_usd × 100
```

- `tasa_oficial_usd`: tasa USD vigente de [official_rates](../tables/official_rates.md)
  **conocida al momento del cálculo** (as-of `captured_at`, ADR-0009) — hace el indicador
  reproducible.
- `precio_referencia_p2p`: ver [precio-referencia-p2p](precio-referencia-p2p.md).
- Banderas de calidad obligatorias: `official_stale` (ADR-0007) y `confidence` (filtrado
  de outliers). Con datos degradados la brecha se publica marcada, nunca se suprime en silencio.

Se recalcula ante cada [p2p.snapshot](../events/p2p-snapshot.md) u
[official.rate.updated](../events/official-rate-updated.md) y se emite en
[indicators.updated](../events/indicators-updated.md).
