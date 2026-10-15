import { createContext, useContext, useEffect, useState } from "react";

import type { Series, Snapshot } from "../api/cliente";
import type { Instantanea } from "./sondeo";

export interface ContextoDatos {
  snapshot: Instantanea<Snapshot>;
  series: Instantanea<Series>;
}

const SIN_DATOS: ContextoDatos = {
  snapshot: { datos: null, estado: "cargando" },
  series: { datos: null, estado: "cargando" },
};

export const DatosContext = createContext<ContextoDatos>(SIN_DATOS);

/** Sin proveedor (el prerender) es «cargando»: el HTML del build no trae datos. */
export function useDatos(): ContextoDatos {
  return useContext(DatosContext);
}

/**
 * La hora, que avanza cada segundo, para las edades «hace N s». `null` hasta
 * montar: el prerender y el primer render del cliente no dependen del reloj, y
 * así coinciden al hidratar.
 */
export function useAhora(intervaloMs = 1000): number | null {
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    setAhora(Date.now());
    const id = setInterval(() => setAhora(Date.now()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);
  return ahora;
}
