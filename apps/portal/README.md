# portal

El sitio público de Criterio (ADR-0031): la landing de Producto, y en
siguientes versiones el Dashboard sin cuenta, Intradía, Histórico, APIs,
Precios y Estado. Diseño: `Criterio Público.dc.html` (proyecto de Claude
Design «Criterio»). Requisitos: `docs/01-requirements/portal-publico-prd.md`.
Plan: `docs/03-implementation/portal-publico-implementacion.md`.

## Qué hay

- **Landing de Producto (`/`, RF-1):** hero con la lectura de hoy, las cuatro
  promesas (Procedencia, Anticipación, Contexto y Explicación) con su panel en
  vivo, los casos de uso y el CTA.
- **Las demás rutas** (`/dashboard`, `/intradia`, `/historico`, `/apis`,
  `/precios`, `/estado`) existen con su título y su descripción, y dicen que
  están en construcción. No fingen datos.
- **Barra «en vivo»** con la edad del dato (`as_of` del snapshot, no la de la
  petición), navegación, ES/EN y tema claro/oscuro. Pie con contacto y
  WhatsApp.

## Cómo funciona

- **Datos:** `GET /portal/v1/snapshot` y `GET /portal/v1/dashboard/series` del
  gateway (ADR-0028), sin token. Los tipos se generan del contrato
  `apps/api-gateway/docs/portal-openapi.yaml` y van commiteados
  (`npm run generate:api`; `npm test` falla si se quedan atrás).
- **«En vivo» por sondeo** (`src/datos/sondeo.ts`, RF-3): el snapshot cada
  10 s y las series cada 60 s, un solo sondeo para toda la página. Se para con
  la pestaña oculta, retrocede con jitter ante 429, 5xx o error de red,
  respeta `Retry-After` y conserva el último dato diciendo «sin conexión».
- **Prerender** (RNF-4): el build pinta cada ruta a HTML
  (`scripts/prerender.mjs`) con su título y descripción, y falla si alguna
  sale vacía. El navegador hidrata ese HTML; el idioma y el tema guardados se
  aplican después de montar, para que la hidratación coincida.
- **Router propio** (`src/router.tsx`): siete rutas fijas, sin dependencia
  nueva. Los enlaces son `<a href>` de verdad.
- **Sistema de diseño, idioma, tema y decimales exactos** desde
  `@criterio/ui` (`packages/criterio-ui`).

## Ejecución

```bash
npm install                          # en la raíz del repo (workspace)
npm run dev                          # http://localhost:5174
npm test                             # tipos del contrato + suite con cobertura (≥80 % ramas)
npm run build                        # dist/ estático con el HTML de cada ruta
npm run preview                      # http://localhost:4174, sirve dist/
```

En desarrollo, `/portal/v1` va por el proxy de Vite a
`https://criterio-api-dev.higerotech.com`. `PORTAL_API_PROXY` lo cambia, por
ejemplo a un gateway local:

```bash
PORTAL_API_PROXY=http://localhost:8800 npm run dev
```

En producción, `VITE_PORTAL_API` en el build da el origen del gateway, y ese
origen tiene que estar en `ALLOWED_ORIGINS` del gateway.

## Lo que falta

- **Despliegue** en Cloudflare Workers (plan 0.1 y 1.4) y el dominio (D12).
- El resto de páginas: Dashboard (3.1, 3.2), APIs (3.4), Precios (3.5),
  Estado (fase 7), Intradía e Histórico (fase 5).
