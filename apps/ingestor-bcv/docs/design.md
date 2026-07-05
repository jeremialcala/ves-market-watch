# Diseño — ingestor-bcv

## Capas
- **Dominio:** `TasaOficial` (valor, fecha-valor, estado: valid|suspect|stale).
- **Casos de uso:** `SincronizarTasaOficial()` — fetch → parse → validar → publicar si cambió.
- **Puertos:** `OfficialRateSource`, `EventPublisher`, `RateRepository`.
- **Adaptadores:** cliente HTTP con bundle de CA explícito del BCV; parser selector+regex;
  AMQP; TimescaleDB.

## Validación
- Rango de plausibilidad: |Δ| ≤ 20 % vs. última tasa válida (configurable). Fuera de rango → `suspect`, no se publica.
- 3 fallos consecutivos de parseo/red → alerta + estado `stale` propagado.

## Pendiente (fase 03)
- `<TODO: capturar y versionar el bundle de certificados actual del BCV>`
- `<TODO: fixtures de HTML real del sitio para tests de parser>`
