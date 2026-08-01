/** Contexto y hook del tema, aparte del proveedor (regla de Fast Refresh). */

import { createContext, useContext } from "react";

export type Tema = "dark" | "light";

export interface ContextoTema {
  tema: Tema;
  alternar: () => void;
}

export const ThemeContext = createContext<ContextoTema | null>(null);

export function useTema(): ContextoTema {
  const contexto = useContext(ThemeContext);
  if (contexto === null) {
    throw new Error("useTema fuera de <ThemeProvider>");
  }
  return contexto;
}
