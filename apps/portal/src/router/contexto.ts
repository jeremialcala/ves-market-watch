/** Contexto y hooks del router, aparte de sus componentes (Fast Refresh). */

import { createContext, useContext, type MouseEvent } from "react";

export interface ContextoRuta {
  ruta: string;
  navegar: (destino: string) => void;
}

export const RutaContext = createContext<ContextoRuta | null>(null);

/** `/precios/` y `/precios` son la misma página. */
export function normalizar(ruta: string): string {
  const sinBarra = ruta.replace(/\/+$/, "");
  return sinBarra === "" ? "/" : sinBarra;
}

export function useRuta(): ContextoRuta {
  const contexto = useContext(RutaContext);
  if (contexto === null) {
    throw new Error("useRuta fuera de <RouterProvider>");
  }
  return contexto;
}

/**
 * El clic de un enlace interno: navega sin recargar, salvo que el usuario pida
 * otra cosa (Ctrl/Cmd-clic, clic central, Shift…): ahí, el navegador.
 */
export function useClicInterno(to: string) {
  const { navegar } = useRuta();
  return (evento: MouseEvent<HTMLElement>) => {
    if (
      evento.defaultPrevented ||
      evento.button !== 0 ||
      evento.metaKey ||
      evento.ctrlKey ||
      evento.shiftKey ||
      evento.altKey
    ) {
      return;
    }
    evento.preventDefault();
    navegar(to);
  };
}
