---
type: Service
title: web-spa
description: Dashboard web (React + Vite + TS) autenticado vía Auth0 — implementado 2026-07-27 (ADR-0017); login sin fricción y sesión persistente verificados en vivo 2026-08-01 (ADR-0020).
resource: ../../apps/web-spa/
tags: [typescript, react, implementado, front-end, spa]
timestamp: 2026-08-01T00:00:00Z
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
- Lo que el diseño pide y la plataforma no calcula lleva sello **`demo · sin
  fuente`**. Quedan **dos** (escenarios con probabilidades y riesgos redactados,
  ambos en Análisis) tras retirar los medidores (ADR-0019) y el régimen
  (ADR-0021); esos dos no son deuda, exigirían pronosticar. Lo derivable sí se
  deriva de `/indicators/history` (sparkline 24 h, mapa de calor 14 d × hora VET,
  comparativas 7/30/90 d).

## Panel de instrumentos con lectura real (2026-08-01, ADR-0019)
- **El sello demo se retira del panel.** Los seis medidores dibujan lo que el
  motor calcula por revisión (`analysis.updated` / `GET /analysis/current`, RF-6):
  pie con los percentiles reales de su ventana de 90 días, relleno en la posición
  publicada, **una marca por cada regla** que el medidor alimenta y la frase de
  banda que le corresponde.
- El SPA **no hace aritmética**: banda, posición, posición de umbral, distancia y
  `met` vienen calculados del contrato. La única conversión a `number` es la
  fracción → ancho CSS (`lib/escala.ts`).
- 67 claves nuevas × 2 idiomas en registro **didáctico**, no de mesa de
  operaciones: describen el presente, nunca el futuro; ninguna dice «percentil X»
  (una sola cadena, en el desplegable, enseña a leer la escala); «señal» se dice
  **aviso**. La síntesis del panel lleva siempre la aclaración de que no es una
  predicción.
- Estados degradados explícitos: sin análisis, medidor sin lectura en la
  revisión, sin valor vigente, escala en respaldo (`unscaled`, con el contador de
  muestras), confianza baja y tasa oficial rancia. Ninguno inventa una barra.

## Lectura del mercado con dato real (2026-08-01, ADR-0021)
- **Segundo sello demo retirado.** La tarjeta «Lectura de hoy» era maqueta
  entera, hasta la barra de confianza del 68 % escrita a mano. Ahora el titular
  es el régimen que publica el motor (`reading.regime`) y la prosa es **una frase
  por afirmación, en el orden que manda el motor**: el SPA no reordena ni decide
  qué contar.
- **Fuera la barra de confianza**: `confidence` es binario (`normal|low`) y una
  barra continua fingía una precisión que no existe. En su lugar, chips con el
  valor real — la maqueta además decía «Confianza media», que no existe en el
  contrato.
- Registro acotado y **verificado por test**: `lectura.test.tsx` comprueba contra
  el texto renderizado que no hay nada imperativo ni predictivo, y que la
  aclaración está presente. Lo que orienta va en condicional.
- Estados degradados: sin lectura, sin régimen resoluble, confianza baja
  (encabeza y desplaza al régimen), oficial rancia (sin atribución) y escala en
  respaldo (sin frase de banda).
- **Quedan dos sellos**, ambos en la vista de análisis: escenarios con
  probabilidades y riesgos redactados. Se quedan porque hacerlos reales exigiría
  pronosticar, que es no-objetivo declarado.

## Dashboard según el prototipo `Criterio` (2026-08-02)
- **La lectura del mercado pasa a titular**, a todo el ancho: la vista responde
  primero «qué pasa» y luego enseña con qué número. Los dos indicadores de un
  vistazo salen a `HeadlineStats`.
- **«Distancia al disparo»** (`RuleDistance`): qué le falta al aviso más cercano,
  condición a condición. La regla la elige el MOTOR (`summary.closest_rule`), no
  el panel — recalcularla creaba una segunda fuente de verdad que, con dos reglas
  empatadas, nombraba una distinta que la síntesis en la misma pantalla.
- **«Calidad y procedencia del dato»** (`DataProvenance`): reúne lo que cada panel
  usó para afirmar lo que afirma — escala de los medidores, muestras, confianza,
  frescura de la oficial y alcance real de la historia de cada lado.
- **El panel de instrumentos se ordena por cercanía al umbral**, con el mismo
  criterio normalizado que usa el motor. El orden dejó de ser una constante, así
  que los tests pasaron a seleccionar por nombre y no por índice.
- El sistema de diseño **no hubo que importarlo**: los 43 tokens del proyecto de
  diseño coinciden valor por valor con los que ADR-0018 ya portó.
- Quedan fuera «Crear alerta» y «Exportar CSV» (ADR-0021) y «Riesgos que vigilar»
  conserva su sello demo: la cuenta sigue en **dos**.

## Descomposición de la brecha con historia por lado (2026-08-01, ADR-0021)
- La tarjeta compara **compra y venta**, cada uno contra su propia historia, con
  las referencias del contrato (`gap_history`): el SPA dejó de calcular medias.
- **Rotula el tramo real**: «Promedio 12 d (de 30)» mientras la serie no alcance la
  ventana, y pasa sola a la etiqueta nominal cuando crece. Antes decía «Promedio 30
  días» sobre 12 días de historia.
- **La cifra que cita la prosa está a la vista**, con test propio: la tarjeta llegó
  a afirmar «7,70 puntos por debajo de su promedio de 90 días» mientras esa fila
  mostraba el máximo — la afirmación era incomprobable y restar el máximo daba otro
  número.
- Antes de todo esto, tres tarjetas llevaban días en blanco por una carrera de
  efectos de React; ver el log del 2026-08-01.
- **La sparkline de 24 h pinta LOS DOS lados** (2026-08-01): la de compra es la
  del titular y la cifra héroe; la de venta es la que tiene historia real y es,
  además, el lado donde el usuario compra dólares. Las dos comparten **escala Y**
  (`escalaComun`): sin eso cada polilínea se normaliza con sus propios extremos y
  una serie de 12,2 % podría dibujarse por encima de otra de 14,8 %. Se distinguen
  por **forma además de color** —continua contra discontinua—, y la leyenda repite
  esa forma.
- **El mapa de calor mira el lado VENTA** (2026-08-01): es el que tiene historia
  real (242 días derivados) frente a los ~12 del de compra, con el que las dos
  primeras filas del mapa salían vacías. El rótulo lo dice, porque con dos series
  en la app callarlo sería ambiguo. (La sparkline se resolvió distinto —pinta los
  dos lados— porque vive en una tarjeta cuyo titular y cifra son de compra, y
  cambiarla sola la habría contradicho.)
- De paso desapareció la petición diaria de 90 días: la consumía la descomposición
  antes de pasar a `gap_history`, y se disparaba **una vez por componente** que
  usara el hook —una paginación de 90 días cada una— sin que nadie la leyera.

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
- **291 tests** (unit/component/contract con MSW y WS mock) — **87,3 % de ramas**
  (umbral Gate 2: 80 %). `tests/component/medidores.test.tsx` fija el panel con
  lectura real en ambos idiomas y `tests/component/lectura.test.tsx` la tarjeta de
  régimen, ambas incluida la **ausencia del sello demo**; la segunda comprueba
  además, contra el texto renderizado, que **no aconseja ni predice**. E2E en vivo (`npm run test:e2e:live`) con client M2M:
  token real → REST + WSS; skip elegante sin credenciales.
- La parrilla intradía se eyebalizó en claro y oscuro con una previsualización
  estática del CSS real (paso «render y míralo» del skill dataviz). La vista
  autenticada en vivo **ya no está bloqueada**: el login quedó operativo el
  2026-08-01 (ADR-0020).
- Build nginx en el compose (puerto **8080**); CORS del gateway verificado en
  vivo (origen permitido con ACAO; ajeno sin ACAO).

## Referencias
- PRD: `../../docs/01-requirements/web-spa-dashboard.md` · ADR-0017 · ADR-0012 ·
  ADR-0016 · ADR-0018 (sistema de diseño e i18n) · ADR-0019 (medidores) ·
  ADR-0020 (login) · ADR-0021 (lectura del mercado) · Amenazas T12/T15.

## Pendiente
- Topología de despliegue real: los túneles de Cloudflare son de desarrollo
  (ADR-0020 lo deja abierto a propósito).
- Multi-pestaña (BroadcastChannel) y code-splitting del Histórico (v2).
