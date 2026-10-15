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

export interface PropsThemeProvider {
  children: ReactNode;
  /**
   * Para páginas prerenderizadas que se hidratan: el primer render usa el tema
   * de marca, igual que el HTML del build, y la preferencia guardada se aplica
   * después de montar. Sin esto, el cliente pintaría otra cosa que el servidor
   * y React descartaría el HTML.
   */
  hidratar?: boolean;
}

export function ThemeProvider({ children, hidratar = false }: PropsThemeProvider) {
  const [tema, setTema] = useState<Tema>(() => (hidratar ? "dark" : temaInicial()));

  useEffect(() => {
    if (hidratar) {
      setTema(temaInicial());
    }
  }, [hidratar]);

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
