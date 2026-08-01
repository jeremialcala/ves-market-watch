/**
 * Tema claro/oscuro del sistema Higerotech.
 *
 * El sistema es oscuro por decisión de marca, así que ese es el valor inicial
 * (no `prefers-color-scheme`); el usuario lo cambia con el control de la barra
 * y la elección se recuerda. El mecanismo es el que define el sistema de
 * diseño: `data-theme="light"` reasigna los MISMOS tokens.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { ThemeContext, type ContextoTema, type Tema } from "./contexto";

const CLAVE_STORAGE = "vmw.tema";

function temaInicial(): Tema {
  try {
    const guardado = window.localStorage.getItem(CLAVE_STORAGE);
    if (guardado === "light" || guardado === "dark") {
      return guardado;
    }
  } catch {
    // storage bloqueado: oscuro, el tema de marca
  }
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    document.documentElement.dataset.theme = tema;
  }, [tema]);

  const alternar = useCallback(() => {
    setTema((actual) => {
      const siguiente = actual === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(CLAVE_STORAGE, siguiente);
      } catch {
        // sin persistencia: vale para esta sesión
      }
      return siguiente;
    });
  }, []);

  const valor = useMemo<ContextoTema>(() => ({ tema, alternar }), [tema, alternar]);
  return <ThemeContext.Provider value={valor}>{children}</ThemeContext.Provider>;
}
