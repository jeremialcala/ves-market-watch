---
type: Log
title: Historia del knowledge bundle
description: Registro cronológico de cambios en el contexto del proyecto (más reciente primero).
timestamp: 2026-07-05T00:00:00Z
---

# Log

## 2026-07-22 — Motor de reglas de señales (RF-4) implementado
- El indicator-engine ya **emite** `signals.emitted` (ADR-0015): ruleset versionado
  (`config/senales.v1.yaml`), evaluación por nivel sobre la vista de indicadores vigentes,
  dedup por cooldown (60 min/tipo) y evidencia (regla + insumos). Nueva hypertable `signals`
  (migración 002). 77 tests; verificado e2e en vivo (snapshot → `correccion_inminente` al bus
  y a la tabla). RF-4/RF-5 satisfechos; el api-gateway aún no consume el evento.
- `signals.emitted` pasa de «contrato definido» a **«implementado»** en índices y knowledge;
  tabla `signals` movida de planificada a implementada.

## 2026-07-20 — Coherencia post-fase-2 + contrato `signal.v1`
- Auditoría e2e de la doc contra el código tras la fase 2: corregida la deriva de tratar
  «fase 2» como «P2P + señales» (el código las separó). Actualizados motor-indicadores,
  knowledge del engine (fase 2 implementada, 49 tests), gate-0 (4→5 PRDs), gate-1,
  api-contracts y architecture. Nuevo **ADR-0014** (microestructura P2P: reúso de
  `indicators.updated`, ventanas sobre histórico, frescura entre lados, aplazamiento de
  señales).
- **`schemas/signal.v1.json`** definido (4.º schema de eventos): payload con `type` abierto,
  `direction` enum, `evidence` {rule, inputs} para trazabilidad. Contract test de forma
  (9 casos) en el engine. **Solo contrato**: la emisión depende del motor de reglas (RF-4),
  aún pendiente. `signals.emitted` pasa de «diseñado» a «contrato definido; emisión pendiente».

## 2026-07-17 — api-gateway: spec OpenAPI 3.1 (fase 03)
- Contrato REST formal en `apps/api-gateway/docs/openapi.yaml`, generado desde la
  sección REST de `docs/02-design/api-contracts.md` y ADR-0012. 8 endpoints `/api/v1`,
  seguridad OAuth2 `authorizationCode` contra el tenant Auth0 con los 5 scopes, decimales
  como string, paginación obligatoria (rango máx. 90 d → 422), errores RFC 7807 y
  cabeceras `X-RateLimit-*`. Validado con `openapi-spec-validator`.
- Campos dependientes de la fase 2 del engine marcados preliminares (brecha/spreads/volúmenes
  `null`; vocabulario de señales pendiente de `signal.v1`). Siguen abiertos: AsyncAPI del
  WSS `/ws/v1` y la app SPA del tenant.

## 2026-07-14 — Rama feat-ai-dlc cerrada
- Cerrada tras nivelar develop (0 commits exclusivos): borrada local y en origin.
  Todo su contenido — ingestor-historico (ADR-0013), evidencia diagramática de los
  tres ejes, tenant Auth0 — vive en develop (`8658d68` y posteriores).
- Ramas vivas: `main` (pendiente merge + tag v0.2.0) y `develop` (integración).
  `repo-history.md` regenerado con el mapa main+develop.

## 2026-07-14 — Auditoría de coherencia AI-DLC: evidencia diagramática de los tres ejes
- Hallazgo: los gates 0/1 se cerraron con la sustancia en tablas (STRIDE/DREAD/ASVS) pero
  solo 3 diagramas Mermaid en el repo (C4 Context/Container + gitGraph) — faltaba el eje
  comportamiento y casi todo trazabilidad según el catálogo de la metodología.
- Se generaron los 9 faltantes inline: mindmap (charter), journey (api-streaming),
  requirementDiagram (motor-indicadores; RF-4 sin `verifies` a propósito — fase 2),
  DFD + quadrant DREAD (threat-model), sequence + state TasaOficial + ER dominio +
  classDiagram hexagonal (architecture). El ASCII art de architecture se retiró.
- Fixes de forma: cabeceras de metadatos en los 4 design docs de apps y plan de pruebas;
  `ingesta-historica.md` 0.1.1→0.2.0. Los gates conservan su firma; la evidencia nueva
  queda anotada como adenda en cada gate.
- Tenant Auth0 `dev-higerotech.us.auth0.com` aprovisionado el mismo día: API audience
  `https://api.vesmarketwatch/` (RS256, 900 s, RBAC con permisos en el token), roles
  viewer/operator con los 5 permisos, attack protection (bfp 10 intentos, bpd con
  block+aviso, sit). Detalle y config del gateway en `apps/api-gateway/docs/design.md`.
  Gotcha del CLI: `auth0 api patch` bloquea leyendo stdin en entornos no-TTY (cerrar
  stdin con `$null |`) y PS 5.1 exige escapar `\"` en el JSON de `--data`.

## 2026-07-11 — ingestor-historico: backfill de históricos de precio (ADR-0013)
- Quinto servicio, batch por demanda (CLI `cargar`/`stats`), sin bus: carga exports
  CSV del sistema previo (top-100 combinado con 3 bancos principales) en la nueva
  hypertable `historical_market_snapshots`, idempotente por `(captured_at, source_id)`.
- Parseo adaptativo (heurística de columnas, bancos dinámicos, anotaciones de
  liquidez, fechas EN/ISO, fallback ObjectId); archivo ajeno → rechazo completo,
  fila corrupta → descarte contado.
- Varianza histórica vía `stats`: precio base y por banco, log-retornos, por día de
  mercado (UTC−4). Verificado en vivo: 1.064 filas (2025-12-02→12-11), recarga
  0/1.064, varianza σ²≈65.3 (σ≈8.08) sobre media 417.03.
- PRD `ingesta-historica.md` **approved (HITL 2026-07-11)** — Gate 0 incremental
  cerrado; 39 tests; migración montada en el compose. Carga oficial confirmada en la
  DB de desarrollo: 1.064 filas, `repo-history.md` regenerado tras el commit `31289f5`.

## 2026-07-11 — Gates 0 y 1 cerrados (HITL) y corte de versión 0.2.0
- Ambos gates firmados por Jeremi Alcalá; la aprobación del Gate 0 cubre la versión
  de requisitos actualizada por ADR-0012 (auth OIDC con Auth0, supersede ADR-0003).
- CHANGELOG: `[Unreleased]` cortado a **0.2.0** (convención AI-DLC: Gate 1 → 0.2.0);
  cabeceras de metadatos (Estado approved / Versión 0.2.0) sincronizadas en charter,
  glosario, data-classification, 4 PRDs, architecture, threat-model, api-contracts y C4.
- Nueva documentación viva de fase 03: `docs/03-implementation/repo-history.md`
  (gitGraph + bitácora derivados del historial real + trazabilidad tag↔versión↔ADR).
- Pendientes: taggear `v0.2.0` sobre el merge a `main`; residuales HITL del charter
  (apps consumidoras, marco legal); `signal.v1`/umbrales (engine fase 2); secret store
  (fase 05); api-gateway sin implementar (Resource Server, ADR-0012).

## 2026-07-07 — Verificación de pendientes de Gate 0 y Gate 1
- Gate 0: retención de alias → resuelto (ADR-0011 implementado); quedan como
  decisiones humanas los TODO del charter (apps consumidoras, marco legal).
- Gate 1: ADRs 0001–0011 (0010 proposed pero implementada de facto — el bundle
  OKF se mantiene desde 2026-07-05); contratos de eventos formales (3 de 4
  schemas, p2p-snapshot v1.1); abiertos: signal.v1/umbrales (engine fase 2),
  secret store (fase 05). Threat model T2/T10 citan ahora el ADR-0011.
- Ambos gates listos para la firma humana («Aprobado por» sigue pendiente).

## 2026-07-06 — ADR-0011 implementado: merchant_ref en producción
- `Pseudonimizador` en el dominio del ingestor-binance: HMAC-SHA256 sobre `userNo`
  (nunca el alias), 32 hex; en el evento (contrato v1.1 aditivo, `merchant_ref`
  requerido) y en el crudo persistido. `MERCHANT_HMAC_KEY` obligatoria (fail fast).
- Verificado en vivo: dos corridas con la misma clave → 88/96 anunciantes
  correlacionados entre snapshots; cero alias/ID crudos en disco. Suite en 48 tests.
- El motor de ingesta de Binance queda completo; sin pendientes en el servicio.

## 2026-07-06 — Identidad de anunciantes P2P: pseudonimización HMAC (ADR-0011)
- Decisión humana que cierra el TODO de data-classification: conservar historia de
  anunciantes como `merchant_ref` (HMAC-SHA256, clave dedicada `MERCHANT_HMAC_KEY`,
  sin rotación programada); alias e ID crudos siguen sin persistir.
- Habilita (fase 2 del engine): dedup de profundidad, concentración de mercado,
  recurrencia de manipuladores (T2) y forense de señales (T10).
- Implementación pendiente en `ingestor-binance` (`minimizar_crudo` + contrato
  p2p-snapshot v1.1, aditivo); PRD y data-classification actualizados.

## 2026-07-06 — Auditoría de coherencia docs↔implementación
- Minimización de datos aplicada al crudo P2P (`minimizar_crudo`): el alias e
  identificadores del anunciante ya no tocan disco — cierra la brecha con
  data-classification (el TODO de confirmación humana sigue abierto).
- ADR-0008/0009 → accepted (implementados por ingestor-bcv, con notas de cómo);
  Gate 1 y README raíz actualizados al estado real; índices del bundle
  (servicios/eventos/métricas) sincronizados; tabla de persistencia de
  architecture.md con estado por tabla.

## 2026-07-06 — ingestor-binance implementado (última fuente)
- Spike del endpoint P2P resuelto (ADR-0005): HTTP 200 con la forma esperada,
  ~643 anuncios USDT/VES; fixtures reales versionados. `tradeType` = perspectiva
  del taker.
- Servicio completo: polling educado (presupuesto, backoff+jitter, breaker),
  validación de schema de la fuente, sanitización, outliers MAD etiquetados
  (con piso relativo 2 % calibrado con datos reales), crudo 90 d y `p2p.snapshot`
  (contrato `schemas/p2p-snapshot.v1.json`). 40 tests; flujo productor→bus
  verificado en vivo (100 anuncios/lado).
- Con esto las 3 fuentes/servicios de datos están implementados; falta fase 2 del
  engine (brecha) y el api-gateway.

## 2026-07-05 — indicator-engine fase 1: primer consumidor del bus
- Motor implementado como consumidor de `official.rate.updated`: validación contra
  schema compartido, DLQ, idempotencia por `event_id`, hypertable `indicators`
  (calc_version) y emisión de `indicators.updated` con `triggered_by`.
- Contratos formales en `schemas/` (official-rate.v1, indicators.v1) verificados por
  contract tests en ambos lados; sobre estándar unificado a `occurred_at`.
- Flujo ingestor→bus→engine verificado en vivo (5 monedas del sitio real del BCV).
- PRD motor-indicadores accepted (fase 1); pendiente fase 2: P2P y señales.

## 2026-07-05 — Re-validación HITL de tasas suspect (ADR-0007 accepted)
- Job HITL implementado en `ingestor-bcv`: CLI `revalidar listar|aprobar|rechazar`,
  estado terminal `rejected`, expiración por TTL (24 h, `system:timeout`) y auditoría
  quién/cuándo/por qué (migración 002 sobre `official_rates`).
- Previo en la misma fecha: `docker-compose.yml` raíz (RabbitMQ 4 + TimescaleDB pg16
  en puerto 5433) y suites integration/e2e; la suite del servicio llega a 53 tests.

## 2026-07-05 — Creación del bundle
- Bundle OKF v0.1 inicial (ADR-0010): services, events, tables, metrics.
- Refleja: Gate 0/1 documentados; `ingestor-bcv` implementado (multi-moneda, hexagonal,
  TLS anclado, 28 tests, dry-run verificado con 5 monedas); resto de servicios en diseño.

## 2026-07-05 — Hitos previos del proyecto (resumen)
- v0.1.0: estructura AI-DLC completa hasta Gate 1 (charter, PRDs, threat model, C4, ADR-0001…0006).
- ADR-0007/0008/0009 (proposed): máquina de estados de la tasa, publicación solo-en-cambio, modelo bitemporal.
- Alcance de ingesta BCV ampliado de solo-USD a multi-moneda con descubrimiento dinámico.
