# VES Market Watch

Plataforma de seguimiento en tiempo casi real de la diferencia cambiaria en Venezuela:
tasa oficial **VES/USD (BCV)** vs. mercado P2P **VES/USDT (Binance)**, con motor de
indicadores financieros expuestos vía API REST y WebSocket (WSS).

## Estructura (estándar AI-DLC)

```
ves-market-watch/
├── .ai-dlc/                  # Metodología: gates y plantillas
│   ├── gates/                # Checklists de Gate 0..5
│   └── templates/            # prd, adr, threat-model
├── knowledge/                # Contexto del proyecto en Open Knowledge Format (ADR-0010)
├── docs/
│   ├── 00-project/           # Charter, glosario, clasificación de datos, ADRs
│   ├── 01-requirements/      # PRDs por funcionalidad (Gate 0)
│   ├── 02-design/            # Arquitectura, threat model, contratos API (Gate 1)
│   └── architecture/         # Diagramas C4 (Mermaid)
└── apps/
    ├── ingestor-binance/     # Ingesta P2P Binance (VES/USDT)
    ├── ingestor-bcv/         # Ingesta tasa oficial BCV (VES/USD)
    ├── indicator-engine/     # Motor reactivo de indicadores
    └── api-gateway/          # API REST + WSS para consumidores
```

## Stack decidido (ver ADRs en `docs/00-project/adr/`)

- Python 3.12+ (asyncio) para servicios.
- RabbitMQ como bus de eventos entre ingesta e indicadores (ADR-0004).
- PostgreSQL + TimescaleDB para series de tiempo (ADR-0002).
- JWT / OAuth2 client credentials para consumidores de API/WSS (ADR-0003).

## Estado

- Gate 0 (requisitos): ver `.ai-dlc/gates/gate-0-requirements.md`
- Gate 1 (diseño): ver `.ai-dlc/gates/gate-1-design.md`
- Inventario de cambios por ejecución: ver `CHANGELOG.md`
- Contexto curado para agentes y humanos: ver `knowledge/index.md` (OKF v0.1 — punto de
  entrada recomendado para retomar el proyecto)
