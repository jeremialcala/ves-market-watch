# VES Market Watch

Plataforma de seguimiento en tiempo casi real de la diferencia cambiaria en Venezuela:
tasa oficial **VES/USD (BCV)** vs. mercado P2P **VES/USDT (Binance)**, con motor de
indicadores financieros expuestos vía API REST y WebSocket (WSS).

## Estructura (estándar AI-DLC)

```
ves-market-watch/
├── .ai-dlc/                  # Metodología: gates y plantillas
│   ├── gates/                # Checklists de gates (0 y 1 creados; siguientes al cerrar cada fase)
│   └── templates/            # prd, adr, threat-model
├── knowledge/                # Contexto del proyecto en Open Knowledge Format (ADR-0010)
├── schemas/                  # Contratos de eventos del bus (JSON Schema 2020-12)
├── docker-compose.yml        # Infra compartida dev/test: RabbitMQ + TimescaleDB
├── docs/
│   ├── 00-project/           # Charter, glosario, clasificación de datos, ADRs
│   ├── 01-requirements/      # PRDs por funcionalidad (Gate 0)
│   ├── 02-design/            # Arquitectura, threat model, contratos API (Gate 1)
│   └── architecture/         # Diagramas C4 (Mermaid)
└── apps/
    ├── ingestor-binance/     # ✔ Ingesta P2P Binance (USDT/VES) → p2p.snapshot
    ├── ingestor-bcv/         # ✔ Ingesta tasas oficiales BCV (multi-moneda, HITL)
    ├── indicator-engine/     # ✔ fases 1+2 y señales: consume official.rate.updated y p2p.snapshot → emite indicators.updated y signals.emitted
    ├── ingestor-historico/   # ✔ backfill batch de históricos de precio + varianza (sin bus)
    └── api-gateway/          # (diseñado) API REST + WSS para consumidores
```

## Stack decidido (ver ADRs en `docs/00-project/adr/`)

- Python 3.12+ (asyncio) para servicios.
- RabbitMQ como bus de eventos entre ingesta e indicadores (ADR-0004).
- PostgreSQL + TimescaleDB para series de tiempo (ADR-0002).
- Autenticación OIDC con Auth0 (Authorization Code + PKCE); el api-gateway es Resource
  Server y valida access tokens (ADR-0012, supersede ADR-0003).

## Desarrollo

```sh
docker compose up -d --wait        # RabbitMQ (5672/15672) + TimescaleDB (5433)
cd apps/<servicio> && pip install -e .[dev] && python -m pytest
```

Cada servicio tiene CLI propio: `python -m ingestor_bcv [--once] [--dry-run]` (más el
subcomando de operador `revalidar`), `python -m ingestor_binance [--once] [--dry-run]`,
`python -m indicator_engine [--drain]` y `python -m ingestor_historico cargar|stats`;
detalles en el README de cada app. Los tests de infraestructura hacen skip elegante
si el compose no está levantado.

## Estado

- **Implementado y verificado en vivo**: 4 servicios — `ingestor-bcv` (multi-moneda,
  re-validación HITL), `ingestor-binance` (polling P2P educado), `indicator-engine`
  (fases 1+2 con microestructura P2P y motor de señales RF-4/ADR-0015: brecha BCV↔P2P
  → `indicators.updated` y `signals.emitted`) e `ingestor-historico` (backfill batch
  de exports históricos + varianza, ADR-0013).
  Pendiente: el `api-gateway` (aún sin código; tenant Auth0 y contrato OpenAPI listos).
- Gate 0 (requisitos): ver `.ai-dlc/gates/gate-0-requirements.md`
- Gate 1 (diseño): ver `.ai-dlc/gates/gate-1-design.md`
- Inventario de cambios por ejecución: ver `CHANGELOG.md`
- Contexto curado para agentes y humanos: ver `knowledge/index.md` (OKF v0.1 — punto de
  entrada recomendado para retomar el proyecto)
