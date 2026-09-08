/**
 * `render` con los proveedores de la app (idioma + tema).
 *
 * Todo componente que muestre texto pasa por `useI18n`, así que renderizarlo
 * pelado revienta. Por defecto se monta en español, que es el idioma canónico
 * del producto y el que fijan las aserciones; `idioma: "en"` sirve para
 * comprobar que la traducción existe de verdad.
 */

import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { I18nProvider } from "../src/i18n/I18nProvider";
import type { Idioma } from "../src/i18n/idioma";
import { ThemeProvider } from "../src/theme/ThemeProvider";

const CLAVE_IDIOMA = "vmw.idioma";

// Envoltorio de test, no un componente de la app: Fast Refresh no aplica.
// oxlint-disable-next-line react/only-export-components
function Proveedores({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>{children}</I18nProvider>
    </ThemeProvider>
  );
}

export function renderConProveedores(
  ui: ReactElement,
  { idioma = "es", ...opciones }: RenderOptions & { idioma?: Idioma } = {},
): RenderResult {
  // El proveedor lee el idioma inicial de localStorage: se fija antes de montar.
  window.localStorage.setItem(CLAVE_IDIOMA, idioma);
  return render(ui, { wrapper: Proveedores, ...opciones });
}
