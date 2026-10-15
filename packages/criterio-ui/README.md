# @criterio/ui

Lo que comparten el `web-spa` y el portal público (ADR-0031): el **sistema de
diseño Higerotech** (tokens, fuentes autoalojadas y componentes portados a
TSX), el **idioma** (ES/EN, genérico sobre el diccionario de cada app) y el
**tema** claro/oscuro.

Sigue siendo una **copia** del Higerotech Design System, no un enlace a él
(ADR-0018, enmendada por ADR-0031): una sola copia en el repo en vez de una por
app.

## Uso

```ts
import "@criterio/ui/styles.css";
import { Button, I18nProvider, ThemeProvider, useI18n } from "@criterio/ui";
import isotipo from "@criterio/ui/assets/isotipo.svg";

<ThemeProvider>
  <I18nProvider diccionarios={{ es: ES, en: EN }}>…</I18nProvider>
</ThemeProvider>
```

Se consume **como fuente**: no tiene paso de build. Vite y TypeScript de cada
app lo compilan con el resto, y el Dockerfile de cada app copia el paquete.

## Reglas

- **Los componentes reciben datos, no los piden.** El paquete no importa de
  `api/`, `state/`, `ws/` ni `auth/` de ninguna app. Lo impone el lint
  (`no-restricted-imports` en `.oxlintrc.json`), no la revisión.
- **Un componente que se mueve aquí trae sus tests**, y la app que lo usaba
  pasa su suite importándolo del paquete en el mismo PR.
- Un cambio aquí despliega las apps que lo usan.

## Comandos

```sh
npm install          # en la raíz del repo (workspace)
npm run typecheck -w packages/criterio-ui
npm run lint -w packages/criterio-ui
npm test -w packages/criterio-ui    # con cobertura, umbral del 80 % de ramas
```
