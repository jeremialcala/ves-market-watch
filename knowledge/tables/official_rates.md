---
type: TimescaleDB Hypertable
title: official_rates
description: Histórico completo (append-only, bitemporal) de las tasas oficiales del BCV. Una fila por captura y moneda; desde 2026-08-01 incluye el backfill 2020-2026 desde los XLS del BCV.
resource: ../../apps/ingestor-bcv/db/migrations/001_official_rates.sql
tags: [bcv, implementada, bitemporal]
timestamp: 2026-07-05T00:00:00Z
---

# official_rates

Hypertable particionada por `captured_at`. **Toda** consulta al BCV deja fila (auditoría),
publique o no evento — ver [official.rate.updated](../events/official-rate-updated.md).

## Esquema

| Columna | Tipo | Descripción |
|---|---|---|
| `captured_at` | timestamptz | Cuándo lo supo el sistema (dimensión de conocimiento, ADR-0009) |
| `currency` | text | Código ISO 4217 (USD, EUR, CNY, TRY, RUB…) |
| `rate` | numeric(20,8) | Valor VES por unidad; CHECK > 0 |
| `value_date` | date | Fecha-valor declarada por el BCV (dimensión de validez) |
| `status` | text | `valid` (publicada si cambió) / `suspect` (retenida, HITL) / `stale` (marca administrativa) / `rejected` (descartada: rechazo humano, timeout o reemplazo — ADR-0007) |
| `source` | text | Procedencia: `BCV` (scraper en vivo) · `BCV-historico` (backfill desde los XLS del BCV, ADR-0013 RF-6) · `BCV-historico-sin-hora` (backfill cuya hora de publicación no constaba en el XLS: la FECHA es real, la hora es el arranque del día) |
| `resolved_at` | timestamptz | Cuándo se resolvió la sospecha (migración 002) |
| `resolved_by` | text | Quién decidió: usuario del CLI o `system:timeout` |
| `resolution_note` | text | Justificación auditable de la decisión |

PK `(captured_at, currency)`; índice `(currency, captured_at DESC)`.

## Reglas
- **Append-only**: correcciones = fila nueva; vigente por `value_date` = mayor
  `captured_at` con `status='valid'` (ADR-0009).
- Escribe: [ingestor-bcv](../services/ingestor-bcv.md) (INSERT/SELECT; UPDATE solo
  para la resolución HITL de sospechas — única excepción al append-only, auditada).
  Leerá: indicator-engine y api-gateway (solo lectura).
- Retención ≥ 12 meses (clasificación: dato público). **Sin política automática de
  retención ni compresión**: el backfill de 2020 no se borra solo.

## Backfill histórico (2026-08-01, ADR-0013 RF-6)

31.078 filas de 23 monedas cubriendo `value_date` **2020-03-30 → 2026-08-03**, cargadas
con `ingestor-historico cargar-oficiales` desde `bcv_fx_historico.csv` (export de los
XLS que publica el propio BCV).

- **El valor es el ASK**, verificado contra la serie viva: en las 75 combinaciones
  (moneda, `value_date`) donde histórico y captura se solapan, los valores coinciden
  **exactamente**. La columna BID habría metido un escalón falso en la unión.
- **Escala BsD.** La redenominación del 2021-10-01 (÷ 1.000.000) queda absorbida:
  la serie pasa de 4,1386 (2021-09-29) a 4,1818 (2021-10-04) sin salto.
- **No pisa la serie viva**: `captured_at` es la hora de publicación del BCV, anterior
  a nuestra captura del mismo `value_date`, y las consultas resuelven por `captured_at`
  más reciente.
- **Dos huecos de un trimestre, heredados del origen**: falta `2021-01-04 → 2021-04-04`
  y `2023-07-05 → 2023-10-01`. Dos XLS trimestrales del BCV vienen truncados
  (`2_1_2a21_smc.xls` trae 9 días; `2_1_2c23_smc.xls`, 2). No es pérdida de la carga:
  esos días no existen en la fuente. Se anota aquí para que nadie los lea como «el BCV
  dejó de publicar tres meses».
- Solo `official_rates`: **no** se sembró `indicators.official_rate`. Un `calc_version`
  ahí mentiría sobre qué fórmula generó esas filas.
