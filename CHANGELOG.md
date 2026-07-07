# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
y el proyecto se adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!--
Convención de mantenimiento (inventario por ejecución):
- Cada ejecución/sesión de trabajo agrega sus cambios bajo [Unreleased],
  usando las categorías estándar: Added, Changed, Deprecated, Removed, Fixed, Security.
- Al cerrar un hito (p. ej. un gate AI-DLC o un release), se corta una versión:
  se renombra [Unreleased] a [X.Y.Z] - AAAA-MM-DD y se abre un nuevo [Unreleased].
- Guía de versiones mientras no haya código en producción: 0.x.y
  (minor = nueva funcionalidad o gate completado, patch = correcciones/ajustes de docs).
-->

## [Unreleased]

### Added

- **Implementación de ADR-0011 en `ingestor-binance`** — cierre del motor de ingesta P2P:
  - `Pseudonimizador` en el dominio: `merchant_ref = HMAC-SHA256(MERCHANT_HMAC_KEY,
    advertiser.userNo)` truncado a 128 bits (32 hex); nunca sobre el alias (rompería
    la correlación). Sin identificador estable → `null`.
  - `merchant_ref` viaja en cada anuncio de `p2p.snapshot` (contrato **v1.1 aditivo**:
    campo requerido en `schemas/p2p-snapshot.v1.json`; el `schema_version` del sobre
    sigue en 1) y se persiste en el crudo minimizado — el alias e ID crudos siguen
    sin tocar disco ni bus.
  - `MERCHANT_HMAC_KEY` requerida con fail fast al arrancar (dev: `openssl rand -hex 32`);
    clave débil (< 16 bytes) rechazada al construir.
  - +7 tests (determinismo del HMAC, correlación por anunciante, alias no altera el
    pseudónimo, contrato v1.1 rechaza anuncios sin `merchant_ref`, e2e con refs en DB
    y eventos): suite del servicio en 48.
  - Verificación en vivo con dos corridas y la misma clave: 96 anunciantes únicos por
    snapshot (100 anuncios — la dedup que motiva el ADR ya es visible) y 88
    correlacionados entre corridas; cero alias en disco.
- ADR-0011 (accepted): pseudonimización HMAC-SHA256 del identificador de anunciantes P2P
  (`merchant_ref`, clave dedicada `MERCHANT_HMAC_KEY` en secret store, sin rotación
  programada). Cierra el `<TODO>` de `data-classification.md`: historia analítica
  (dedup de profundidad, concentración, recurrencia, forense) sin alias ni ID crudos en
  disco. Implementación pendiente en `ingestor-binance` (contrato p2p-snapshot v1.1).
  PRD de ingesta P2P y clasificación de datos actualizados.

- **Bundle de contexto en Open Knowledge Format (OKF v0.1)** en `knowledge/` (ADR-0010):
  conceptos tipados con frontmatter YAML para servicios, eventos AMQP, tablas y métricas,
  con estado de implementación y grafo de links a PRDs/ADRs/migraciones; `index.md` de
  navegación y `log.md` de historia del contexto. Punto de entrada para agentes y humanos
  al retomar el proyecto.
- ADR-0010 (proposed): adopción de OKF para mantener el contexto del proyecto.

- **`ingestor-bcv` — primera implementación ejecutable del proyecto** (PRD ingesta BCV):
  paquete Python 3.12 (`apps/ingestor-bcv/`) con arquitectura hexagonal:
  - Dominio: `TasaOficial` con estados `valid|suspect|stale` y validación de
    plausibilidad (|Δ| ≤ 20 % configurable, valor positivo, fecha-valor no retrocede).
  - Caso de uso `SincronizarTasasOficiales`: fetch → validar → persistir siempre →
    publicar `official.rate.updated` solo en cambio de valor o fecha-valor (RF-1..RF-5).
  - Adaptador BCV: cliente httpx con TLS anclado a bundle de CA versionado
    (`certs/bcv-ca-bundle.pem`, cadena Sectigo verificada — ADR-0006, nunca
    `verify=False`) y parser con selectores CSS + fallback regex.
  - Adaptador RabbitMQ (aio-pika): exchange topic `market.events`, publisher confirms,
    mensajes persistentes, sobre estándar con `event_id`/`schema_version` (ADR-0004).
  - Adaptador TimescaleDB (asyncpg) con queries parametrizadas y migración
    `db/migrations/001_official_rates.sql` (hypertable `official_rates` +
    `official_rate_source_health`).
  - Circuito de fallos: 3 fallos consecutivos de la fuente → alerta + marca `stale`.
  - Scheduler 2×/hora con jitter; CLI `python -m ingestor_bcv [--once] [--dry-run]`.
  - 28 tests (unit + contract) contra fixture de HTML real del BCV; verificación
    end-to-end en dry-run contra el sitio vivo (5 monedas publicadas).
- Bundle de CA del BCV capturado y verificado (`openssl verify: OK`) con procedimiento
  de regeneración documentado en `apps/ingestor-bcv/certs/README.md`.
- Fixture de página real de bcv.org.ve (capturada 2026-07-05, fecha-valor 2026-07-06)
  en `apps/ingestor-bcv/tests/fixtures/`.
- **Tests de integración y e2e contra infraestructura real** (`ingestor-bcv`):
  - `docker-compose.yml` en la raíz del repo con RabbitMQ 4 (management) y
    TimescaleDB pg16 (publicada en el puerto 5433: el 5432 suele estar ocupado por
    un PostgreSQL local/WSL), healthchecks y la migración del ingestor montada en
    el init de la DB sin aplastar el init propio de la imagen.
  - `tests/integration/`: repositorio contra TimescaleDB real (round-trip con
    fidelidad de tipos, `suspect` no contamina la referencia, contador de fallos,
    `stale_since` idempotente, ON CONFLICT), publisher contra RabbitMQ real
    (consumo del mensaje íntegro, confirms, reconexión perezosa) y anclaje TLS
    del cliente contra servidor HTTPS local con CA efímera (trustme): CA no
    anclada rechazada / CA anclada permite fetch+parseo completo.
  - `tests/e2e/`: ciclo completo sitio-mock → caso de uso → RabbitMQ → TimescaleDB
    con cola consumidora (publica 5 monedas, heartbeat sin duplicar eventos,
    tasa disparada queda `suspect` sin publicarse).
  - Fixtures con probe + skip elegante: sin infraestructura levantada la suite
    unit/contract sigue en verde y los tests de infra se saltan con instrucciones.
    Markers `integration`/`e2e` registrados en pyproject; nueva dev-dep `trustme`.
- **Job de re-validación HITL para tasas `suspect`** (`ingestor-bcv`, ADR-0007):
  - Caso de uso `RevalidarTasasSospechosas` y CLI de operador
    `python -m ingestor_bcv revalidar listar|aprobar|rechazar` con nota obligatoria
    y usuario auditables. Aprobar promueve la sospecha más reciente a `valid`, la
    publica como `official.rate.updated` y la convierte en la nueva referencia
    (con guardia si existe una captura válida posterior); rechazar descarta todas
    las pendientes de la moneda.
  - Nuevo estado terminal `rejected` (la «descartada» del ADR) y expiración por
    timeout: sospechas sin revisión humana en `SUSPECT_TTL_HOURS` (default 24)
    expiran a `rejected` con actor `system:timeout` en cada ciclo de sincronización.
  - Migración `002_suspect_resolution.sql`: CHECK de `status` extendido y columnas
    de auditoría `resolved_at`/`resolved_by`/`resolution_note` (montada también en
    el init del compose).
  - +11 tests (unit de revalidación y TTL, integración de resolución con auditoría,
    e2e ampliado a 5 fases con aprobación real vía RabbitMQ): suite en 53.
  - Verificación manual del CLI contra infraestructura real: sospecha sembrada,
    `listar` → `aprobar` → evento consumido de la cola y auditoría en DB.
- **`indicator-engine` fase 1 — primer consumidor de `official.rate.updated`**
  (PRD motor-indicadores, RF-1/RF-2/RF-3/RF-5 parciales):
  - Paquete Python hexagonal (`apps/indicator-engine/`): consumidor AMQP con cola
    durable propia, validación de todo evento contra schema (A05/A08), DLQ
    `market.events.dlq` vía dead-letter-exchange (ADR-0004) e idempotencia por
    `event_id` (tabla `processed_events`, escenario negativo 2).
  - Indicadores fase 1 por moneda: `official_rate` y variación abs/% vs. último
    conocido; fórmula de la brecha BCV↔P2P en el dominio (pura, testeada), lista
    para activarse con la referencia P2P de fase 2.
  - Bandera `official_stale` computada (captura > 6 h, ADR-0007) y `triggered_by`
    con el event_id origen en cada `indicators.updated` (trazabilidad V16).
  - Hypertable `indicators` (formato largo con `calc_version`, reproducibilidad
    RF-3) en migración propia, montada también en el init del compose.
  - CLI `python -m indicator_engine [--drain]`; 26 tests (unit, contract,
    integración con topología AMQP aislada por test, e2e con dos eventos y
    validación del emitido contra su schema).
  - Verificación manual del flujo real entre servicios: `ingestor_bcv --once`
    (sitio BCV vivo) → 5 eventos → engine `--drain` → 5 filas en `indicators` y
    5 `indicators.updated` consumidos de una cola espía.
- **Contratos formales de eventos en `schemas/`** (raíz del repo, como los nombraba
  `api-contracts.md`): `official-rate.v1.json` e `indicators.v1.json` (JSON Schema
  2020-12). Verificados en ambos lados: el ingestor-bcv valida lo que produce
  (nuevo contract test) y el engine valida lo que consume y lo que emite.
- **`ingestor-binance` — última fuente de datos implementada** (PRD ingesta
  Binance P2P, ADR-0005):
  - Spike técnico del endpoint resuelto con datos vivos: HTTP 200 con la forma
    esperada (~643 anuncios USDT/VES); respuestas reales versionadas como fixtures
    y semántica de `tradeType` documentada (perspectiva del taker).
  - Polling educado: User-Agent identificable, presupuesto de requests/min
    (ventana deslizante), backoff exponencial con jitter ante 429/5xx y circuit
    breaker con cooldown/half-open que alerta solo al abrir — nunca rotación de IP.
  - Validación de cada página contra el schema de la fuente
    (`apps/ingestor-binance/schemas/binance-adv-search.response.json`): cambio de
    esquema → descarte + alerta, jamás se publica un snapshot corrupto (A10).
  - Normalización con sanitización de textos (A05) y outliers de precio
    **etiquetados** por MAD (z-score modificado, k=3.5) con fallback para MAD=0 y
    piso de desviación relativa del 2 % — calibrado contra el fixture real, donde
    el MAD puro marcaba dispersión legítima de un mercado agrupado (±0.3 %).
  - Defensas de red: TLS estricto, timeout y tope de bytes por streaming
    (zip-bomb); páginas incompletas → snapshot `partial=true`.
  - Contrato `schemas/p2p-snapshot.v1.json` + hypertable `p2p_snapshots_raw`
    (JSONB crudo, retención nativa 90 días, RF-5) montada en el init del compose.
  - CLI `python -m ingestor_binance [--once] [--dry-run]`; 40 tests con servidor
    HTTP local (paginación, parcial, tope de bytes, schema roto) y e2e contra
    RabbitMQ/TimescaleDB reales.
  - Verificación en vivo: dry-run contra Binance real (100 anuncios/lado) y flujo
    productor→bus con cola espía (2 `p2p.snapshot` + crudos en DB).

### Fixed

- **Minimización de datos en el crudo P2P persistido** (coherencia con
  `docs/00-project/data-classification.md`, que ordena no persistir alias de
  anunciantes): nueva función pura `minimizar_crudo` — del `advertiser` solo se
  conservan `userType` y métricas públicas; alias e identificadores pseudónimos
  (`nickName`, `userNo`, etc.) se redactan antes de tocar disco. Verificado en
  unit y e2e (el crudo en DB no contiene `nickName`). El `<TODO: confirmar>`
  humano de la clasificación sigue abierto.

### Changed

- **Alcance del PRD de ingesta BCV ampliado a multi-moneda**: se ingestan todas las
  monedas de la sección «tipo de cambio de referencia» (hoy USD, EUR, CNY, TRY, RUB)
  con descubrimiento dinámico de monedas nuevas; antes el objetivo era solo VES/USD.
  PRD `docs/01-requirements/ingesta-bcv.md` actualizado a estado `accepted — implementado`.
- README y `docs/design.md` de `apps/ingestor-bcv` reescritos con la arquitectura
  implementada, instrucciones de ejecución y los TODO de fase 03 resueltos
  (bundle TLS y fixtures de HTML).
- ADR-0007 (máquina de estados valid/suspect/stale) pasa de `proposed` a
  **`accepted`**: se materializa «descartada» como estado `rejected` y se resuelve
  el TODO del mecanismo de aprobación (CLI de operador; endpoint admin autenticado
  llegará con el api-gateway).
- `knowledge/`: `services/ingestor-bcv.md`, `tables/official_rates.md` y `log.md`
  sincronizados con la implementación HITL (pendientes del servicio: ninguno).
- PRD motor-indicadores pasa a `accepted — fase 1 implementada`; sobre estándar de
  eventos unificado en `api-contracts.md` a `occurred_at` (el doc decía `produced_at`,
  el código ya probado publica `occurred_at`).
- `knowledge/` sincronizado con el motor: `services/indicator-engine.md`
  (implementado-parcial), `events/indicators-updated.md` y
  `events/official-rate-updated.md` (consumidor real), nueva `tables/indicators.md`,
  índices y `log.md`.
- PRD ingesta Binance P2P pasa a `accepted — implementado` (RF-6 como logs
  estructurados; export a sistema de métricas queda para fase 05); ADR-0005 con el
  TODO del spike resuelto; `api-contracts.md` sin el TODO del schema p2p-snapshot.
- `knowledge/` sincronizado con el ingestor P2P: `services/ingestor-binance.md` y
  `events/p2p-snapshot.md` (implementados), nueva `tables/p2p_snapshots_raw.md`,
  índices y `log.md`.
- **Auditoría de coherencia docs↔implementación** (alcance completo):
  - ADR-0008 (solo-en-cambio) y ADR-0009 (bitemporal) pasan a **`accepted`** — ya
    estaban implementados por el ingestor-bcv; se anota cómo se materializa el
    heartbeat (ADR-0008) y la excepción auditada del HITL al append-only (ADR-0009).
  - Gate 1 actualizado: ADRs 0007–0009 accepted y pendientes de fase 03 resueltos
    (spike P2P ✔, bundle TLS ✔, schemas 3/4 ✔); siguen abiertos secret store
    (fase 05) y umbrales de señales (HITL).
  - README raíz con estado real (3 servicios implementados y verificados en vivo),
    árbol con `schemas/` y `docker-compose.yml`, y sección de desarrollo.
  - `architecture.md`: tabla de persistencia con nombres reales y estado por tabla
    (5 implementadas / 3 planificadas).
  - Índices del `knowledge/` (servicios, eventos con sobre `occurred_at`, métricas)
    sincronizados; README de tests de indicator-engine e ingestor-binance
    actualizados a lo realmente construido.
- **Verificación de pendientes de los gates abiertos** (Gate 0 y Gate 1):
  - Gate 0: el pendiente de retención de alias de anunciantes queda marcado
    **resuelto** (ADR-0011 implementado); permanecen como decisiones humanas la
    identificación de apps consumidoras y la validación del marco legal (charter).
  - Gate 1: fila de ADRs actualizada a 0001–0011 (0011 accepted e implementada;
    0010 proposed pero implementada de facto); contratos de eventos reconocidos
    como formales (JSON Schema + contract tests en ambos lados, p2p-snapshot v1.1);
    siguen abiertos `signal.v1`/umbrales (engine fase 2) y secret store (fase 05).
  - Threat model: T2 y T10 citan ahora el ADR-0011 (`merchant_ref` habilita
    recurrencia de manipuladores y forense entre snapshots); trazabilidad de T2
    refleja el etiquetado MAD ya verificado en ingestor-binance.
  - `api-contracts.md`: la intro distingue eventos formales (schemas/) del
    esqueleto REST/WSS (OpenAPI llegará con el api-gateway); tabla de eventos
    anota p2p-snapshot v1.1 y `signal.v1` como pendiente.
  - Ambos gates siguen a la espera de la firma humana (líneas «Aprobado por»).

## [0.1.0] - 2026-07-05

Línea base del proyecto (commit inicial `b34c3af`). Fase documental: Gate 0
(requisitos) y Gate 1 (diseño) de la metodología AI-DLC. Sin código ejecutable aún.

### Added

- Estructura de repositorio según el estándar AI-DLC: `.ai-dlc/` (gates y plantillas),
  `docs/` (proyecto, requisitos, diseño, arquitectura) y `apps/` (esqueletos de servicios).
- Metodología AI-DLC:
  - Checklists de Gate 0 (requisitos) y Gate 1 (diseño).
  - Plantillas de PRD, ADR y threat model.
- Documentación de proyecto (`docs/00-project/`):
  - Project charter con visión, alcance, no-scope, métricas de éxito y riesgos.
  - Glosario de términos del dominio cambiario.
  - Clasificación de datos.
- Decisiones de arquitectura (ADRs):
  - ADR-0001: Adopción de la estructura AI-DLC.
  - ADR-0002: Almacenamiento de series de tiempo con PostgreSQL + TimescaleDB.
  - ADR-0003: Autenticación JWT / OAuth2 client credentials para API/WSS.
  - ADR-0004: RabbitMQ como bus de mensajería entre ingesta e indicadores.
  - ADR-0005: Estrategia de ingesta del portal P2P de Binance (VES/USDT).
  - ADR-0006: Scraping del sitio BCV y manejo de sus problemas de TLS.
- Requisitos — PRDs de Gate 0 (`docs/01-requirements/`):
  - Ingesta P2P Binance (VES/USDT).
  - Ingesta de tasa oficial BCV (VES/USD).
  - Motor de indicadores (brecha BCV↔Binance, spreads, volúmenes, tendencias).
  - API REST + streaming WebSocket para consumidores.
- Diseño — Gate 1 (`docs/02-design/` y `docs/architecture/`):
  - Arquitectura general del sistema.
  - Threat model.
  - Contratos de API.
  - Diagramas C4 de contexto y contenedores (Mermaid).
- Esqueletos de los cuatro servicios en `apps/`, cada uno con README, documento de
  diseño y carpeta de tests: `ingestor-binance`, `ingestor-bcv`, `indicator-engine`
  y `api-gateway`.

[Unreleased]: https://github.com/jeremialcala/ves-market-watch/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jeremialcala/ves-market-watch/releases/tag/v0.1.0
