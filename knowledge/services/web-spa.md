---
type: Service
title: web-spa
description: Dashboard web (React + Vite + TS) autenticado vía Auth0 — implementado 2026-07-27 (ADR-0017); pendiente el client_id real del tenant y el e2e autenticado en vivo.
resource: ../../apps/web-spa/
tags: [typescript, react, implementado, front-end, spa]
timestamp: 2026-07-31T00:00:00Z
---

# web-spa

**Estado: implementado (2026-07-27, ADR-0017)** — primera app consumidora de la
plataforma (enmienda HITL del charter: antes «proyecto aparte»). React + Vite +
TypeScript, `@auth0/auth0-react`; consume EXCLUSIVAMENTE los contratos públicos
del [api-gateway](api-gateway.md) (`openapi.yaml` REST / `asyncapi.yaml` WSS).

- **Auth (T12 aplicado)**: Auth Code + PKCE contra Universal Login; tokens SOLO
  en memoria (`cacheLocation: memory`) + refresh rotation; renovación del token
  del WSS a `exp − 60 s`; CSP del nginx sin `unsafe-inline`.
- **Dashboard en vivo**: brecha (stat tile) + spread, referencia P2P por lado
  con confianza, tasa oficial multi-moneda con `stale`, microestructura,
  profundidad por bandas (small multiples), señales con evidencia (T10).
- **Stream**: `StreamClient` singleton (límite 5 conexiones/usuario) con
  backoff+jitter, watchdog de ping, política por cierre (4401/4403/1008) y
  **resync REST en cada (re)conexión** (push best-effort — ADR-0016).
- **Histórico**: tasa oficial e indicador canónico por bucket 5m/1h/1d
  (Recharts), rango ≤ 90 días, paginación con progreso/cancelación.
- **Intradía (2026-07-29)**: parrilla de small multiples con TODOS los
  indicadores del día operativo VET (UTC−4 fijo), agrupados en oficial /
  compra / venta / microestructura. Cada panel lleva último valor, sparkline
  con la apertura marcada y la **variación intradía** (Δ abs y %) contra la
  apertura — la métrica del glosario, derivada en cliente (`lib/intradia.ts`)
  con aritmética BigInt exacta, sin float y sin tocar el motor. Se pide una
  pasada por moneda SIN filtro de indicador (correcto solo porque la ventana
  es de un día); refresco manual y automático cada 5 min.
- **Decimales**: string exacto de punta a punta (`lib/decimal.ts`, sin float);
  tipos del contrato GENERADOS de `openapi.yaml` y commiteados con check de
  frescura (`npm test`).

## Sistema de diseño (2026-07-31, ADR-0018)
- Viste el **sistema Higerotech**: tokens copiados al repo (`src/ds/`), fuentes
  Inter + Space Grotesk **autoalojadas** (la CSP no se abre a ningún CDN) y los
  componentes del sistema portados a TSX. Tema claro/oscuro explícito
  (`data-theme` reasigna los MISMOS tokens) e interfaz **ES/EN** con diccionario
  tipado — una traducción olvidada no compila.
- Cuarta vista **Análisis**; la evidencia de las señales se despliega en línea.
- Lo que el diseño pide y la plataforma no calcula (régimen, percentiles del
  ruleset, escenarios, riesgos) lleva sello **`demo · sin fuente`**: la lista de
  sellos es el trabajo pendiente del motor. Lo derivable sí se deriva de
  `/indicators/history` (sparkline 24 h, mapa de calor 14 d × hora VET,
  comparativas 7/30/90 d).

## Shell responsive (2026-07-31)
- La tira de estado vive solo en la barra ancha (así lo declara el diseño): en
  compacto su información se reparte entre el punto de la barra (estado +
  antigüedad) y la línea meta del menú. Entre 760 y 1080 px ceden suscripciones
  y cuota; el estado del stream no cede nunca.
- El estado del WSS es región viva (`role=status`, `aria-live=polite`) en las dos
  variantes y lleva el estado en texto accesible: el color del punto no codifica
  solo. Escalera medida en navegador de 1280 a 320 px, sin desbordes ni solapes.

## Paleta de datos (2026-07-31)
- Los acentos de marca visten el cromo; las marcas de dato tienen **slots
  propios validados**: claro `#10846e` ↔ `#cf4946` (ΔE 8,1 deutan), oscuro
  `#8ad6cc` ↔ `#f97171` (ΔE 13,2). El claro se movió 4,1 OKLab respecto de la
  marca — lo mínimo para cruzar el piso de 6 donde el rótulo ya no excusa.
- «Sin lado» es tinta neutra, no un tercer tono: es la ausencia de lado.
- El mapa de calor pasa a **rampa secuencial de un tono** por tema: la anterior
  no era monótona en luminosidad y en claro era invisible (1,67:1 sobre blanco).
- `tests/unit/paleta.test.ts` fija los valores medidos: cambiarlos rompe el test
  y obliga a volver a pasar el validador.

## Verificación
- **169 tests** (unit/component/contract con MSW y WS mock) — **88,9 % de ramas**
  (umbral Gate 2: 80 %). E2E en vivo (`npm run test:e2e:live`) con client M2M:
  token real → REST + WSS; skip elegante sin credenciales.
- La parrilla intradía se eyebalizó en claro y oscuro con una previsualización
  estática del CSS real (paso «render y míralo» del skill dataviz); la vista
  autenticada en vivo queda pendiente del HITL de Auth0.
- Build nginx en el compose (puerto **8080**); CORS del gateway verificado en
  vivo (origen permitido con ACAO; ajeno sin ACAO).

## Referencias
- PRD: `../../docs/01-requirements/web-spa-dashboard.md` · ADR-0017 · ADR-0012 ·
  ADR-0016 · Amenazas T12/T15.

## Pendiente
- F1 de ADR-0017 (requiere `auth0 login`): app SPA del tenant → `client_id` a
  `src/config.ts`; client M2M de prueba; rotation + `allow_offline_access`.
- Checklist e2e con login real (DevTools sin tokens en storage, renovación
  15 min, push < 1 s).
- Multi-pestaña (BroadcastChannel) y code-splitting del Histórico (v2).
