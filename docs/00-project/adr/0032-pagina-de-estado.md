# ADR-0032: La página de Estado se alimenta de un sondeo propio, fuera del gateway, y de incidentes versionados en el repo

- **Estado:** accepted
- **Fecha:** 2026-10-04
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 06-monitoring (primer artefacto de la fase)
- **Origen:** decisión D7 de `docs/01-requirements/portal-publico.md`
- **Relacionado:** ADR-0028 (`/portal/v1`), ADR-0026 (ingesta P2P cada 60 s)

## Contexto

El diseño del portal tiene una página de Estado con:

- el estado global y la edad del snapshot P2P y de la tasa BCV;
- la latencia p50 de la API;
- **barras de disponibilidad de 60 días** para seis componentes: API REST,
  WebSocket, Ingesta P2P, Captura BCV, Motor de indicadores y Portal;
- un historial de incidentes.

En el diseño, todo eso son datos de ejemplo. Hoy **no hay nada que lo mida**:

- la única señal HTTP es `/api/v1/health` (base, broker, auth);
- los ingestores y el motor no exponen HTTP;
- no hay Prometheus ni registro de incidentes;
- la fase 06-monitoring del AI-DLC no ha empezado.

Una página de estado tiene una exigencia que no tiene ninguna otra: **tiene que
seguir respondiendo cuando lo que reporta está caído**. Si sus datos salen del
gateway, una caída del gateway deja la página en blanco justo cuando alguien la
abre para saber qué pasa.

## Decisión

### 1. Un servicio de sondeo propio: `apps/estado`

- **Servicio nuevo y pequeño** en el compose, en Python como el resto, **fuera
  del gateway**. Cada minuto comprueba los seis componentes y guarda el
  resultado. No lo hace el gateway, porque un servicio no puede medir su propia
  caída.
- **Qué se comprueba**, y qué cuenta como caído:

| Componente | Comprobación | Operativo | Degradado | Caído |
|---|---|---|---|---|
| API REST | `GET /api/v1/health` por la red interna | 200 y `ok` | 200 y `degraded` | error, timeout, 503 |
| WebSocket | abrir `/ws/v1` **sin token** | cierra con 4401 (el servicio está vivo y valida) | — | no conecta |
| Ingesta P2P | edad de `max(captured_at)` en `p2p_snapshots_raw` | < 3 min | 3–10 min | > 10 min |
| Captura BCV | `official_rate_source_health` | sin `stale_since` | `stale_since` < 6 h | `stale_since` ≥ 6 h (el umbral de `official_stale`) |
| Motor | edad de `max(as_of)` en `indicators` | < 3 min | 3–10 min | > 10 min |
| Portal | `GET` a la página de inicio por la red interna | 200 | — | error |

  Los umbrales de 3 y 10 minutos salen de la cadencia real: la ingesta es de
  60 s (ADR-0026) y el motor reacciona a ella. Se ajustan con datos cuando
  haya historial.
- **La latencia p50 de la página es la de `/api/v1/health` medida por el
  sondeo**, en la última hora. **La página lo dice así**: «latencia de
  /health», no «latencia de la API». La latencia del tráfico real llegará con la
  medición de uso del gateway (fase 8); mientras tanto, no se pinta una cifra
  que no se mide.

### 2. Los datos: una hipertabla y su agregado diario

- **`estado.comprobaciones(ts, componente, resultado, latencia_ms, detalle)`**:
  hipertabla en un **esquema propio** (`estado`), con un rol de base que solo
  ve ese esquema y lee las tablas de datos que necesita para medir frescura.
  Son 6 filas por minuto, unas 8.600 al día. **Retención: 90 días**: la página
  muestra 60, y quedan 30 de margen.
- **Agregado diario** por componente: minutos operativos, degradados, caídos y
  **sin datos**.
- **Cómo se calcula el porcentaje:**
  - **Disponibilidad = operativo + degradado, sobre los minutos con dato.** Un
    degradado responde, solo que peor; cuenta como disponible, pero el día se
    pinta del color de su peor estado.
  - **Un minuto sin comprobación no se cuenta como disponible.** Si el sondeo no
    corrió, no se sabe, y la barra de ese día lo enseña como **«sin datos»** (gris),
    no en verde. Es el caso de una caída de la máquina entera: la honestidad de
    la página depende de no rellenar ese hueco.

### 3. La página lee del servicio de estado, no del gateway

- `apps/estado` sirve su propia lectura, **`GET /estado/v1`**, en una ruta del
  túnel **distinta de la del gateway**. Una caída del gateway sale en la página
  como API REST «caída»; no tumba la página.
- **Mismas reglas que `/portal/v1` (ADR-0028):** solo GET, sin token, caché de
  30 s, límite por IP real, campos por lista blanca.
- La **carcasa** de la página (títulos, estructura) va prerenderizada en el
  portal (ADR-0031); los datos se piden al cargar.

### 4. El límite honesto: una caída de la máquina entera

Todos los servicios corren en la misma máquina. Si cae la máquina, o su red,
cae también el sondeo, y la página no puede contarlo: no hay quien la sirva.

- **Sondeo externo con GitHub Actions**, por cron cada 5 minutos, contra la URL
  pública del portal y contra `/api/v1/health`. No escribe en nuestra base: eso
  exigiría abrir un endpoint de escritura a internet. Hace dos cosas:
  - **avisa por ntfy** al primer fallo y al recuperarse, por el mismo canal que
    los respaldos y la pasada de seguridad;
  - deja el historial en las corridas del workflow.
- **Lo que la página enseña después de una caída total:** los días afectados
  salen con minutos **«sin datos»**, y el incidente se registra a mano (§5) con
  las horas que dio el sondeo externo. Nunca aparecen como operativos.
- El cron de GitHub Actions **no es puntual**: puede retrasarse varios minutos
  en horas de carga. Sirve para enterarse de una caída, no para medirla al
  minuto. Es un límite aceptado.

### 5. Incidentes: YAML en el repo, revisados por PR

- **Un archivo por incidente** en `docs/estado/incidentes/`, por ejemplo
  `2026-09-28-captura-bcv-retrasada.yaml`, con:
  - inicio, fin y duración;
  - componentes afectados y severidad;
  - título y resumen **en ES y EN**.
- **Por qué en el repo y no en una base:** son pocos, quedan con historia y
  autor, y se revisan antes de publicarse. Lo que dice la página de estado es
  una comunicación pública, y conviene que pase por un PR.
- El servicio de estado los lleva dentro de su imagen y los sirve en
  `/estado/v1`. **Publicar un incidente exige desplegar** el servicio.
- **Límite aceptado:** durante una caída en curso, la página muestra el estado
  en vivo de las barras, pero el texto del incidente llega con el PR. Si se
  necesita comunicar en caliente, se hace desde el backoffice más adelante.

## Alternativas consideradas

- **Que el gateway sirva el estado:** se cae con lo que reporta. Descartada.
- **Un servicio externo de *status page*** (Statuspage, Instatus, Better Stack):
  resuelve la independencia de la máquina, pero mide desde fuera y no ve la
  frescura de las ingestas ni del motor, que es lo que diferencia «la API
  responde» de «la API responde con datos de hace una hora». Se puede añadir
  como sondeo externo más adelante, sin cambiar esta decisión.
- **Prometheus + Grafana:** es la pieza correcta para la fase 06 completa
  (SLOs, alertas, métricas de tráfico), pero es mucha infraestructura para
  alimentar una página. Si llega, el servicio de estado puede leer de él en
  lugar de sondear.
- **Incidentes en la base desde el backoffice:** más rápido de publicar en
  caliente, sin revisión. Se reconsidera cuando exista el backoffice
  (ADR-0030 §5).

## Consecuencias

- **Positivas:**
  - la página dice la verdad, incluido «no lo sé» para los minutos sin
    comprobación;
  - una caída del gateway sale reflejada en la página, en vez de tumbarla;
  - es el primer artefacto de la fase 06-monitoring;
  - las comprobaciones sirven también para alertas.
- **Negativas / deuda asumida:**
  - **un servicio más** en el compose, con su imagen, su esquema y su rol de
    base;
  - **publicar un incidente requiere desplegar**;
  - la latencia que se muestra es la de `/health`, no la del tráfico real,
    hasta la fase 8.
- **Respaldo:** el esquema `estado` entra en el `pg_dump` completo que ya sube a
  B2. Que se pierda no es grave: son 90 días de comprobaciones.
- **Impacto en threat model:**
  - superficie pública nueva, `/estado/v1`, con las mismas mitigaciones que
    `/portal/v1`;
  - el rol de base del sondeo **solo lee** las tablas cuya frescura mide.

## Verificación

- **Parar el contenedor del gateway:** en el minuto siguiente, API REST y
  WebSocket salen «caído», y la página de estado sigue respondiendo.
- **Parar el sondeo diez minutos:** la barra del día muestra esos minutos como
  «sin datos», y el porcentaje no los cuenta como disponibles.
- **Parar la ingesta P2P:** a los 3 min sale «degradado» y a los 10 min
  «caído», con la edad del último snapshot en el detalle.
- **El sondeo externo** avisa por ntfy cuando el portal público no responde, y
  otra vez cuando vuelve.
- **Un YAML de incidente mal formado** rompe el build del servicio, no la
  página en producción: se valida contra un esquema en CI.
