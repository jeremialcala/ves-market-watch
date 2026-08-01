/**
 * Contexto y hooks del idioma. Viven aparte del proveedor para que el archivo
 * del componente exporte SOLO componentes (regla de Fast Refresh).
 */

import { createContext, useContext } from "react";

import type { Clave } from "./dict";
import type { Idioma } from "./idioma";

export type Traducir = (
  clave: Clave,
  params?: Record<string, string | number>,
) => string;

export interface ContextoI18n {
  idioma: Idioma;
  setIdioma: (idioma: Idioma) => void;
  t: Traducir;
}

export const I18nContext = createContext<ContextoI18n | null>(null);

export function useI18n(): ContextoI18n {
  const contexto = useContext(I18nContext);
  if (contexto === null) {
    throw new Error("useI18n fuera de <I18nProvider>");
  }
  return contexto;
}

/** Atajo para el caso común: solo la función de traducción. */
export function useT(): Traducir {
  return useI18n().t;
}
