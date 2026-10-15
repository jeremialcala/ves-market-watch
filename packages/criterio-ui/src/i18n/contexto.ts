/**
 * Contexto y hooks del idioma. Viven aparte del proveedor para que el archivo
 * del componente exporte SOLO componentes (regla de Fast Refresh).
 *
 * Genéricos sobre las claves: cada app trae su diccionario y tipa `useI18n`
 * con sus propias claves (ADR-0031: el paquete no sabe de ninguna app).
 */

import { createContext, useContext } from "react";

import type { Idioma } from "./idioma";

export type Traducir<C extends string = string> = (
  clave: C,
  params?: Record<string, string | number>,
) => string;

export interface ContextoI18n<C extends string = string> {
  idioma: Idioma;
  setIdioma: (idioma: Idioma) => void;
  t: Traducir<C>;
}

export const I18nContext = createContext<ContextoI18n | null>(null);

export function useI18n<C extends string = string>(): ContextoI18n<C> {
  const contexto = useContext(I18nContext);
  if (contexto === null) {
    throw new Error("useI18n fuera de <I18nProvider>");
  }
  return contexto as ContextoI18n<C>;
}
