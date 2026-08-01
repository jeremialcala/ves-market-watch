# ADR-0018: Sistema de diseño Higerotech en el `web-spa`, i18n ES/EN y sello de bloque sin fuente

- **Estado:** accepted
- **Fecha:** 2026-07-31
- **Decisores:** Jeremi Alcalá
- **Fase AI-DLC:** 03-implementation
- **Versión:** Unreleased (se sincroniza al próximo corte)
- **Controles OWASP afectados:** A03 (XSS — sin CDN de terceros), A05 (validación
  y honestidad de la presentación)

## Contexto
El `web-spa` se implementó (ADR-0017) con estilos propios y una paleta pensada
solo para gráficos (skill dataviz). Higerotech tiene un sistema de diseño real
—tokens de color/tipografía/espaciado/efectos, tema claro, componentes y
fuentes autoalojadas— usado por su sitio público, y el dueño del producto
importó un **rediseño completo del dashboard** desde su proyecto de diseño
(`Rediseño dashboard Higerotech`, archivo `VES Market Watch.dc.html`).

El rediseño trae tres cosas que hay que decidir, no solo copiar:

1. **Marca.** El dashboard pasa a verse como Higerotech: fondo `--ink`, acentos
   teal/coral/salvia, Space Grotesk para cifras y titulares, Inter para el resto.
2. **Selector ES/EN.** La app era solo-español y el PRD no pedía inglés.
3. **Secciones que la plataforma no calcula.** Régimen de mercado, percentiles
   de backtest en los medidores, escenarios con probabilidades y riesgos: el
   gateway no expone nada de eso. Presentarlas como si fueran dato servido
   chocaría de frente con RF-5 («honestidad del dato»).

## Decisión
1. **El sistema de diseño se copia al repo, no se enlaza.** Los tokens viven en
   `src/ds/tokens/*.css` y los componentes portados a TSX en `src/ds/components/`.
   Las cuatro `woff2` (Inter y Space Grotesk, OFL 1.1) se **autoalojan**: la CSP
   del nginx es `default-src 'self'` y no se abre para ningún CDN — una fuente
   de terceros es superficie de A03 por un beneficio nulo.
2. **El tema es explícito, no `prefers-color-scheme`.** El sistema es oscuro por
   decisión de marca: ese es el valor inicial, y el usuario lo cambia con el
   control de la barra (`data-theme="light"` reasigna los MISMOS tokens, que es
   el mecanismo que define el propio sistema). La elección se recuerda en
   `localStorage` — es preferencia de UI; la regla de «nada en storage» de
   ADR-0017 es sobre **tokens**, que siguen solo en memoria.
3. **i18n real, no un control decorativo.** Diccionario ES/EN tipado
   (`src/i18n/dict.ts`): `EN` es `Record<Clave, string>` sobre las claves de
   `ES`, así que **olvidar una traducción no compila**. Lo que NO se traduce:
   los nombres canónicos de indicadores y señales (`p2p_brecha_pct_buy`,
   `arranque_alcista@v1`), que son vocabulario del contrato. Los decimales se
   siguen formateando desde el string exacto, ahora con los separadores del
   idioma (es-VE `1.234,56` · en-US `1,234.56`) y sin pasar por float.
4. **Todo bloque sin fuente lleva sello `demo · sin fuente`** (`DemoBadge`), con
   su explicación en la bajada de la sección. Se implementan porque el diseño
   los pide, pero se distinguen del dato real de un vistazo. Es la lectura de
   RF-5 aplicada al rediseño: el problema no es mostrar un ejemplo, es que un
   ejemplo se lea igual que un número servido por el gateway.
5. **Lo que sí se puede derivar, se deriva de verdad.** La sparkline de 24 h, el
   mapa de calor de 14 días × hora (VET) y las comparativas contra 7/30/90 días
   salen de `/indicators/history` (dos llamadas filtradas por indicador y
   moneda, una con bucket 1 h y otra con 1 d), no de números inventados. La
   descomposición reparte el precio P2P con la tasa oficial vigente y el VWAP.
6. **La evidencia de una señal se despliega en línea** (antes, modal): la
   trazabilidad de T10 —regla versionada, insumos exactos y evento disparador—
   no cambia; cambia que no saca al usuario de la cronología.
7. **La vista «Análisis» entra como cuarta pestaña** junto a Dashboard,
   Intradía e Histórico. Su prosa y sus escenarios son demo; sus números
   (presión de liquidez, merchants, spread) son reales.
8. **El shell no se encoge: se reparte** (enmienda 2026-07-31). La barra
   compacta no es la ancha estrujada — el diseño declara la tira de estado
   dentro de `isWide`, así que en compacto desaparece y su contenido va al punto
   de la barra y a la línea meta del menú. Lo único que no se repliega en ningún
   ancho es el estado del stream, que además es región viva con el estado en
   texto accesible: el color del punto no puede ser el único portador.

## Alternativas consideradas
- **Reestilizar sin adoptar el sistema**: más barato hoy, pero deja dos fuentes
  de verdad de marca y el rediseño importado dejaría de aplicar al primer cambio.
- **Omitir las secciones sin fuente**: lo más honesto por defecto, y fue la
  recomendación; el dueño del producto pidió implementarlas marcadas para poder
  evaluar el diseño completo y priorizar qué calcular después.
- **Toggle ES/EN decorativo**: descartado — un control que no hace nada miente
  al usuario.
- **Fuentes por CDN**: descartado por CSP y privacidad.

## Consecuencias
- (+) El dashboard es reconocible como producto Higerotech, en claro y oscuro,
  sin depender de red externa.
- (+) El diccionario tipado hace imposible una interfaz a medio traducir.
- (+) Los sellos convierten «lo que falta por calcular» en una lista visible:
  régimen de mercado, percentiles del ruleset y escenarios son, exactamente,
  el trabajo pendiente del `indicator-engine`.

  **Actualización 2026-08-01:** la lista se vació en dos entregas —los
  percentiles de los medidores con ADR-0019 y el régimen con ADR-0021— y quedan
  **dos** sellos: escenarios con probabilidades y riesgos redactados. Esos dos
  **no son trabajo pendiente del motor**, al contrario que los otros tres:
  hacerlos reales exigiría pronosticar, que el proyecto declaró no-objetivo. La
  lista dejó de ser una cola de tareas y pasó a marcar una frontera.
- (−) Deuda asumida: los bloques demo hay que retirarlos o respaldarlos con
  datos reales; mientras existan, cada cambio en ellos debe conservar el sello.
- (−) El bundle crece con las cuatro `woff2` (~175 kB, servidas con hash e
  inmutables) y el JS pasa de 500 kB — el code-splitting del histórico sigue
  pendiente (ya estaba anotado en el design del SPA).
- (−) `lib/decimal` gana un parámetro de idioma: cualquier formateo nuevo tiene
  que pasarlo, o el número saldrá con separadores españoles en inglés.
- (−) **Regresión de accesibilidad medida, no supuesta** — *saldada el
  2026-07-31*: mapear las series a los acentos de marca rompió la separación CVD
  en tema claro (ΔE 5,9 protan, bajo el piso de 6). La lección quedó: **los
  acentos de marca visten el cromo, las marcas de dato llevan slots propios**.
  Desde entonces el dato tiene sus tokens (`--series-*`, `--calor-*`) validados
  por tema, y un canario de test fija los valores medidos. Sigue abierto, como
  asunto de diseño, subir el par del tema oscuro a la banda de luminosidad y al
  piso de croma.

## Verificación
- **156 tests** vitest (100 → 156) con **88,6 % de ramas** (umbral Gate 2: 80 %):
  diccionario completo y con los mismos marcadores en ambos idiomas,
  componentes del sistema por variante/tono, shell ancho y compacto, sellos de
  demo, derivaciones de series (extremos exactos, parrilla VET, colores) y los
  paneles reales con sus vacíos honestos.
- Revisión visual del rediseño completo (dashboard, análisis, claro y oscuro)
  con un andamio temporal de datos sembrados, retirado al terminar. ~~El e2e con
  login real sigue bloqueado por el `client_id` del tenant (F1 de ADR-0017).~~
  **Desbloqueado el 2026-08-01 (ADR-0020)**: el `client_id` llevaba aprovisionado
  desde el 2026-07-27 —esta línea heredó una afirmación desfasada— y el login
  quedó operativo al arreglar la CSP y adoptar el dominio propio.
- **Paleta pasada por el validador del skill dataviz** (no a ojo) en las dos
  superficies: oscuro `#2D3134` y claro `#FFFFFF`. Resultado y defecto abierto
  en la tabla del `design.md` del servicio.
