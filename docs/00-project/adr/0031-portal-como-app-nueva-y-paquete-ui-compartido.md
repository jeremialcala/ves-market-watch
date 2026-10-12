# ADR-0031: El portal es una app nueva, y el sistema de diseño y los componentes pasan a un paquete compartido

- **Estado:** accepted
- **Fecha:** 2026-10-04
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 02-design
- **Origen:** decisión D5 de `docs/01-requirements/portal-publico.md`
- **Enmienda a:** ADR-0017 (SPA en el monorepo) y ADR-0018 (sistema de diseño
  copiado al `web-spa`)

## Contexto

El portal público reutiliza casi todo lo que pinta el `web-spa`: la lectura de
mercado, los medidores, la descomposición de la brecha, la profundidad, la
sesión intradía, los episodios comparables y el historial de reglas. Pero el
`web-spa` es otra cosa:

- **no tiene router:** cambia de vista con un `useState`;
- **todo va dentro de `RequireAuth`:** no hay ni una pantalla sin login;
- **lee de `/api/v1`,** mientras que el portal leerá de `/portal/v1`
  (ADR-0028).

ADR-0018 decidió **copiar** el sistema de diseño Higerotech dentro del
`web-spa` (`src/ds/`), no enlazarlo. Con una sola app era lo razonable. Con dos,
copiar otra vez significa dos versiones de cada token y de cada gráfico, que
divergen en cuanto una de las dos se toca.

## Decisión

### 1. Dos apps con fines distintos

- **`apps/portal`**: el sitio público. Usa el mismo stack que el `web-spa`
  (React 19, Vite, TypeScript) y añade **router** y **prerender** de las
  páginas sin datos de sesión: Producto, Precios, APIs y la carcasa de Estado.
  La landing tiene que indexarse, y una SPA vacía hasta que carga el JS no se
  indexa bien. Lee de `/portal/v1` (ADR-0028), y del acceso Comunidad para
  Intradía e Histórico (ADR-0029).
- **`apps/web-spa`**: sigue como **consola interna con login**, contra
  `/api/v1`. No se borra ni se reescribe.

### 2. Un paquete compartido de UI, no una segunda copia

- **`packages/criterio-ui`**: tokens, componentes del sistema de diseño, i18n,
  tema claro/oscuro, y los componentes de dominio que usan las dos apps
  (`GapPanel`, `GaugePanel`, `DepthChart`, `MarketRegimeCard`,
  `SessionReading`, `SessionTimeline`, `SerieTemporal`, `RuleDistance`,
  `EpisodiosComparables`, `HistorialReglas`…), con las funciones de `src/lib/`
  de las que dependen.
- **Los componentes reciben datos, no los piden.** Hoy algunos leen del
  `marketStore` o llaman a `api/endpoints.ts`. Al pasar al paquete reciben
  props: cada app los alimenta desde su propio contrato (`/api/v1` o
  `/portal/v1`). Es el cambio de verdad de esta ADR, y la razón de que el
  paquete sea compartible y no un `web-spa` disfrazado.
- **Se extrae lo que el portal necesita, cuando lo necesita.** No se mueve el
  `web-spa` entero de golpe. Cada componente que el portal adopta se mueve al
  paquete con sus tests, y el `web-spa` pasa a importarlo de ahí en el mismo PR.

### 3. Un workspace de npm en la raíz

Hoy no hay workspace: el `web-spa` tiene su propio `package.json` y su
lockfile. El paquete compartido obliga a crearlo:

- **`package.json` raíz** con `workspaces: ["apps/web-spa", "apps/portal",
  "packages/*"]` y **un solo lockfile** en la raíz.
- **Lo que cambia con eso**, y hay que ajustar en el mismo PR que crea el
  workspace:
  - `.github/workflows/ci.yml`: el job de `web-spa` hace `npm ci` y cachea por
    `apps/web-spa/package-lock.json`. Pasa a la raíz, y se añade el job del
    portal.
  - `apps/web-spa/Dockerfile`: copia `apps/web-spa/package*.json` y hace
    `npm ci` dentro. Pasa a copiar el manifiesto raíz, el del paquete y el de la
    app, con el contexto en la raíz (que ya lo es en el compose).
  - `scripts/auditar-npm.mjs` y `seguridad.yml`: auditan `apps/web-spa`. Pasan a
    auditar el workspace. `T8 · SCA (npm)` tiene que seguir cubriendo **todo**
    lo que se despliega, también el portal y el paquete.
  - `e2e-vivo.yml`: comprobar las rutas.
- **La regeneración de tipos** (`openapi-typescript`) queda por app: cada una
  genera los de su contrato.

## Alternativas consideradas

- **Evolucionar el `web-spa`:** añadirle router y sacar de `RequireAuth` las
  páginas públicas. Una sola app, pero mezcla un sitio público e indexable con
  la consola interna. Mete en el mismo bundle el código que solo usa la consola,
  y obliga a que cada cambio de la consola se despliegue en el sitio público.
- **App nueva copiando `src/ds` y los componentes** (como hizo ADR-0018): lo
  más rápido el primer día, y dos versiones divergentes en un mes.
- **Framework con SSR** (Next.js, Astro): resuelve el SEO de serie, pero cambia
  de stack respecto del `web-spa` y añade un servidor Node que operar. El
  prerender de Vite cubre las páginas que necesitan indexarse, que son las
  estáticas.
- **Publicar el paquete en un registro npm:** innecesario dentro de un monorepo.

## Consecuencias

- **Positivas:**
  - una sola versión de cada componente y de cada token;
  - el portal arranca con casi todos los bloques ya probados;
  - el `web-spa` no corre riesgo: sigue siendo lo que es.
- **Negativas / deuda asumida:**
  - **El PR que crea el workspace toca CI, el Dockerfile y el auditor de npm a
    la vez.** Es la fase 1 del plan y conviene hacerlo solo, sin componentes
    movidos todavía, para que si algo se rompe se sepa por qué.
  - **Pasar los componentes a props** es trabajo en cada uno que se mueva, no
    un `git mv`.
  - Un cambio en el paquete despliega las dos apps.
- **ADR-0018 queda enmendada:** el sistema de diseño ya no vive copiado en
  `apps/web-spa/src/ds`. Vive en `packages/criterio-ui`, y sigue siendo una copia
  del Higerotech Design System, no un enlace a él.

## Verificación

- **Tras crear el workspace**, sin mover ningún componente: CI en verde, la
  imagen del `web-spa` se construye y sirve igual, y `T8 · SCA (npm)` audita el
  lockfile raíz.
- **Cada componente movido** conserva sus tests en el paquete, y el `web-spa`
  pasa su suite importándolo de `@criterio/ui`.
- **Ningún componente del paquete importa** de `api/`, `state/` ni `auth/`. Se
  comprueba con una regla de lint, no a ojo.
- **Las páginas prerenderizadas** del portal sirven HTML con contenido (no un
  `<div id="root">` vacío). Se comprueba con `curl` sobre el build.
