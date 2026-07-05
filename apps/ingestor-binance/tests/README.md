# Tests — ingestor-binance (pirámide AI-DLC)

- `unit/` — normalización, etiquetado de outliers, validación de esquema (fixtures sintéticos).
- `integration/` — cliente HTTP contra mock del endpoint (429, payload gigante, esquema roto).
- `contract/` — evento `p2p.snapshot` cumple `schemas/p2p-snapshot.v1.json`.
- `e2e/` — ciclo completo contra RabbitMQ + DB efímeros (testcontainers).

Objetivo Gate 2: ≥ 80 % cobertura de ramas.
