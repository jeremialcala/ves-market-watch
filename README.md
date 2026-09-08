# Criterio

Plataforma de seguimiento en tiempo casi real de la diferencia cambiaria en Venezuela:
tasa oficial **VES/USD (BCV)** vs. mercado P2P **VES/USDT (Binance)**, con motor de
indicadores financieros expuestos vía API REST y WebSocket (WSS).

## Estructura (estándar AI-DLC)

```
ves-market-watch/            # el repositorio conserva el nombre viejo (ADR-0024)
├── .ai-dlc/                  # Metodología: gates y plantillas
│   ├── gates/                # Checklists de gates (0 a 3 creados; siguientes al cerrar cada fase)
│   └── templates/            # prd, adr, threat-model
├── .github/workflows/        # CI: `ci.yml` (matriz de los 6 proyectos), `seguridad.yml` y `e2e-vivo.yml`
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
│   ├── 04-testing/           # Plan de pruebas y criterios del Gate 3
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

### El túnel de Cloudflare (ADR-0020)

El flujo de login bueno —HTTPS real, sin consentimiento y con sesión que aguanta
un F5— necesita los dos hostnames del túnel, y el conector va **en el compose**,
tras un perfil para no imponérselo a quien no lo use:

```sh
CLOUDFLARE_TUNNEL_TOKEN=… docker compose --profile tunel up -d --wait
```

El token es un secreto y su sitio es el `.env` de la raíz, que está gitignorado.

**El ingress se configura en el panel de Cloudflare Zero Trust** (el conector
arranca con `--token`, así que las reglas no viven en el repositorio) y tiene que
apuntar a **nombres de servicio**, que es la razón de que el conector esté en esta
red:

| Public hostname | Service |
|---|---|
| `criterio-dev.higerotech.com` | `http://web-spa:80` |
| `criterio-api-dev.higerotech.com` | `http://api-gateway:8000` |

Antes apuntaban a la IP de LAN del host, que es de DHCP: el 2026-08-23 cambió y
se llevó por delante el entorno. Si un día la SPA se queda con los datos
congelados, la comprobación que lo identifica en un segundo es

```sh
curl -s -o /dev/null -w "%{content_type}" https://criterio-api-dev.higerotech.com/api/v1/health
```

`application/json` es lo correcto; **`text/html` significa que ese hostname está
sirviendo el SPA** y ninguna llamada del cliente llega al gateway.

Cada servicio tiene CLI propio: `python -m ingestor_bcv [--once] [--dry-run]` (más el
subcomando de operador `revalidar`), `python -m ingestor_binance [--once] [--dry-run]`,
`python -m indicator_engine [--drain]` y
`python -m ingestor_historico cargar|cargar-oficiales|derivar-brechas|stats`;
detalles en el README de cada app. Los tests de infraestructura hacen skip elegante
si el compose no está levantado — y **solo** ante un fallo de conexión: cualquier
otro error es la suite rota y se dice así.

### Integración continua

Tres workflows en `.github/workflows/`:

- **`ci.yml`** — matriz de los seis proyectos con la suite **completa**
  (`integration` y `e2e` incluidas) contra TimescaleDB y RabbitMQ levantados como
  `services:` del trabajo. Umbral de cobertura por servicio y reporte como
  artefacto, también cuando falla. En cada push y cada PR.
- **`seguridad.yml`** — los gates de seguridad **rompiendo el build**, no avisando:
  `gitleaks` sobre la historia completa (T6), `pip-audit` por servicio y
  `npm audit --audit-level=high` (T8), CodeQL con umbral de severidad sobre el
  SARIF (T9) y **DAST con ZAP contra el gateway real** (T4/T9/T11) en dos pasadas
  —el borde de autenticación sin token y los handlers de verdad con un token
  M2M—, con triaje que rompe el build ante cualquier Medium/High y ante cualquier
  Low no declarada. En cada push y cada PR, más una pasada semanal: una
  dependencia no cambia, pero lo que se sabe de ella sí.
- **`e2e-vivo.yml`** — el gateway de verdad, levantado con compose en el propio
  runner. Los **rechazos** (401 del REST, cierre 4401 del WSS) prueban código y
  van en cada PR; el **camino feliz** con el client M2M prueba la configuración
  del tenant de Auth0 —que no se rompe con un commit, sino cuando alguien toca su
  panel— y va en push a main/develop y en un cron a las **06:00 UTC**. Requiere
  `AUTH0_M2M_CLIENT_ID` y `AUTH0_M2M_CLIENT_SECRET` como secretos de Actions.
  Nginx y el túnel quedan fuera: eso sigue siendo la corrida manual.

Los umbrales de cobertura de los **cinco servicios Python** son un **trinquete**
en su valor actual, no el 80 % plano: el criterio de Gate 2 es el 80 %, pero lo
que rompe el build es cualquier retroceso desde donde está hoy cada uno. El
`web-spa` es la excepción y aplica el **80 % de ramas liso**, declarado en
`vite.config.ts`.

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
  `demo · sin fuente`; desde el **2026-09-07 no queda ninguno**. Se fueron por
  dos caminos distintos: los medidores (ADR-0019), la lectura del mercado
  (ADR-0021) y los **riesgos** (cortes en `riesgos.v1.yaml`) pasaron a dato
  servido, mientras que los **escenarios se retiraron** por inconstruibles — el
  régimen sobre el que pretendían condicionar dura menos de una hora contra un
  horizonte de 72 h, y esperar más meses no lo arregla
  (`docs/01-requirements/analisis-comprensivo.md`).
  El login quedó operativo el 2026-08-01 con dominio propio de Auth0 y desarrollo
  por túneles de Cloudflare (ADR-0020); el tenant lleva aprovisionado desde el
  2026-07-27.
  La barra tiene **tres** pestañas desde el 2026-09-07: Análisis se disolvió
  —su presión de liquidez y sus riesgos se montan ahora en el dashboard, donde
  ya tenían hermanos— porque lo que le quedaba tras retirar los escenarios no
  era análisis del mercado y no justificaba un nivel propio de navegación.
  La vista de **Histórico** se rehízo entre el 2026-09-05 y el 2026-09-06: capa de
  referencia sobre la serie (banda intercuartil, mediana y umbral de la regla),
  panel de lectura que dice dónde cae el dato de hoy dentro de su ventana,
  episodios comparables, historial de reglas **sin contador de aciertos** —un
  «N de M» se lee como tasa de acierto y esto no pronostica—, eje X **temporal**
  (los fines de semana sin fecha-valor del BCV ocupan sitio en vez de borrarse),
  tooltip de tres líneas —cuándo, cuánto y si eso es mucho— y dos estados
  explícitos para la ventana insuficiente y la serie vacía. Los dos gráficos son
  ya **un único componente** (`SerieTemporal`) con flags distintos, recorrible
  con teclado.
- **Gate 3 (pruebas): los tres criterios cubiertos, pendiente de firma HITL.**
  Cobertura **≥ 80 % en los seis** con las dos métricas —combinada y ramas solas—,
  medida por la propia pipeline el **2026-09-07**. Combinada sobre `src/`:
  `ingestor-bcv` 99,36 · `ingestor-binance` 99,30 · `ingestor-historico` 97,22 ·
  `api-gateway` 92,86 · `web-spa` 92,87 · `indicator-engine` 85,89; la más baja en
  ramas solas sigue siendo 82,71 (`indicator-engine`). **1 456 tests** en total:
  792 de los cinco servicios Python y 664 del SPA. El **e2e autenticado en vivo
  con token real** se cumplió el 2026-08-07 (6/6 contra el tenant y el gateway
  reales) y **corre en el pipeline desde el 2026-08-20**. Lo que queda abierto es
  la firma HITL de los dos gates. La **deuda de T8 se cerró el 2026-09-08**:
  `requirements.lock` con hashes en los cinco servicios Python —de los que
  instalan CI, las imágenes y el propio `pip-audit`, así que lo auditado es lo
  que se despliega— y todas las imágenes fijadas por digest
  (`scripts/regenerar-locks.sh` los regenera). El CVE-2026-59870 de `js-yaml` **dejó de ser una excepción
  aceptada el 2026-09-06**, cuando el parche llegó a la línea 4.x y bastó un
  `npm update`. Detalle en `docs/04-testing/plan-de-pruebas.md` §10 y §12.

### Gates AI-DLC

**Ojo con la numeración: cambió el 2026-09-06.** El proyecto llamaba «Gate 2» al
de la fase 04-testing, y en AI-DLC esa fase cierra el **Gate 3**; el Gate 2 es el
de la fase 03-implementation. No fue un renombrado: la lista que se venía usando
mezclaba criterios de ambos y se repartieron por criterio.

| Gate | Fase | Criterios canónicos | Estado |
|---|---|---|---|
| **0** | 01-requirements | reqs de seguridad + escenarios de abuso + threat assessment + datos clasificados | ✅ aprobado HITL 2026-07-11 |
| **1** | 02-design | threat model + C4 + ADRs + contratos de API | ✅ aprobado HITL 2026-07-11 |
| **2** | 03-implementation | SAST limpio + deps verificadas + 80 % cobertura | ✅ criterios cubiertos — **pendiente de firma HITL** |
| **3** | 04-testing | tests pasando + DAST limpio + perf dentro de SLOs | ✅ los 3 cubiertos — **pendiente de firma HITL** |
| **4** | 05-deployment | pipeline limpio + IaC escaneado + runbook de rollback | no iniciado |
| **5** | 06-monitoring | SLOs monitorizados + proceso de incidentes | no iniciado |

Fichas en `.ai-dlc/gates/`. El SLO de ingesta —que bloqueaba el Gate 3 con
7,16 s contra un techo de 5 s— **se resolvió el 2026-09-06 con ADR-0026**,
paginando en lotes concurrentes: **1,40 s** medidos, sin un solo 429. Antes de
firmar el gate conviene confirmar ese p95 sobre una corrida larga y comprobar que
la tasa de 429 no ha subido: la muestra que lo respalda son 15 minutos. Esa
comprobación **está programada** —`scripts/verificar_slo_ingesta.py`, que solo
sale con 0 si el p95 aguanta y los 429 no han subido— y deja su informe en
`informes/`.

## Dónde seguir

- Inventario de cambios por ejecución: `CHANGELOG.md`.
- Contexto curado para agentes y humanos: `knowledge/index.md` (OKF v0.1 — punto
  de entrada recomendado para retomar el proyecto).
- Plan de pruebas, SLOs y criterios de gate: `docs/04-testing/plan-de-pruebas.md`.
- Fichas de gate con su estado y su firma: `.ai-dlc/gates/`.
