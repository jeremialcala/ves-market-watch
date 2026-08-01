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

## Historia disponible (2026-08-01)

| lado | desde | origen |
|---|---|---|
| `p2p_brecha_pct_buy` | 2026-07-20 | solo el motor |
| `p2p_brecha_pct_sell` | **2025-12-02** | derivado hasta 2026-07-20 (ADR-0013 RF-7) + motor |

El lado **venta** tiene 242 días porque el export histórico de mercado ES el lado
venta: su precio queda a ±0,6 VES de `p2p_mediana_sell` y a ~8 VES del buy, y la
brecha así derivada difiere de la del motor en **−0,08 pp** (desviación 0,19) sobre
279 horas de solape. La de compra difería **+1,08 pp**, así que no se derivó:
habría metido un escalón de ~1 pp en la unión.

### Al agregar: ponderar por tiempo, no por muestra

La serie derivada tiene una fila cada 10 min y la del motor una cada ~30 s. **Toda
media sobre una ventana que cruce el 2026-07-20 debe promediarse por hora** (o por
un bucket temporal), nunca con un `avg()` plano.

Medido sobre la brecha de venta a 90 días: **20,37 % plana contra 25,81 %
ponderada — 5,4 puntos de sesgo** hacia el tramo más denso, que es el reciente y el
de brecha baja. Dentro de esa ventana la densidad varía 34× (38 a 1.283
muestras/día). Los extremos sí se toman por muestra: son valores observados y
promediarlos escondería el pico.

La comparativa que publica el motor ([lectura de
mercado](lectura-de-mercado.md)) ya aplica esta regla.
