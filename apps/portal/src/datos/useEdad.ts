/** «hace N s» para un instante del snapshot, que avanza con el reloj. */

import { useI18n } from "../i18n/contexto";
import { edad } from "../lib/lectura";
import { useAhora } from "./contexto";

export function useEdad(asOf: string | null | undefined): string | null {
  const { t } = useI18n();
  const ahora = useAhora();
  if (!asOf || ahora === null) {
    return null;
  }
  const { clave, n } = edad(asOf, ahora);
  return t(clave, { n });
}
