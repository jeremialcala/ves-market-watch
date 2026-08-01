/**
 * Idioma de la interfaz (ES por defecto, EN opcional).
 *
 * La preferencia se guarda en `localStorage` — es preferencia de UI, no un
 * secreto: la regla de «nada en storage» del ADR-0017 es sobre TOKENS, que
 * siguen viviendo solo en memoria del SDK de Auth0.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { I18nContext, type ContextoI18n } from "./contexto";
import { DICCIONARIOS, interpolar } from "./dict";
import { esIdioma, type Idioma } from "./idioma";

const CLAVE_STORAGE = "vmw.idioma";

function idiomaInicial(): Idioma {
  try {
    const guardado = window.localStorage.getItem(CLAVE_STORAGE);
    if (esIdioma(guardado)) {
      return guardado;
    }
  } catch {
    // storage bloqueado (modo privado / política del navegador): ES por defecto
  }
  return "es";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [idioma, setIdiomaEstado] = useState<Idioma>(idiomaInicial);

  useEffect(() => {
    document.documentElement.lang = idioma;
  }, [idioma]);

  const setIdioma = useCallback((siguiente: Idioma) => {
    setIdiomaEstado(siguiente);
    try {
      window.localStorage.setItem(CLAVE_STORAGE, siguiente);
    } catch {
      // sin persistencia: el idioma vale para esta sesión
    }
  }, []);

  const valor = useMemo<ContextoI18n>(
    () => ({
      idioma,
      setIdioma,
      t: (clave, params) => interpolar(DICCIONARIOS[idioma][clave], params),
    }),
    [idioma, setIdioma],
  );

  return <I18nContext.Provider value={valor}>{children}</I18nContext.Provider>;
}
