/**
 * Idioma de la interfaz con el diccionario del `web-spa`. El mecanismo
 * (preferencia recordada, `lang` del documento) vive en `@criterio/ui`.
 */

import { I18nProvider as I18nProviderUi } from "@criterio/ui";
import type { ReactNode } from "react";

import { DICCIONARIOS } from "./dict";

export function I18nProvider({ children }: { children: ReactNode }) {
  return <I18nProviderUi diccionarios={DICCIONARIOS}>{children}</I18nProviderUi>;
}
