# Plan de Pruebas — Criterio

- **Fase AI-DLC:** 04-testing
- **Estado:** draft — para revisión y aprobación (Gate 2)
- **Alcance:** plataforma completa (5 servicios + `web-spa` + RabbitMQ + TimescaleDB + contratos del bus y de API)
- **Fecha:** 2026-07-31
- **Decisores:** Jeremi Alcalá
- **Versión:** 0.4.0
- **Fuentes de verdad:** PRDs en `docs/01-requirements/`, diseño en `docs/02-design/`
  (incl. `threat-model.md` columna «Verificación fase 04-testing»), contratos en `schemas/`
  y `docs/02-design/api-contracts.md`, ADRs en `docs/00-project/adr/`.

## 1. Objetivo

Verificar que la plataforma mide correctamente la brecha entre la tasa oficial **VES/USD (BCV)**
y el mercado P2P **VES/USDT (Binance)**, que los contratos entre servicios se respetan, y que
los controles de seguridad priorizados en el threat model (T1–T15) se comportan según diseño.
El plan sirve como criterio de cierre del **Gate 2** y como guía viva para completar lo pendiente
(los 5 servicios ya tienen código y suite; el e2e autenticado en vivo con token real
**quedó cumplido el 2026-08-07** —ver «E2E autenticado en vivo»— y quedan la suite
`security` transversal y llevarlo al pipeline CI).

## 2. Estrategia de pruebas

Se mantiene la **pirámide AI-DLC** ya adoptada por los cinco servicios con código, con cinco niveles.
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
elegante con instrucciones**, nunca fallan por ausencia de compose. La regla vale
en local y **se invierte en el pipeline**: allí el entorno lo monta el propio
trabajo, así que su ausencia es un defecto y no una circunstancia (§11).

El front-end (`apps/web-spa`, ADR-0017) replica la pirámide en **vitest**: unit/component/
contract corren **sin infraestructura por diseño** (MSW + WebSocket mock; fixtures
`satisfies` los tipos generados del OpenAPI = contrato verificado en compilación, con
check de frescura de tipos en `npm test`), umbral de cobertura ≥ 80 % de ramas aplicado
en la config, y el e2e en vivo (`npm run test:e2e:live`) hace skip sin credenciales M2M.

### E2E autenticado en vivo (2026-08-07)

La suite se parte en dos porque los requisitos no son los mismos:

- **Rechazos — sin credenciales, corren siempre que el gateway esté arriba.**
  REST sin token y con token inventado → 401 con `problem+json` y sin decir qué
  parte de la validación falló (eso sería un oráculo); `health` sigue público; y
  **WSS sin token o con token falso cierra con 4401**, no con un 1006 mudo. Son
  las aserciones de T11 y T15 y hasta ahora **solo existían como unit tests**: en
  vivo intervienen nginx, el túnel y el proxy, y el `TestClient` de Starlette es
  in-process —con el fallo del handshake puesto, los unit tests pasaban—.
- **Camino feliz — requiere el client M2M**: `client_credentials` → REST
  autenticado → WSS subscribe/ack/ping. **Cumplido el 2026-08-07: 6/6.** Los 30 s
  que tarda son la espera del ping del gateway, que llega a los 30 —no es lentitud,
  es el contrato—.

  **El client M2M es una aplicación APARTE de la del SPA.** El primer intento usó
  el `client_id` del SPA, que es público por diseño —viaja en el bundle y está como
  valor por defecto en `docker-compose.yml`— y es de tipo *Single Page
  Application*: Auth0 no le permite el grant `client_credentials`. Hace falta una
  aplicación *Machine to Machine* propia, con sus credenciales.

**La disponibilidad del gateway se resuelve una vez y las suites usan `skipIf`.**
La primera versión hacía `if (!arriba) return` en cada test y eso reportaba
**PASSED con el gateway apagado**: una suite que certifica nada. Comprobado
apuntando a un puerto muerto —salían cinco en verde—; ahora salen seis «skipped».
En el pipeline esa misma decisión se invierte con `E2E_LIVE_EXIGIDO=1`, porque
allí el entorno lo monta el trabajo y su ausencia es un defecto (§11).

**Desde el 2026-08-20 corre en el pipeline** (`e2e-vivo.yml`): los rechazos en
cada PR, el camino feliz en push a main/develop y en el cron de las 06:00 UTC.
Sigue haciendo falta la corrida manual contra `criterio-dev` para lo que CI no
puede montar —nginx y el túnel—.

**Qué tiene que tener el client M2M** (aprovisionado el 2026-08-07 en el
dashboard de Auth0): una aplicación *Machine to Machine* autorizada para la API
`https://api.vesmarketwatch/` con los
**cinco** permisos que el gateway exige —`read:rates`, `read:indicators`,
`read:signals`, `read:depth`, `stream:events`—. No hay `read:analysis`:
`/analysis/current` reutiliza `read:indicators` a propósito. Las credenciales
viajan por entorno (`AUTH0_M2M_CLIENT_ID` / `AUTH0_M2M_CLIENT_SECRET`), nunca al
repo, y ningún mensaje de error del test las incluye.

```sh
python -m pytest -m "not integration and not e2e"   # rápido, sin infraestructura
docker compose up -d --wait && python -m pytest      # suite completa
```

### Objetivo de cobertura
**≥ 80 % de cobertura de ramas** por servicio (criterio Gate 2, ya declarado en los README de
tests). Se mide con `pytest --cov --cov-branch` por app y se reporta en el pipeline de CI.

## 3. Entornos y datos de prueba

- **Infra compartida dev/test:** `docker-compose.yml` de la raíz levanta RabbitMQ (5672/15672)
  y TimescaleDB (5433) —la misma infra para `integration` y `e2e`— y además las apps
  (los 3 servicios con daemon, `api-gateway` en 8800 y `web-spa` en 8080), que no hacen
  falta para correr las suites.
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
| `ingestor-bcv` | Implementado | **80** (unit, integration, contract, e2e, `security`) | ~~Cobertura de ramas 76 %~~ **99,36 %** (2026-08-04); ~~añadir marcador `security` para escenarios T1~~ **añadido**: seis casos de HTML alterado en `unit/test_parser_html_alterado.py`, corren con `-m security` |
| `ingestor-binance` | Implementado | **83** (unit, integration, contract, e2e, `security`) | ~~Cobertura de ramas 75,92 %~~ **99,27 %** (2026-08-04); ~~escenario T7 (429 → circuit breaker) ya en `unit/test_resilience.py`, elevar a `integration` con servidor local~~ **elevado**: `integration/test_client_errores.py` lleva el 429 real por HTTP hasta el breaker y comprueba que el ciclo siguiente **no consulta** |
| `indicator-engine` | Fases 1, 2, señales (RF-4/RF-5, ADR-0015), análisis de la revisión (RF-6, ADR-0019) y lectura del estado de mercado (RF-7, ADR-0021) | **338** (unit, contract, integration, e2e) | Cobertura de ramas **86 %** (medida 2026-08-04 sobre `src/`); recalibración **HITL** de los umbrales del ruleset (`config/senales.v1.yaml`) y de los dos ejes del régimen (`config/lectura.v1.yaml`); contrastar en vivo la atribución con responsable `oficial` o `ambos` — hace falta un día en que la tasa del BCV cambie de verdad, no solo que esté vigente (ADR-0022 destapó que este hueco se venía describiendo mal: se decía que el fin de semana la suprimía «por diseño», cuando lo que la suprimía era la rancidez mal medida) |
| `ingestor-historico` | Implementado (batch por demanda, sin bus; ADR-0013) — más el histórico de tasas oficiales del BCV (RF-6) y la brecha derivada del lado venta (RF-7), 2026-08-01 | **138** (unit + integración contra TimescaleDB real, incl. las tablas de los servicios vecinos) | ~~Cobertura de ramas 71,71 %~~ **97,22 %** (2026-08-04); ~~integración del cargador de oficiales contra TimescaleDB real~~ **hecha**: `integration/test_tablas_vecinas.py` prueba contra la base real los dos adaptadores que escriben en `official_rates` e `indicators` |
| `api-gateway` | **Implementado** (2026-07-26; ADR-0016) | **124** (unit incl. CORS, refresco del JWKS, profundidad sin outliers y supervisión del consumidor AMQP, contract vs. OpenAPI, integration incl. pool read-only y caída del bus, e2e bus→WSS) | ~~e2e autenticado **en vivo** con token real de Auth0 (client M2M — HITL)~~ **cumplido 2026-08-07**: 6/6 con client M2M propio; marker `security` dedicado; cobertura **92,65 %** (2026-08-06) |
| `web-spa` | **Implementado** (2026-07-27; ADR-0017) | **506** vitest (unit, component, contract `satisfies` + check de frescura de tipos; incl. sistema de diseño, i18n, sellos de demo, panel de medidores y lectura del mercado con dato real en ES/EN, shell responsive, canarios de paleta, punto de corte y cabeceras CSP, y los cinco bloques del Intradía: criterio de selección, histéresis de los cruces, bloque enfrentado, condiciones del ruleset con su línea de disparo en escala, barra de control con su indicador de frescura, formato único de Δ con sus guardas de fuente, catálogo etiqueta/clave en los dos idiomas, tooltip de los sparklines, estado cero con su nota condicionada al dato, canario de tokens de tema y contrato de la tarjeta de métrica, el resumen de cruces repetidos, y el ciclo de reconexión del WSS: 4401 encadenado con backoff y parada, y el contador de reintentos que el handshake NO reinicia) — **88,50 % ramas** (umbral 80 % ya aplicado en `vite.config.ts`) | ~~e2e en vivo `npm run test:e2e:live` (client M2M — HITL)~~ **cumplido 2026-08-07** (6/6); checklist con login real (tokens fuera de storage, renovación 15 min) |

> El plan cubre tanto la **consolidación** de lo existente como la **especificación** de los casos
> que deben acompañar el código pendiente, para que se escriban junto con la implementación (no
> después).

## 5. Casos de prueba por servicio

Notación: `[U]` unit · `[I]` integration · `[C]` contract · `[E]` e2e · `[S]` security.

> Esta sección detalla los cuatro servicios del **flujo reactivo**. `ingestor-historico`
> (batch por demanda, sin bus) y `web-spa` (pirámide vitest propia) no tienen subsección
> de casos: su cobertura vive en la tabla de §4, en la matriz de §8 y en la sección
> «Tests» del README de cada app (ninguna de las dos tiene `tests/README.md`, a
> diferencia de los cuatro servicios del flujo).

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

**Fase 2 y señales (implementadas y verificadas e2e, 2026-07-22 — RF-4/RF-5, ADR-0015) —
casos cubiertos por la suite actual (335 tests):**
- `[U]` Precio de referencia P2P: **mediana y VWAP** del top-N filtrado por lado — cubierto
  (`unit/test_referencia_p2p.py`).
- `[U]` **Brecha BCV↔P2P** (abs y %), spreads compra/venta, volúmenes agregados, profundidad por
  bandas de 0,5 % — cubierto (`unit/test_calculos.py`, `unit/test_process_p2p_snapshot.py`).
- **Variación intradía (apertura VET)**: este plan la daba por cubierta en el motor hasta el
  2026-07-29; era un error de redacción — no existe ningún cálculo de apertura en
  `indicator-engine` (ni código ni tests). Hoy se deriva en el **cliente**, sobre las series que
  ya devuelve `/indicators/history` (`web-spa`: `lib/intradia.ts`, `unit/intradia.test.ts`,
  `component/intradia.test.tsx`). Persistirla como indicador propio del motor sigue pendiente y
  exigiría `calc_version` nuevo.
- `[U/S]` **T2** (filtrado final) — snapshots sintéticos manipulados: filtrado MAD/IQR y marca
  `low_confidence`; los outliers no distorsionan la brecha ni las señales — cubierto.
- `[U]` Reglas de **señales** configurables (ruleset `config/senales.v1.yaml`: `arranque_alcista`,
  `techo_inminente`, `correccion_inminente`; cooldown 60 min) → `signals.emitted` con **evidencia**
  (`inputs`, `rule`, `calc_version`) — cubierto (`unit/test_reglas.py`).
- `[U/S]` **T10** — toda señal es reproducible: misma entrada + `calc_version` ⇒ misma salida —
  cubierto.
- `[C]` `schemas/signal.v1.json` (existe desde 2026-07-20) validado en el productor —
  cubierto (`contract/test_signal_event_schema.py`).
- `[U]` Manejo de `official_stale`: la brecha se marca cuando la tasa oficial está vencida —
  cubierto.
- `[I]` Persistencia de señales en la hypertable `signals` (migración 002) — cubierto
  (`integration/test_signals_repository.py`).
- `[E]` Flujo `p2p.snapshot` (+ `official.rate.updated`) → `indicators.updated` + `signals.emitted`
  — verificado e2e (2026-07-22).

**Análisis de la revisión (implementado y verificado e2e, 2026-08-01 — RF-6, ADR-0019):**
- `[U]` Las cuatro bandas cubren el rango sin huecos, con el **valor exacto en el corte**
  contando hacia arriba — `unit/test_analisis.py`.
- `[U]` La escala degrada al respaldo del ruleset por muestras insuficientes, serie
  constante o **cortes coincidentes**, y la elección viaja en el payload. El último caso
  es el que destapó el defecto de `p2p_outliers_pct_buy` con datos reales (ver abajo).
- `[U]` Posición acotada a [0,1], nudos de igual x colapsados sin dividir por cero, y
  `None` cuando no hay cortes: cero píxeles inventados.
- `[U]` **Canario**: el `30` de `config/analisis.v1.yaml` es el mismo
  `UMBRAL_CONFIANZA_OUTLIERS_PCT` de `calculos.py` — si alguien cambia uno, el test cae.
- `[U]` Config inválida aborta el arranque; desempates (`bloqueada_por`, `closest_rule`)
  deterministas y documentados en el schema.
- `[U]` Proximidad k/n: indicador ausente ⇒ regla no evaluable con `value: null`; con
  `confidence: low` ninguna regla es evaluable; cuando una regla dispara, `completa`
  coincide con `evaluar_reglas` — `unit/test_reglas.py`.
- `[U]` Cache de distribuciones con **reloj inyectado** (sin `sleep`): dentro del TTL no
  reconsulta, vencido refresca, un fallo sirve la entrada vencida y sin cache previa
  devuelve `{}` (degradación visible) — `unit/test_cache_distribuciones.py`.
- `[U]` **No-regresión del camino de señales**: la vista ampliada que pide el análisis no
  cambia las señales emitidas — se comparan lado a lado con y sin análisis.
- `[U]` Un fallo del análisis no manda el snapshot a la DLQ ni impide publicar
  indicadores y señales.
- `[C]` `schemas/analysis.v1.json` validado sobre el evento del **productor real**, con
  todos los decimales en punto fijo — `contract/test_analysis_event_schema.py`.
- `[I]` `percentile_disc` devuelve `Decimal` exacto y valores realmente observados; la
  ventana recorta; un indicador sin filas no aparece — `integration/test_distribuciones_timescale.py`.
- `[I]` Payload verbatim en `indicator_analysis`, reentrega que no duplica y las
  revisiones de BUY y SELL del mismo instante conviviendo — `integration/test_analysis_repository.py`.
- `[E]` Flujo `p2p.snapshot` → `analysis.updated` al bus y a la tabla, con la escala de
  percentiles reales ejercitada — `e2e/test_flujo_snapshot_a_analisis.py`.

### Lectura del estado de mercado (RF-7, ADR-0021)

- `[U]` Los tres tramos de cada eje con el **valor exacto en el umbral** (el umbral no se
  cruza a sí mismo), y `None` cuando no hay dato — no «lateral»/«estable», que afirmarían
  quietud sin saberlo — `unit/test_lectura.py`.
- `[U]` Régimen `null` con **cualquiera** de los dos ejes sin resolver; los ejes que sí
  resolvieron se publican igual — `unit/test_lectura.py`.
- `[U]` Atribución con `Δoficial = 0` (BCV sin publicar en la ventana), con el BCV
  publicando, en el punto exacto de dominancia, y `None` cuando nada se movió —
  `unit/test_lectura.py`.
- `[U]` **Los silencios**: sin atribución con la oficial rancia, sin frase de banda en
  bandas intermedias o con escala en respaldo, sin proximidad a reglas con confianza
  baja — `unit/test_lectura.py`.
- `[U]` 12 mutaciones de config que **abortan el arranque**, incluida
  `dominancia_minima < 0.5`, que haría que los dos lados «dominaran» a la vez —
  `unit/test_lectura.py`.
- `[U]` **La guarda de hueco de captura NO se aplica a `official_rate`**, con su propio
  test nominal: esa serie se persiste solo al cambiar, así que una fila vieja es meseta y
  `Δ = 0` es la evidencia que la atribución necesita. Con la guarda puesta, la atribución
  no se disparaba casi nunca — `unit/test_analizar_revision_lectura.py`.
- `[C]` El evento **con** `reading` valida contra el schema y el evento **sin** `reading`
  también: la aditividad es lo que permite desplegar el gateway por delante del motor.
  Seis variantes rechazadas, entre ellas un claim predictivo fuera del enum y prosa
  colada en el evento — `contract/test_analysis_event_schema.py`.

### Comparativa contra la historia (RF-7, ampliación 2026-08-01)

- `[U]` La ventana COMPLETA más ancha es la referencia; una ancha pero incompleta no
  lo es, y sin ninguna completa se afirma `historia_parcial` en su lugar —
  `unit/test_comparativas.py`.
- `[U]` Se publican TODAS las ventanas, incompletas incluidas, con su cobertura:
  filtrarlas escondería el dato que hace honesta la etiqueta del cliente.
- `[I]` **La media no se inclina hacia el tramo más muestreado.** Sembrado a
  propósito: 48 h a 40 % con 6 muestras/hora y 48 h a 10 % con 120/hora. La media
  honesta es 25 %; una media por muestra da 11,4 %. Es exactamente lo que pasó al
  empalmar el histórico con la serie del motor —
  `integration/test_distribuciones_timescale.py`.
- `[I]` Los extremos SÍ son por muestra (un pico de una sola lectura sobrevive), y
  los contadores son **enteros serializables**: `sum()` sobre `bigint` devuelve
  `numeric` y ese `Decimal` reventaba el `json.dumps` del payload.
- `[U]` **Coherencia de presentación**: la cifra que cita la prosa tiene que estar en
  la tarjeta. Nació de un defecto real —se afirmaba una distancia contra la media
  mientras se mostraba el máximo— y es la regla que lo impide —
  `component/descomposicion.test.tsx`.

> **Arranque en frío: comportamiento correcto, no un bug.** En un compose recién
> levantado `indicators` está vacía, `samples < 200` y **los seis medidores salen en
> respaldo del ruleset**: cifras reales, pie con el contador de muestras y sin relleno
> donde no hay cortes. Hacen falta ~100 min de captura (2 snapshots/min) para entrar en
> régimen de percentiles, y no todos a la vez —los de ventana móvil solo se emiten en su
> lado—. Para ejercitarlo sin esperar: bajar `muestras_minimas` (es lo que hace el test
> e2e), correr el `ingestor-historico`, o dejar el compose ~2 h.

> **Lo que solo aparece con datos reales.** El test unitario de bandas pasaba con
> distribuciones sintéticas bien formadas; fue el compose con 14 039 muestras reales de
> `p2p_outliers_pct_buy` —casi todas cero, p10 = p50 = p90 = 0— el que mostró un snapshot
> impecable clasificado `very_high`. La lección para el plan: **una suite verde sobre
> fixtures no sustituye mirar el payload que sale en vivo**, sobre todo en distribuciones
> con moda en un extremo.

### 5.4 api-gateway (implementado 2026-07-26 — 108 tests; ✔ = cubierto por la suite)
- `[U]` ✔ Validación estricta de inputs (fechas, `interval`, `side`, tópicos); políticas de
  **scopes/permisos**; validación del **access token de Auth0** (RS256 vía JWKS; `iss`/`aud`/`exp`)
  con par RSA/JWKS local de test (`tests/soporte_auth.py`). El gateway **no emite** tokens (ADR-0012).
- `[U/S]` ✔ **T11** — rechazo del **ID token** y de tokens de otra audiencia/tenant usados como
  bearer (`aud`/`iss`/alg/kid → 401) en `unit/test_validador_token.py` (escenario negativo 3).
- `[S]` **T3** — ataques al login mitigados en Auth0 (attack protection, MFA); verificación de la
  config del tenant, no del gateway (escenario negativo 2). *(Sigue siendo revisión de config.)*
- `[I/S]` ✔ **T4** — scraping del histórico: rate limit por token (429 + `Retry-After`),
  **paginación obligatoria**, rango máx. 90 días → 422; headers `X-RateLimit-*` (contract tests).
  Pendiente: fuzzing sistemático de paginación (escenario negativo 4).
- `[I/S]` ✔ **T4** — WSS: máx. 5 conexiones (1008) y 10 suscripciones por `sub`; ping 30 s; cierre
  **4401** por token expirado en sesión; el token de `?token=` se redacta en logs
  (`unit/test_ws.py`, filtro en `__main__.py`) (escenario negativo 5).
- `[S]` ✔ **T9** — inyección en parámetros: queries parametrizadas + whitelist de tópicos +
  **pool de solo lectura verificado** (INSERT rechazado, `integration/test_repositorio.py`).
  Pendiente: SAST en CI (escenario negativo 6).
- `[S]` ✔ **T1-token** — tokens alterados/expirados → 401 **sin diagnóstico interno** (RFC 7807,
  detalle genérico verificado); replay en WSS limitado por `exp` (escenarios negativos 1 y 8).
- `[S]` ✔ **Elevación entre usuarios**: un token con `read:indicators` no accede a `read:rates`
  (403 con el permiso requerido en el detalle) (escenario negativo 7).
- `[C]` ✔ Respuestas REST validadas contra **OpenAPI 3.1** (`contract/test_rest_contract.py`);
  eventos push validados contra los schemas canónicos (la AsyncAPI los referencia); errores RFC 7807.
- `[U/I]` ✔ **Resiliencia del bus** (2026-07-30) — arranque sin broker (el REST sirve y el
  supervisor reintenta con backoff), alerta única por episodio al caer y al restablecerse,
  `/health` reporta `broker: down` mientras no hay consumo real, y tras la reconexión la cola
  efímera, sus bindings y el consumidor se restauran y el push se reanuda
  (`unit/test_consumidor_reconexion.py`, `integration/test_consumidor_amqp.py`; verificado en
  vivo con `rabbitmqctl close_connection`).
- `[E]` ✔ parcial — REST autenticado + evento del bus → push WSS (`e2e/test_flujo_completo.py`,
  token de test). El flujo con **login real** (Auth Code + PKCE → access token de Auth0) queda
  pendiente del client de prueba (HITL).

## 6. Pruebas de sistema (cross-servicio)

Más allá del e2e por servicio, un **e2e de plataforma** valida el camino completo con los cuatro
servicios del flujo en vivo y la infra real (el `ingestor-historico`, batch sin bus, queda fuera
de este camino):

1. `ingestor-bcv` publica `official.rate.updated` → `indicator-engine` recalcula → `api-gateway`
   expone `/rates/official/current` y empuja `rates.official` por WSS.
2. `ingestor-binance` publica `p2p.snapshot` → `indicator-engine` calcula **brecha** →
   `/indicators/current` y push `indicators`.
3. Regla de señal se dispara → `signals.emitted` → `/signals` con evidencia y push `signals`.
4. **Ruta de error del bus:** evento inválido inyectado → va a `market.events.dlq`, el resto del
   flujo sigue operativo (T5).

Estos escenarios se automatizan como suite `e2e` a nivel raíz (nuevo `tests/` de plataforma);
los tramos ya están verificados por partes: bus → indicadores/señales (e2e del engine,
2026-07-22) y bus → REST/WSS del gateway (e2e del gateway, 2026-07-26). Falta encadenarlos
desde las fuentes vivas en una sola suite raíz.

## 7. Seguridad — trazabilidad a amenazas (T1–T15)

Cada amenaza priorizada del threat model tiene su verificación. Esta tabla es la fuente para el
cierre de la columna «Verificación fase 04-testing».

| ID | Amenaza | Caso de prueba | Dónde |
|---|---|---|---|
| T1 | Tasa oficial falsa (MITM / parse) | TLS anclado rechaza CA no esperada; HTML alterado + tasa fuera de rango → `suspect`/`stale` | ingestor-bcv `[I/S]`, `[U/S]` |
| T2 | Anuncios P2P manipulados | Etiquetado MAD en ingesta + filtrado final con snapshots sintéticos y `low_confidence` | ingestor-binance `[U/S]`, engine `[U/S]` |
| T3 | Ataques al login | Attack protection + MFA en el tenant Auth0 (config verificada) | Auth0 (config) |
| T4 | DoS API/WSS (flood, scraping) | Cuotas por token/IP, límites WSS, paginación y rango máx.; fuzzing | api-gateway `[I/S]` |
| T5 | Eventos malformados en el bus | Schema inválido → DLQ, consumidor sobrevive | indicator-engine `[U/S]`; e2e plataforma |
| T6 | Fuga de secretos | **Secrets scanning** en CI; revisión de rotación ≤ 90 d | CI (Gate 2) |
| T7 | Baneo de IP por Binance | Simulación 429 → circuit breaker + backoff + presupuesto | ingestor-binance `[U/S]` → `[I]` |
| T8 | Compromiso de dependencia (supply chain) | **SCA** con umbral de severidad; lockfiles; imágenes por digest | CI (Gate 2) |
| T9 | SQL injection en histórico | Queries parametrizadas + validación; **SAST** + tests de inyección | api-gateway `[S]` |
| T10 | Señales sin trazabilidad | Auditoría end-to-end de una señal; reproducibilidad por `calc_version` | engine `[U/S]`; e2e plataforma |
| T11 | ID token / token de otra audiencia como bearer | Rechazo por `aud`/`iss` inválidos y firma JWKS → 401 | api-gateway `[U/S]` |
| T12 | Robo de token en el navegador (XSS) | Token solo en memoria (`cacheLocation: memory`), vida corta y refresh rotation; CSP del nginx sin `unsafe-inline` | web-spa `[U/S]` (ADR-0017; antes «fuera de este repo») |
| T13 | Señal emitida sin insumos frescos / con estado stale | Frescura entre lados y `official_stale` propagado a la evidencia | indicator-engine `[U/S]` |
| T14 | Export CSV malicioso envenena el histórico | Parseo adaptativo con rechazo sin columna de precio, descarte contado y carga idempotente | ingestor-historico `[U/S]`, `[I]` |
| T15 | Origen web no autorizado consume la API desde el browser | CORS por allowlist (origen permitido con ACAO, ajeno sin ACAO, errores problem+json con ACAO) | api-gateway `[U/S]` |

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
| Brecha, spreads, VWAP/mediana, profundidad | motor-indicadores (indicadores) | U | indicator-engine |
| Señales con evidencia + reproducibilidad | motor-indicadores (esc. positivos 3) | U/S | indicator-engine |
| DLQ ante evento inválido | motor-indicadores (esc. neg. 4) | U/S | indicator-engine |
| Auth JWT + scopes | api-streaming (objetivos, esc. 1) | U/E | api-gateway |
| Rate limit + lockout + límites WSS | api-streaming (esc. neg. 2–4) | I/S | api-gateway |
| Validación de inputs / inyección | api-streaming (esc. neg. 5) | S | api-gateway |
| Aislamiento entre consumidores | api-streaming (esc. neg. 6) | S | api-gateway |
| Login PKCE + token solo en memoria + renovación silenciosa | web-spa-dashboard (RF-1) | U/S | web-spa |
| Dashboard en vivo con push WSS y resync REST por (re)conexión | web-spa-dashboard (RF-2, RF-3) | U/C | web-spa |
| Histórico ≤ 90 días con paginación transparente | web-spa-dashboard (RF-4) | U/C | web-spa |
| Honestidad del dato (404 «sin datos», null «—», decimal exacto) | web-spa-dashboard (RF-5) | U | web-spa |
| Variación intradía vs. apertura del día operativo VET | web-spa-dashboard (RF-7) | U | web-spa |
| Vista de análisis con sus números reales | web-spa-dashboard (RF-8) | U/C | web-spa |
| Idioma ES/EN completo y separadores por locale | web-spa-dashboard (RF-9) | U | web-spa |
| Tema claro/oscuro explícito y recordado | web-spa-dashboard (RF-10) | U | web-spa |
| Lectura del mercado sin consejo ni pronóstico, en ES/EN | web-spa-dashboard (RF-12) | U/C | web-spa |
| Histórico de tasas oficiales: columna ASK, escala BsD y procedencia visible | ingesta-historica (RF-6) | U | ingestor-historico |
| Brecha derivada del lado venta, cortada antes de la serie del motor | ingesta-historica (RF-7) | U | ingestor-historico |
| Comparativa contra la historia con cobertura declarada | motor-indicadores (RF-7) | U/I/C | indicator-engine |
| La cifra que cita la prosa está en la tarjeta | web-spa-dashboard (RF-12) | U | web-spa |
| Sello `demo · sin fuente` en todo bloque sin dato servido | web-spa-dashboard (RF-5 ampliado) | U/S | web-spa |

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
1. Cobertura de ramas **≥ 80 %** por servicio con código. **CUMPLIDO en los seis
   (2026-08-04).** Llegó a estar sin cumplir en tres: la medición del 2026-08-03
   se hizo con `--cov` a secas, que mete los propios ficheros de test en el
   denominador y por tanto inflaba el total. Remedido sobre `src/` —lo que el SPA
   ya venía haciendo con `include: ["src/**"]`— aparecieron tres por debajo, y se
   cubrieron:

   **Qué mide cada columna, porque no era lo mismo en las seis filas.** En los
   cinco servicios Python la cifra que se venía citando es la **combinada** de
   `coverage` (`percent_covered`: sentencias + ramas sobre `src/`), no las ramas
   solas; en el SPA, `vitest` sí reporta ramas aparte y es esa la que se cita y la
   que aplica el umbral de `vite.config.ts`. Se separan aquí para que la
   comparación entre filas signifique algo. **El criterio de salida se cumple con
   cualquiera de las dos**: la más baja en ramas puras es 82,71 %.

   | Servicio | Combinada (`src/`) | Ramas solas | ≥ 80 % |
   |---|---|---|---|
   | `ingestor-bcv` | 99,36 % | 96,94 % (95/98) | ✔ |
   | `ingestor-binance` | 99,27 % | 96,77 % (60/62) | ✔ |
   | `ingestor-historico` | 97,22 % | 93,43 % (185/198) | ✔ |
   | `api-gateway` | 92,65 % | 84,38 % (135/160) | ✔ |
   | `web-spa` | 94,89 % | **88,13 %** (1151/1306) | ✔ |
   | `indicator-engine` | 85,88 % | 82,71 % (311/376) | ✔ |

   Cifras de la propia pipeline (2026-08-04), no de una ejecución a mano: **el
   punto 5 de esta lista deja de estar pendiente para la cobertura**.

   La pipeline no impone el 80 % plano sino un **trinquete** por servicio en su
   valor actual: el criterio de salida es el 80 %, pero lo que rompe el build es
   cualquier retroceso desde donde está hoy cada uno.

   **El patrón que dejaron los tres:** lo que faltaba no era código de negocio
   —dominio y aplicación ya iban del 94 % al 100 %— sino el **entrypoint**, el
   **bucle programado** y, en dos de los tres, la **configuración**. Es decir,
   todo lo que parece cableado y no lo es: el suelo antimartilleo, la garantía de
   `--dry-run`, el `finally` que libera conexiones y los fail-fast de arranque. Y
   en los **tres**, `connect()`/`close()` de los repositorios estaba sin
   ejercitar por la misma causa: los fixtures de integración reciben el pool ya
   construido, así que la forma en que el servicio se conecta de verdad no la
   probaba nadie.
2. Todos los casos de las secciones 5–7 aplicables al alcance entregado, en verde.
   **Cumplido**: 1 263 tests en verde, los seis proyectos, en cada push desde el
   2026-08-04. Lo que la pipeline no ejecuta es el e2e autenticado en vivo, que
   depende de credenciales del tenant (punto abierto abajo).
3. Cada amenaza T1–T15 con su verificación satisfecha (tests o gate de CI).
   **Casi**: T1, T6, T7 y T9 pasaron a cubiertas el 2026-08-04 (marcadores
   `security` y gates de CI). **T8 queda parcial** —el SCA corre, pero sin
   lockfiles ni digests audita un árbol que cambia entre ejecuciones— y T3, T4,
   T13 conservan partes que son revisión humana, no test.
4. Contract tests en verde en **productor y consumidor** para cada evento con schema.
   **Cumplido** y verificado en cada push.
5. Gates de CI: **secrets scanning** (T6) y **SCA** (T8) sin hallazgos por encima
   del umbral. **Cumplido con una excepción aceptada**: los tres gates rompen el
   build y están en verde. El SCA cerró de paso 3 vulnerabilidades `high` que ya
   estaban en el `web-spa`.

   **Riesgo aceptado (2026-08-06, Jeremi Alcalá) — CVE-2026-59870 en `js-yaml`.**
   Llega por `openapi-typescript → @redocly/openapi-core → js-yaml@4.x`. Se acepta
   porque el vector —consumo cuadrático de CPU al resolver `!!omap`— **no es
   alcanzable aquí**: lo único que ese paquete parsea es
   `apps/api-gateway/docs/openapi.yaml`, un fichero del repo sin `!!omap` que
   ningún tercero controla; y es dependencia de desarrollo que genera
   `types.gen.ts` en build, no entra en el bundle.

   **No se arregla ya porque el arreglo rompe la herramienta.** `js-yaml` solo
   corrige en 5.x y se probó el override: deja el audit en cero y **revienta el
   generador** —js-yaml 5 retiró `types.merge` y redocly falla al cargar—. Un gate
   en verde con la herramienta rota es peor que uno en rojo.
   `openapi-typescript@7.13.0` ya es la última y fija redocly en 1.34.x.

   **Se retira** cuando `openapi-typescript` publique una versión con
   `@redocly/openapi-core@2.x`; el propio gate lo exigirá al dejar de aplicar la
   excepción. Revisión anotada para el **2026-09-06**. Al actualizar, comprobar que
   `npm run generate:api` sigue dando el mismo `types.gen.ts` byte a byte.
6. Sin tests marcados `xfail`/`skip` salvo los de infraestructura documentados.
   **Cumplido**: cero `xfail` y cero `skip` incondicionales en el monorepo; los
   únicos saltos son los de infraestructura ausente, y desde el 2026-08-04 **solo
   un fallo de conexión** los provoca — antes cualquier error del andamiaje se
   disfrazaba de «no hay TimescaleDB» y dejaba la suite en verde sin ejecutar.

**Lo que le falta a Gate 2 para cerrarse**, en orden de dependencia:

| Pendiente | Por qué sigue abierto |
|---|---|
| ~~Llevar el e2e en vivo **al pipeline**~~ **hecho 2026-08-20** | `e2e-vivo.yml` levanta el gateway con compose en el propio runner (§11). Queda un paso **HITL**: dar de alta `AUTH0_M2M_CLIENT_ID` y `AUTH0_M2M_CLIENT_SECRET` en *Settings → Secrets → Actions*. Sin ellos, los PR siguen verdes con los rechazos y el camino feliz **falla** en push y en el nocturno, que es lo que se quiere: la ausencia se ve, no se calla |
| Deuda de T8: **lockfiles + imágenes por digest** | Cambio de repositorio, no de pipeline: los cinco servicios declaran rangos y las imágenes van por tag (incluida `timescaledb:latest-pg16`) |
| Deuda de T8: **CVE-2026-59870 (`js-yaml`) aceptado** | Vector no alcanzable (dependencia de desarrollo, entrada propia sin `!!omap`); el arreglo disponible rompe el generador de tipos. Se retira cuando `openapi-typescript` suba a redocly 2.x — revisar 2026-09-06 |
| Marcador `security` en `api-gateway` | Donde viven T9 y T11; los otros dos servicios ya lo tienen |
| Recalibración **HITL** de umbrales (ruleset y régimen) | Decisión humana con datos de producción |

## 11. Automatización y CI

**Implementada el 2026-08-04** en `.github/workflows/` (GitHub Actions; el repo es
público, así que los minutos son gratis).

- **`ci.yml` — matriz por app:** los cinco servicios Python y el `web-spa`, en
  paralelo y sin `fail-fast`. Corre la **suite completa, integration y e2e
  incluidas**, contra TimescaleDB y RabbitMQ como `services:` del trabajo — no
  hace falta variante de configuración porque los `conftest.py` ya caían a
  `127.0.0.1:5433` y `:5672`, que es lo que publica el mapeo de puertos. El SPA
  suma `typecheck`, `lint`, `check:api-types` y `build` (que usa `tsc -b`, más
  estricto que el typecheck: ya dejó pasar una vez un campo ausente del contrato).
  Sin filtros por ruta: 1 263 tests son baratos y un filtro mal puesto da verdes
  vacíos.
- **`e2e-vivo.yml` — el gateway y el tenant de verdad (2026-08-20):** un solo
  trabajo que levanta `api-gateway` con `docker compose up --wait` en el runner
  —arrastrando timescaledb, que nace con el esquema por los montajes de initdb, y
  rabbitmq— y corre `npm run test:e2e:live` contra `localhost:8800`.

  **Los disparadores salen de que las dos suites prueban cosas distintas.** Los
  rechazos prueban CÓDIGO (que el 401 sea 401, que el WSS cierre con 4401) y eso
  se rompe con un commit: van en **cada PR**. El camino feliz prueba la
  CONFIGURACIÓN del tenant —que la app M2M exista, con su grant y sus permisos— y
  eso no se rompe con un commit sino cuando alguien toca el panel de Auth0 un
  martes cualquiera: va en **push a main/develop y en un cron a las 06:00 UTC**,
  con el mismo razonamiento que la pasada semanal de `seguridad.yml`. Ponerlo en
  cada PR lo ejecutaría cuando no hace falta y no lo ejecutaría cuando sí.

  **En CI, «no estaba el entorno» tiene que ser rojo.** Todo el archivo de tests
  está construido sobre `skipIf`, que es lo correcto en local y se invierte aquí:
  el job monta el entorno, así que si algo falta —secreto rotado y no
  actualizado, contenedor que no arrancó— un skip sería verde certificando nada,
  el mismo fallo que la suite ya tuvo. El job pasa `E2E_LIVE_EXIGIDO=1` fuera de
  los PR y el test lo convierte en fallo de carga del módulo. Comprobado
  ejecutándolo en los dos modos de ausencia: sin credenciales y con el gateway
  apagado, ambos salen en rojo con el motivo escrito.

  **El secreto no es alcanzable desde ningún evento de PR.** El repo es público:
  un PR de fork no recibe secretos, así que allí el camino feliz salta —vacío
  cuenta como ausente: en Actions un secreto que no existe interpola a **cadena
  vacía**, no a variable sin definir, y con `=== undefined` el fork habría entrado
  al camino feliz con credenciales vacías—. Volcar los logs del gateway al fallar
  también es seguro: `__main__.py` redacta `token=…` de los access logs, y se
  comprobó sobre logs reales que sale `token=[REDACTADO]`.

  **Lo que este trabajo NO cubre:** nginx y el túnel de Cloudflare. El runner
  habla con el contenedor a pelo, así que la corrida manual contra
  `criterio-dev` no desaparece — pasa de ser la única comprobación a ser la del
  despliegue. Y los `schedule` de GitHub solo disparan desde la rama por defecto,
  así que el nocturno no empieza hasta que esto llegue a `main`.

- **`seguridad.yml` — los gates de Gate 2, rompiendo el build:**
  - **T6:** `gitleaks` sobre la **historia completa** (`fetch-depth: 0`) — en un
    repo público, un secreto borrado al commit siguiente sigue ahí. Con
    `--redact`, para que el hallazgo no sea una segunda fuga en unos logs
    públicos.
  - **T8:** `pip-audit` en un venv por servicio (`--skip-editable --strict`) y,
    en el SPA, `scripts/auditar-npm.mjs` sobre `npm audit --json` con umbral
    `high`. Umbral de Python: **cero vulnerabilidades conocidas**, con excepciones
    explícitas si hace falta — más estricto que un corte por severidad, y con
    mejor rastro de auditoría.

    **Por qué no es `npm audit` pelado.** No sabe de allowlists: o pasa entero o
    falla entero, y las dos salidas fáciles —bajar el umbral, añadir `--omit=dev`—
    desactivan el control para todo el árbol de desarrollo. El script solo silencia
    lo que esté aceptado por escrito en `scripts/npm-audit-excepciones.json`, con
    su motivo, quien lo acepta y su condición de retirada; resuelve la cadena de
    `via`, así que aceptar un aviso cubre los paquetes que solo son vulnerables por
    depender de él, sin pedir una excepción por eslabón.

    **Y falla también cuando una excepción deja de aplicar.** Es la propiedad que
    impide que se pudra: el día que llegue el arreglo, el gate obliga a borrar la
    entrada en vez de dejarla cubriendo en silencio lo siguiente que aparezca con
    el mismo id. Verificado por mutación en los tres estados —sin excepción falla,
    con excepción muerta falla, con el árbol real pasa—.
  - **T9:** CodeQL (`security-and-quality`) para Python y TypeScript. **CodeQL por
    sí solo no rompe el build**: deja una alerta y sigue. Un paso posterior lee el
    SARIF y falla ante hallazgos de nivel `error` — ese es el umbral de severidad;
    `warning` y `note` se quedan en la pestaña Security.
  - Pasada semanal por `schedule`: una dependencia no cambia, pero lo que se
    **sabe** de ella sí.
- **Reporte de cobertura** por servicio como artefacto, **también en ejecuciones
  rojas** — que es cuando hace falta.
- **Pendiente del control de T8: fijar.** Los cinco servicios Python declaran
  rangos (`fastapi>=0.111`) sin lockfile, y las imágenes van por tag —incluida
  `timescale/timescaledb:latest-pg16`, un `latest` moviéndose bajo los tests—. El
  SCA audita lo instalado, que es lo más honesto sin fijar, pero el control dice
  «lockfiles + SCA + imágenes por digest» y de los tres solo está el del medio.
- **Fuente de convenciones de marcadores:** `[tool.pytest.ini_options]` en cada `pyproject.toml`
  (`asyncio_mode = "auto"`, marcadores `integration` y `e2e`; `security` ya en
  `ingestor-bcv` —T1, HTML alterado— y en `ingestor-binance` —T7, 429 sostenido—.
  **Pendiente en `api-gateway`**, que es donde viven T9 y T11.)

## 12. Riesgos y pendientes

- ~~`signal.v1` sin definir~~ **Resuelto:** `schemas/signal.v1.json` definido (2026-07-20) y con
  contract tests del productor en verde (`contract/test_signal_event_schema.py`).
- **Umbrales de señales (HITL):** los valores iniciales están fijados en `config/senales.v1.yaml`;
  su recalibración requiere decisión humana con datos de producción.
- ~~`api-gateway` sin código~~ **Resuelto:** implementado 2026-07-26 con 90 tests, hoy 108 (§5.4);
  queda el e2e autenticado en vivo (client M2M de prueba — HITL).
- **Secret store concreto:** definido para fase 05; los tests de rotación (T6) se afinan entonces.
- ~~Pipeline CI aún no presente en el repo~~ **Resuelto (2026-08-04):** dos
  workflows en `.github/workflows/` con la matriz de §11 y los tres gates
  rompiendo el build. Lo que queda de ese frente es la **deuda del control de
  T8**: sigue sin haber lockfiles en los cinco servicios Python ni imágenes
  fijadas por digest, así que el SCA audita lo que se instala en cada ejecución y
  no un árbol reproducible.
- ~~Paleta de series del `web-spa` en tema claro~~ **Resuelto (2026-07-31):**
  las marcas de dato tienen slots propios validados (claro ΔE 8,1 · oscuro
  ΔE 13,2) y el mapa de calor pasa a rampa secuencial de un tono por tema. La
  verificación corre **con el validador**, no a ojo, y `tests/unit/paleta.test.ts`
  fija los valores medidos para que un cambio de color no pase en silencio.
  Sigue abierto, como asunto de diseño: subir el par del tema oscuro a la banda
  de luminosidad y al piso de croma (hoy pasa CVD pero queda fuera en esas dos).
- **La rampa teal del mapa de calor NO pasó por el validador (2026-08-02, rampa
  sustituida el 2026-08-03).** El script del skill dataviz no está instalado en la
  máquina donde se hizo el cambio. La rampa vigente es el **teal de marca a cinco
  alfas** (8, 22, 40, 65 y 100 %), y de ella se midió aparte lo que estaba en
  juego: contraste sobre la superficie (oscuro 1,19 · 1,66 · 2,53 · 4,25 · 7,85;
  claro 1,11 · 1,35 · 1,77 · 2,68 · 5,15), monotonía de luminosidad y ΔE2000 del
  salto teal→coral (14,0 protan). **Su primer escalón queda por debajo del 2:1**
  que el proyecto exige a una marca sobre su fondo, y se acepta a propósito: en un
  mapa lo que hay que distinguir es una celda de su **vecina**, no del fondo. Lo
  que sí quedó indistinguible fue el hueco sin dato (1,06:1 contra la celda más
  floja), resuelto con **forma** —un filete interior— y no con más color. Los
  números están en `tests/unit/paleta.test.ts`. **Pendiente:** volver a pasarla por
  el validador cuando el skill esté disponible — es la misma distancia entre
  «medido» y «validado» que este apartado existe para no dejar difuminar.

---

*Documento vivo de la fase 04-testing. Al cambiar el alcance, actualizar este plan, el concepto OKF
afectado en `knowledge/`, `knowledge/log.md` y el `CHANGELOG.md` (`[Unreleased]`).*
