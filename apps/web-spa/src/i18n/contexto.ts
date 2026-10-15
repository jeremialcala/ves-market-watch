/**
 * Hooks del idioma, tipados con las claves del diccionario del `web-spa`.
 *
 * El mecanismo vive en `@criterio/ui` (ADR-0031) y es genérico; aquí se fija
 * a `Clave` para que una clave mal escrita no compile.
 */

import {
  useI18n as useI18nUi,
  type ContextoI18n as ContextoI18nUi,
  type Traducir as TraducirUi,
} from "@criterio/ui";

import type { Clave } from "./dict";

export { I18nContext } from "@criterio/ui";

export type Traducir = TraducirUi<Clave>;
export type ContextoI18n = ContextoI18nUi<Clave>;

export function useI18n(): ContextoI18n {
  return useI18nUi<Clave>();
}

/** Atajo para el caso común: solo la función de traducción. */
export function useT(): Traducir {
  return useI18n().t;
}
