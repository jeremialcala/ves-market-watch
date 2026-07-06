# Tests — ingestor-binance (pirámide AI-DLC)

- `unit/` — normalización/sanitización, minimización del crudo, outliers MAD,
  resiliencia (backoff/breaker/presupuesto con reloj fake) y caso de uso.
  Los fixtures de `fixtures/` son respuestas **reales** del endpoint (spike 2026-07-05).
- `integration/` — cliente contra servidor HTTP local (paginación, parcial, tope de
  bytes, esquema roto), publisher contra RabbitMQ real, repositorio + retención 90 d.
- `contract/` — evento `p2p.snapshot` cumple `schemas/p2p-snapshot.v1.json`.
- `e2e/` — endpoint fake + RabbitMQ/TimescaleDB reales del `docker compose` raíz.

```sh
python -m pytest -m "not integration and not e2e"   # sin infraestructura
docker compose up -d --wait && python -m pytest      # suite completa
```

Sin infraestructura, los tests que la requieren hacen skip con instrucciones.
Objetivo Gate 2: ≥ 80 % cobertura de ramas.
