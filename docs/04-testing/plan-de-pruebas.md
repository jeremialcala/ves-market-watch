# Plan de Pruebas — VES Market Watch

- **Fase AI-DLC:** 04-testing
- **Estado:** draft — para revisión y aprobación (Gate 2)
- **Alcance:** plataforma completa (4 servicios + RabbitMQ + TimescaleDB + contratos del bus y de API)
- **Fecha:** 2026-07-07
- **Decisores:** Jeremi Alcalá
- **Versión:** 0.2.0
- **Fuentes de verdad:** PRDs en `docs/01-requirements/`, diseño en `docs/02-design/`
  (incl. `threat-model.md` columna «Verificación fase 04-testing»), contratos en `schemas/`
  y `docs/02-design/api-contracts.md`, ADRs en `docs/00-project/adr/`.

## 1. Objetivo

Verificar que la plataforma mide correctamente la brecha entre la tasa oficial **VES/USD (BCV)**
y el mercado P2P **VES/USDT (Binance)**, que los contratos entre servicios se respetan, y que
los controles de seguridad priorizados en el threat model (T1–T10) se comportan según diseño.
El plan sirve como criterio de cierre del **Gate 2** y como guía viva para completar lo pendiente
(`api-gateway` y la **fase 2** del `indicator-engine`).

## 2. Estrategia de pruebas

Se mantiene la **pirámide AI-DLC** ya adoptada por los tres servicios de datos, con cinco niveles.
Cada nivel tiene un marcador `pytest` y un requisito de infraestructura explícito para poder
ejecutar la suite con o sin `docker compose`.

| Nivel | Qué valida | Infra | Marcador |
|---|---|---|---|
| **unit** | Dominio y casos de uso con dobles de prueba; reloj/red simulados | Ninguna | *(por defecto)* |
| **integration** | Adaptadores contra infraestructura real o red local (HTTP, AMQP, TimescaleDB) | `docker compose up -d --wait` | `integration` |
| **contract** | Eventos emitidos/consumidos cumplen el JSON Schema de `schemas/`; REST/WSS vs. OpenAPI/AsyncAPI | Ninguna (schema estático) | *(por defecto)* |
| **e2e** | Flujo completo del servicio contra RabbitMQ + TimescaleDB reales | `docker compose up -d --wait` | `e2e` |
| **security** | Escenarios de abuso de los PRDs y amenazas del threat model | según caso | `security` *(a introducir en api-gateway)* |

Regla transversal (ya vigente): **sin infraestructura, los tests que la requieren hacen `skip`
elegante con instrucciones**, nunca fallan por ausencia de compose.

```sh
python -m pytest -m "not integration and not e2e"   # rápido, sin infraestructura
docker compose up -d --wait && python -m pytest      # suite completa
```

### Objetivo de cobertura
**≥ 80 % de cobertura de ramas** por servicio (criterio Gate 2, ya declarado en los README de
tests). Se mide con `pytest --cov --cov-branch` por app y se reporta en el pipeline de CI.

## 3. Entornos y datos de prueba

- **Infra compartida dev/test:** `docker-compose.yml` de la raíz levanta RabbitMQ (5672/15672)
  y TimescaleDB (5433). Es la misma infra para `integration` y `e2e`.
- **Datos reales congelados:** los fixtures son respuestas reales capturadas en spikes
  (p. ej. `apps/ingestor-binance/tests/fixtures/adv_search_*.json`, spike 2026-07-05; bundle TLS
  del BCV en `apps/ingestor-bcv/certs/`). Se usan para pruebas deterministas sin golpear las
  fuentes externas.
- **Fuentes externas nunca se tocan en CI:** BCV y Binance se sustituyen por servidor HTTP local
  / endpoint fake. El acceso en vivo queda para verificación manual puntual (ya realizada para
  los productores).
- **Aislamiento:** cada test de integración/e2e usa colas y tablas efímeras o limpia su estado;
  no comparte datos entre casos.

## 4. Cobertura actual y huecos

Estado observado en el repo (conteo de funciones `test_`):

| Servicio | Estado código | Tests actuales | Huecos de prueba |
|---|---|---|---|
| `ingestor-bcv` | Implementado | **50** (unit, integration, contract, e2e) | Confirmar cobertura de ramas ≥ 80 %; añadir marcador `security` para escenarios T1 (HTML alterado + tasa fuera de rango) |
| `ingestor-binance` | Implementado | **48** (unit, integration, contract, e2e) | Igual que arriba; escenario T7 (429 → circuit breaker) ya en `unit/test_resilience.py`, elevar a `integration` con servidor local |
| `indicator-engine` | Fase 1 implementada | **26** (unit, integration, contract, e2e) | **Fase 2**: consumo de `p2p.snapshot`, precio de referencia, **brecha BCV↔P2P**, señales (`signals.emitted`) y schema `signal.v1` — sin código ni tests aún |
| `api-gateway` | Diseñado, sin código | **0** (solo `tests/README.md` con la pirámide esperada) | Suite completa por construir: unit/integration/contract/e2e/**security** |

> El plan cubre tanto la **consolidación** de lo existente como la **especificación** de los casos
> que deben acompañar el código pendiente, para que se escriban junto con la implementación (no
> después).

## 5. Casos de prueba por servicio

Notación: `[U]` unit · `[I]` integration · `[C]` contract · `[E]` e2e · `[S]` security.

### 5.1 ingestor-bcv
- `[U]` Parser extrae todas las monedas publicadas y la fecha-valor común; descubrimiento dinámico
  de una moneda nueva sin cambio de código (PRD ingesta-bcv, objetivos).
- `[U]` Máquina de estados de la tasa oficial y publicación **solo en cambio** (ADR-0007, ADR-0008):
  igual valor/fecha → heartbeat sin evento; cambio → evento.
- `[U]` Modelo bitemporal (ADR-0009): `value_date` vs. `captured_at`.
- `[U/S]` **T1** — variación > umbral (inicial 20 %) → tasa retenida y marcada `suspect`, requiere
  validación antes de publicar (escenario negativo 2, ADR-0007).
- `[U/S]` **T1** — parser no encuentra el valor → tras 3 fallos consecutivos alerta y se mantiene la
  última tasa válida como `stale` (escenario negativo 1).
- `[I/S]` **T1** — cliente con **TLS anclado** (ADR-0006): rechaza certificado/CA no esperado; no
  deshabilita verificación global (`test_bcv_client_tls.py`, ampliar con fixture de cert inválido).
- `[I]` Repositorio TimescaleDB: upsert idempotente por `(moneda, value_date)` y consulta de histórico.
- `[C]` Evento `official.rate.updated` cumple `schemas/official-rate.v1.json` (sobre común
  `event_id/event_type/schema_version/occurred_at/producer`).
- `[E]` Ciclo completo: fuente fake → validación → persistencia → publicación al bus real.

### 5.2 ingestor-binance
- `[U]` Normalización/sanitización de anuncios y **minimización del crudo** (no persistir datos de
  más); pseudonimización de anunciantes con HMAC → `merchant_ref` (ADR-0011).
- `[U/S]` **T2** — outliers por **MAD**: precios absurdos (p. ej. 10×) etiquetados como outliers en
  la normalización (`test_outliers.py`).
- `[U/S]` **T7** — resiliencia con reloj fake: backoff exponencial con jitter, **circuit breaker** y
  presupuesto de requests ante 429/5xx (`test_resilience.py`).
- `[U]` Snapshot `partial=true` cuando llegan menos páginas de las esperadas (escenario positivo 2).
- `[I]` Cliente HTTP contra servidor local: paginación hasta top-K, respuesta parcial, **tope de
  bytes** (T4/DoS: payload gigante), esquema roto → descarta y alerta (escenario negativo 1).
- `[I]` Publisher AMQP real y repositorio con **retención 90 días**.
- `[C]` Evento `p2p.snapshot` cumple `schemas/p2p-snapshot.v1.json` (v1.1 con `merchant_ref`, ADR-0011).
- `[E]` Flujo P2P: endpoint fake + RabbitMQ/TimescaleDB reales.

### 5.3 indicator-engine
**Fase 1 (implementada) — consolidar:**
- `[U]` Caso de uso `process_official_rate`: recálculo y publicación de `indicators.updated`.
- `[U]` **Idempotencia** por `event_id` (evento duplicado no reprocesa).
- `[U/S]` **T5** — evento malformado / schema inválido → **DLQ** `market.events.dlq`, no rompe el consumidor.
- `[C]` `indicators.updated` cumple `schemas/indicators.v1.json`.
- `[I]` Consumidor AMQP real; `[E]` flujo `official.rate.updated` → `indicators.updated`.

**Fase 2 (pendiente) — especificar junto con el código:**
- `[U]` Precio de referencia P2P: **mediana y VWAP** del top-N filtrado por lado.
- `[U]` **Brecha BCV↔P2P** (abs y %), spreads compra/venta, volúmenes agregados, profundidad por
  bandas de 0,5 %, variación intradía (apertura VET).
- `[U/S]` **T2** (filtrado final) — snapshots sintéticos manipulados: filtrado MAD/IQR y marca
  `low_confidence`; los outliers no distorsionan la brecha ni las señales.
- `[U]` Reglas de **señales** configurables (umbral de brecha, spread anómalo, caída de liquidez) →
  `signals.emitted` con **evidencia** (`inputs`, `rule`, `calc_version`).
- `[U/S]` **T10** — toda señal es reproducible: misma entrada + `calc_version` ⇒ misma salida.
- `[C]` Nuevo `schemas/signal.v1.json` (a crear) validado en productor.
- `[U]` Manejo de `official_stale`: la brecha se marca cuando la tasa oficial está vencida.
- `[E]` Flujo `p2p.snapshot` (+ `official.rate.updated`) → `indicators.updated` + `signals.emitted`.

### 5.4 api-gateway (por construir — la suite acompaña al código)
- `[U]` Validación estricta de inputs (fechas, `interval`, `side`, tópicos); políticas de
  **scopes/permisos**; validación del **access token de Auth0** (RS256 vía JWKS; `iss`/`aud`/`exp`).
  El gateway **no emite** tokens (ADR-0012).
- `[U/S]` **T11** — el gateway rechaza el **ID token** y tokens de otra audiencia/tenant usados como
  bearer: verificación estricta de `aud` (=API) e `iss` → 401 (ADR-0012, escenario negativo 3).
- `[S]` **T3** — ataques al login mitigados en Auth0 (attack protection, MFA); verificación de la
  config del tenant, no del gateway (escenario negativo 2).
- `[I/S]` **T4** — scraping del histórico: rate limit por token, **paginación obligatoria**, rango
  máx. 90 días/request; headers `X-RateLimit-*`; fuzzing de paginación (escenario negativo 4).
- `[I/S]` **T4** — WSS: máx. 5 conexiones y 10 suscripciones por `sub`; ping/pong 30 s; cierre
  **4401** por token expirado; el token de `?token=` no aparece en logs (escenario negativo 5).
- `[S]` **T9** — inyección en parámetros (fechas/intervalos/tópicos): queries parametrizadas +
  whitelist de tópicos; SAST (escenario negativo 6).
- `[S]` **T1-token** — tokens alterados/expirados → 401 **sin diagnóstico interno** (RFC 7807);
  replay de token en WSS rechazado por `exp` (escenarios negativos 1 y 8).
- `[S]` **Elevación entre usuarios**: un token con `read:indicators` no accede a scopes/permisos
  que su rol no otorga (escenario negativo 7).
- `[C]` Respuestas REST vs. **OpenAPI 3.1** (a generar con el gateway); eventos WSS vs. AsyncAPI;
  errores RFC 7807.
- `[E]` Flujo usuario: login en Auth0 (Auth Code + PKCE) → access token → REST → push WSS.

## 6. Pruebas de sistema (cross-servicio)

Más allá del e2e por servicio, un **e2e de plataforma** valida el camino completo con los cuatro
servicios y la infra real:

1. `ingestor-bcv` publica `official.rate.updated` → `indicator-engine` recalcula → `api-gateway`
   expone `/rates/official/current` y empuja `rates.official` por WSS.
2. `ingestor-binance` publica `p2p.snapshot` → `indicator-engine` (fase 2) calcula **brecha** →
   `/indicators/current` y push `indicators`.
3. Regla de señal se dispara → `signals.emitted` → `/signals` con evidencia y push `signals`.
4. **Ruta de error del bus:** evento inválido inyectado → va a `market.events.dlq`, el resto del
   flujo sigue operativo (T5).

Estos escenarios se automatizan como suite `e2e` a nivel raíz (nuevo `tests/` de plataforma) una
vez que el `api-gateway` y la fase 2 del engine existan.

## 7. Seguridad — trazabilidad a amenazas (T1–T12)

Cada amenaza priorizada del threat model tiene su verificación. Esta tabla es la fuente para el
cierre de la columna «Verificación fase 04-testing».

| ID | Amenaza | Caso de prueba | Dónde |
|---|---|---|---|
| T1 | Tasa oficial falsa (MITM / parse) | TLS anclado rechaza CA no esperada; HTML alterado + tasa fuera de rango → `suspect`/`stale` | ingestor-bcv `[I/S]`, `[U/S]` |
| T2 | Anuncios P2P manipulados | Etiquetado MAD en ingesta + filtrado final con snapshots sintéticos y `low_confidence` | ingestor-binance `[U/S]`, engine fase 2 `[U/S]` |
| T3 | Ataques al login | Attack protection + MFA en el tenant Auth0 (config verificada) | Auth0 (config) |
| T4 | DoS API/WSS (flood, scraping) | Cuotas por token/IP, límites WSS, paginación y rango máx.; fuzzing | api-gateway `[I/S]` |
| T5 | Eventos malformados en el bus | Schema inválido → DLQ, consumidor sobrevive | indicator-engine `[U/S]`; e2e plataforma |
| T6 | Fuga de secretos | **Secrets scanning** en CI; revisión de rotación ≤ 90 d | CI (Gate 2) |
| T7 | Baneo de IP por Binance | Simulación 429 → circuit breaker + backoff + presupuesto | ingestor-binance `[U/S]` → `[I]` |
| T8 | Compromiso de dependencia (supply chain) | **SCA** con umbral de severidad; lockfiles; imágenes por digest | CI (Gate 2) |
| T9 | SQL injection en histórico | Queries parametrizadas + validación; **SAST** + tests de inyección | api-gateway `[S]` |
| T10 | Señales sin trazabilidad | Auditoría end-to-end de una señal; reproducibilidad por `calc_version` | engine fase 2 `[U/S]`; e2e plataforma |
| T11 | ID token / token de otra audiencia como bearer | Rechazo por `aud`/`iss` inválidos y firma JWKS → 401 | api-gateway `[U/S]` |
| T12 | Robo de token en el navegador (XSS) | Token en memoria, vida corta y rotación (revisión en el SPA, fuera de este repo) | SPA (fuera de alcance) |

> **T6 y T8 no son tests de `pytest`** sino **gates del pipeline CI** (secrets scanning y SCA);
> se listan aquí para que su verificación quede trazada en el mismo plan.

## 8. Matriz de trazabilidad requisitos → pruebas

| Requisito / escenario | PRD | Nivel | Servicio |
|---|---|---|---|
| Ingesta multi-moneda + descubrimiento dinámico | ingesta-bcv (objetivos) | U/E | ingestor-bcv |
| Publicación solo en cambio + heartbeat | ingesta-bcv (esc. positivos 2–3) | U | ingestor-bcv |
| Umbral de rango / `suspect` / `stale` | ingesta-bcv (esc. neg. 1–2) | U/S | ingestor-bcv |
| Polling educado + backoff + partial | ingesta-binance (esc. positivos) | U/I | ingestor-binance |
| Outliers + minimización + `merchant_ref` | ingesta-binance (esc. neg. 1–2) | U | ingestor-binance |
| Circuit breaker ante 429 | ingesta-binance (esc. neg. 3) | U/I | ingestor-binance |
| Recálculo reactivo por evento | motor-indicadores (esc. positivos) | U/E | indicator-engine |
| Brecha, spreads, VWAP/mediana, profundidad | motor-indicadores (indicadores) | U | indicator-engine (F2) |
| Señales con evidencia + reproducibilidad | motor-indicadores (esc. positivos 3) | U/S | indicator-engine (F2) |
| DLQ ante evento inválido | motor-indicadores (esc. neg. 4) | U/S | indicator-engine |
| Auth JWT + scopes | api-streaming (objetivos, esc. 1) | U/E | api-gateway |
| Rate limit + lockout + límites WSS | api-streaming (esc. neg. 2–4) | I/S | api-gateway |
| Validación de inputs / inyección | api-streaming (esc. neg. 5) | S | api-gateway |
| Aislamiento entre consumidores | api-streaming (esc. neg. 6) | S | api-gateway |

## 9. Pruebas no funcionales

- **Rendimiento / carga:** `api-gateway` bajo exceso de cuota (T4) y `indicator-engine` con backlog
  de eventos (latencia de recálculo aceptable). Herramienta sugerida: `locust`/`k6` contra el
  gateway; para el bus, generador de eventos sintéticos.
- **Resiliencia:** caída y recuperación de RabbitMQ y TimescaleDB (reintentos, sin pérdida de
  eventos gracias al sobre con `event_id`); reanudación tras 429 de Binance; BCV caído → `stale`.
- **Idempotencia y orden:** eventos duplicados y reordenados no corrompen indicadores (T5/T10).
- **Observabilidad:** logs estructurados por ciclo verificables (RF-6 de ingesta-binance); export
  de métricas queda para fase 05-deployment.

## 10. Criterios de entrada y salida (Gate 2)

**Entrada:**
- Código de la funcionalidad implementado y revisado.
- `docker-compose.yml` levanta y las suites `integration`/`e2e` corren en verde localmente.

**Salida (cierre de Gate 2):**
1. Cobertura de ramas **≥ 80 %** por servicio con código.
2. Todos los casos de las secciones 5–7 aplicables al alcance entregado, en verde.
3. Cada amenaza T1–T10 con su verificación satisfecha (tests o gate de CI).
4. Contract tests en verde en **productor y consumidor** para cada evento con schema.
5. Gates de CI: **secrets scanning** (T6) y **SCA** (T8) sin hallazgos por encima del umbral.
6. Sin tests marcados `xfail`/`skip` salvo los de infraestructura documentados.

## 11. Automatización y CI

- **Matriz por app:** cada servicio corre `pytest -m "not integration and not e2e"` en cada push, y
  la suite completa con `docker compose` en el pipeline de integración.
- **Gates de seguridad en CI (Gate 2):** SAST (T9), SCA con umbral de severidad (T8), secrets
  scanning (T6). Imágenes fijadas por digest.
- **Reporte de cobertura** por servicio publicado como artefacto del pipeline.
- **Fuente de convenciones de marcadores:** `[tool.pytest.ini_options]` en cada `pyproject.toml`
  (`asyncio_mode = "auto"`, marcadores `integration` y `e2e`; añadir `security` en api-gateway).

## 12. Riesgos y pendientes

- **`signal.v1` sin definir:** bloquea los contract tests de señales; debe crearse en `schemas/`
  con la fase 2 del engine (ya señalado en Gate 1).
- **Umbrales de señales (HITL):** requieren decisión humana antes de fijar aserciones de negocio.
- **`api-gateway` sin código:** sus casos aquí son especificación; no computan cobertura hasta que
  exista.
- **Secret store concreto:** definido para fase 05; los tests de rotación (T6) se afinan entonces.
- **Pipeline CI aún no presente en el repo:** los gates T6/T8 y la matriz de la sección 11 son
  requisito a materializar como parte de Gate 2.

---

*Documento vivo de la fase 04-testing. Al cambiar el alcance, actualizar este plan, el concepto OKF
afectado en `knowledge/`, `knowledge/log.md` y el `CHANGELOG.md` (`[Unreleased]`).*
