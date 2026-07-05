# Tests — ingestor-bcv (pirámide AI-DLC)

- `unit/` — parser (HTML válido/alterado), validación de rango, transición valid→suspect→stale.
- `integration/` — cliente HTTP con cert inválido (debe fallar), timeouts.
- `contract/` — evento `official.rate.updated` cumple `schemas/official-rate.v1.json`.
- `e2e/` — ciclo completo con sitio mock + RabbitMQ + DB efímeros.
