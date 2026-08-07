# Criterio

Plataforma de seguimiento en tiempo casi real de la diferencia cambiaria en Venezuela:
tasa oficial **VES/USD (BCV)** vs. mercado P2P **VES/USDT (Binance)**, con motor de
indicadores financieros expuestos vía API REST y WebSocket (WSS).

## Estructura (estándar AI-DLC)

```
ves-market-watch/            # el repositorio conserva el nombre viejo (ADR-0024)
├── .ai-dlc/                  # Metodología: gates y plantillas
│   ├── gates/                # Checklists de gates (0 y 1 creados; siguientes al cerrar cada fase)
│   └── templates/            # prd, adr, threat-model
├── .github/workflows/        # CI: `ci.yml` (matriz de los 6 proyectos) y `seguridad.yml`
├── .gitleaks.toml            # Excepciones del escaneo de secretos, una a una y con motivo
├── knowledge/                # Contexto del proyecto en Open Knowledge Format (ADR-0010)
├── schemas/                  # Contratos de eventos del bus (JSON Schema 2020-12)
├── docker-compose.yml        # Infra dev/test (RabbitMQ + TimescaleDB) y las apps: los 3 servicios
│                             # con daemon, api-gateway (8800) y web-spa por nginx (8080)
├── docs/
│   ├── 00-project/           # Charter, glosario, clasificación de datos, ADRs
│   ├── 01-requirements/      # PRDs por funcionalidad (Gate 0)
│   ├── 02-design/            # Arquitectura, threat model, contratos API (Gate 1)
│   ├── 03-implementation/    # Historial del repo (generado por script, no editar a mano)
│   ├── 04-testing/           # Plan de pruebas y criterios del Gate 2
│   └── architecture/         # Diagramas C4 (Mermaid)
└── apps/
    ├── ingestor-binance/     # ✔ Ingesta P2P Binance (USDT/VES) → p2p.snapshot
    ├── ingestor-bcv/         # ✔ Ingesta tasas oficiales BCV (multi-moneda, HITL)
    ├── indicator-engine/     # ✔ fases 1+2, señales y análisis: consume official.rate.updated y p2p.snapshot → emite indicators.updated, signals.emitted y analysis.updated
    ├── ingestor-historico/   # ✔ backfill batch de históricos de precio + varianza (sin bus)
    ├── api-gateway/          # ✔ REST /api/v1 + WSS /ws/v1 (Resource Server Auth0)
    └── web-spa/              # ✔ dashboard web React (Auth0 PKCE) — ADR-0017
```

## Stack decidido (ver ADRs en `docs/00-project/adr/`)

- Python 3.12+ (asyncio) para servicios.
- RabbitMQ como bus de eventos entre ingesta e indicadores (ADR-0004).
- PostgreSQL + TimescaleDB para series de tiempo (ADR-0002).
- Autenticación OIDC con Auth0 (Authorization Code + PKCE); el api-gateway es Resource
  Server y valida access tokens (ADR-0012, supersede ADR-0003).
- Front-end: React + Vite + TypeScript con @auth0/auth0-react; tokens en memoria +
  refresh rotation, CORS por allowlist en el gateway (ADR-0017).
- Sistema de diseño Higerotech en el `web-spa` (tokens y fuentes autoalojadas),
  tema claro/oscuro e interfaz ES/EN (ADR-0018).

## Desarrollo

```sh
docker compose up -d --wait        # RabbitMQ (5672/15672) + TimescaleDB (5433)
cd apps/<servicio> && pip install -e .[dev] && python -m pytest
```

Front-end: `cd apps/web-spa && npm install && npm run dev` (http://localhost:5173;
el compose lo sirve compilado en http://localhost:8080; `npm test` corre su suite).

Cada servicio tiene CLI propio: `python -m ingestor_bcv [--once] [--dry-run]` (más el
subcomando de operador `revalidar`), `python -m ingestor_binance [--once] [--dry-run]`,
`python -m indicator_engine [--drain]` y
`python -m ingestor_historico cargar|cargar-oficiales|derivar-brechas|stats`;
detalles en el README de cada app. Los tests de infraestructura hacen skip elegante
si el compose no está levantado — y **solo** ante un fallo de conexión: cualquier
otro error es la suite rota y se dice así.

### Integración continua

Dos workflows en `.github/workflows/`, ambos en cada push y cada PR:

- **`ci.yml`** — matriz de los seis proyectos con la suite **completa**
  (`integration` y `e2e` incluidas) contra TimescaleDB y RabbitMQ levantados como
  `services:` del trabajo. Umbral de cobertura por servicio y reporte como
  artefacto, también cuando falla.
- **`seguridad.yml`** — los gates de Gate 2 **rompiendo el build**, no avisando:
  `gitleaks` sobre la historia completa (T6), `pip-audit` por servicio y
  `npm audit --audit-level=high` (T8), y CodeQL con umbral de severidad sobre el
  SARIF (T9). Además, una pasada semanal: una dependencia no cambia, pero lo que
  se sabe de ella sí.

Los umbrales de cobertura son un **trinquete** en el valor actual de cada
servicio, no el 80 % plano: el criterio de Gate 2 es el 80 %, pero lo que rompe el
build es cualquier retroceso desde donde está hoy cada uno.

## Estado

- **Implementado y verificado en vivo: los 5 servicios** — `ingestor-bcv` (multi-moneda,
  re-validación HITL), `ingestor-binance` (polling P2P educado), `indicator-engine`
  (fases 1+2 con microestructura P2P, motor de señales RF-4/ADR-0015 y análisis de la
  revisión RF-6/ADR-0019 con la lectura del mercado RF-7/ADR-0021: brecha BCV↔P2P
  → `indicators.updated`, `signals.emitted` y `analysis.updated`), `ingestor-historico` (backfill batch
  de exports históricos + varianza, ADR-0013) y `api-gateway` (REST `/api/v1` + WSS
  `/ws/v1`, Resource Server contra Auth0 — ADR-0012/ADR-0016; en dev en
  `http://localhost:8800`, `python -m api_gateway`). El pipeline completo
  fuente → bus → indicadores/señales → REST/WSS está operativo.
- **Front-end `web-spa` implementado** (2026-07-27, ADR-0017): dashboard React con
  login Auth0 (PKCE), stream WSS con reconexión y vista de histórico; servido por
  nginx en el compose (`http://localhost:8080`). Desde el 2026-07-31 viste el
  **sistema de diseño Higerotech** con tema claro/oscuro e interfaz ES/EN
  (ADR-0018); los bloques que la plataforma no calcula van marcados
  `demo · sin fuente` — quedan **dos** (escenarios con probabilidades y riesgos
  redactados) tras retirar los medidores (ADR-0019) y la lectura del mercado
  (ADR-0021), y esos dos no son deuda: hacerlos reales exigiría pronosticar.
  El login quedó operativo el 2026-08-01 con dominio propio de Auth0 y desarrollo
  por túneles de Cloudflare (ADR-0020); el tenant lleva aprovisionado desde el
  2026-07-27.
- **Gate 2 (pruebas) en curso.** Cobertura de ramas **≥ 80 % en los seis**
  (2026-08-04): `ingestor-bcv` 99,36 · `ingestor-binance` 99,26 · `ingestor-historico`
  97,22 · `api-gateway` 93,00 · `web-spa` 88,19 · `indicator-engine` 85,88. 1 254
  tests en total. Quedan abiertos el e2e autenticado en vivo con token real (HITL)
  y la deuda del control de T8 —lockfiles y digests—; detalle en
  `docs/04-testing/plan-de-pruebas.md` §10 y §12.
- Gate 0 (requisitos): aprobado — `.ai-dlc/gates/gate-0-requirements.md`
- Gate 1 (diseño): aprobado, sin pendientes desde la ratificación del DREAD de T15
  (2026-08-04) — `.ai-dlc/gates/gate-1-design.md`
- Inventario de cambios por ejecución: ver `CHANGELOG.md`
- Contexto curado para agentes y humanos: ver `knowledge/index.md` (OKF v0.1 — punto de
  entrada recomendado para retomar el proyecto)
