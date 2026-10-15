/**
 * `@criterio/ui`: lo que comparten el `web-spa` y el portal (ADR-0031).
 *
 * El sistema de diseño Higerotech (tokens y componentes), el mecanismo de
 * idioma y el tema claro/oscuro. **Nada de aquí pide datos**: los componentes
 * los reciben por props, y el paquete no importa de `api/`, `state/`, `ws/` ni
 * `auth/` de ninguna app (lo comprueba el lint).
 *
 * Los estilos van aparte: `import "@criterio/ui/styles.css"`.
 */

export * from "./ds/components";

export {
  compararDecimales,
  esDecimal,
  formatDecimal,
  formatPct,
  porcentajeRelativo,
  promediarDecimales,
  restarDecimales,
  signo,
  toChartNumber,
  type OpcionesFormato,
} from "./lib/decimal";

export { esIdioma, IDIOMAS, type Idioma } from "./i18n/idioma";
export { interpolar } from "./i18n/interpolar";
export { I18nContext, useI18n, type ContextoI18n, type Traducir } from "./i18n/contexto";
export { I18nProvider, type PropsI18nProvider } from "./i18n/I18nProvider";

export { ThemeContext, useTema, type ContextoTema, type Tema } from "./theme/contexto";
export { ThemeProvider, type PropsThemeProvider } from "./theme/ThemeProvider";
