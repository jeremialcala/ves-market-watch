# indicator-engine

Motor reactivo de indicadores: consume eventos de mercado y produce indicadores y señales.

## Qué hace
- Consume `p2p.snapshot` y `official.rate.updated` de `market.events` (validación de esquema, DLQ).
- Filtra outliers (MAD/IQR), calcula precio de referencia (mediana/VWAP top-N), brecha
  BCV↔P2P, spreads, volúmenes, profundidad, variación intradía y tendencias de liquidez.
- Evalúa reglas de señales (config versionada) y publica `indicators.updated` / `signals.emitted`.
- Persiste series con `calc_version` para reproducibilidad.

## Requisitos y diseño
- PRD: `../../docs/01-requirements/motor-indicadores.md`
- Amenazas T2, T5, T10 en `../../docs/02-design/threat-model.md`

## Estructura
```
src/indicator_engine/
tests/                  # pirámide: unit / integration / contract / e2e
docs/design.md
```
