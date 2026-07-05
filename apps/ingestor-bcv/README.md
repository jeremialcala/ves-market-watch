# ingestor-bcv

Servicio de ingesta de la tasa oficial VES/USD publicada por el BCV.

## Qué hace
- Consulta el sitio del BCV 2×/hora con TLS anclado (nunca `verify=False` — ADR-0006).
- Extrae y valida la tasa (rango de plausibilidad); anomalías → estado `suspect` (HITL).
- Publica `official.rate.updated` solo cuando el valor o la fecha-valor cambian.
- Persiste histórico completo en TimescaleDB.

## Requisitos y diseño
- PRD: `../../docs/01-requirements/ingesta-bcv.md`
- ADR-0006 · Amenaza T1 en `../../docs/02-design/threat-model.md`

## Estructura
```
src/ingestor_bcv/
tests/                  # pirámide: unit / integration / contract / e2e
docs/design.md
```
