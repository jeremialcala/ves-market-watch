/** `useI18n` del paquete, fijado a las claves del portal: una clave mal escrita
 * no compila. */

import { useI18n as useI18nUi, type ContextoI18n, type Traducir } from "@criterio/ui";

import type { Clave } from "./dict";

export function useI18n(): ContextoI18n<Clave> {
  return useI18nUi<Clave>();
}

export function useT(): Traducir<Clave> {
  return useI18n().t;
}
