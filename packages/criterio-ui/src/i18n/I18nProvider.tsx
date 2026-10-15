/**
 * Idioma de la interfaz (ES por defecto, EN opcional).
 *
 * El diccionario lo trae cada app: el paquete solo pone el mecanismo.
 *
 * La preferencia se guarda en `localStorage` — es preferencia de UI, no un
 * secreto: la regla de «nada en storage» del ADR-0017 es sobre TOKENS, que
 * siguen viviendo solo en memoria del SDK de Auth0.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { I18nContext, type ContextoI18n } from "./contexto";
import { esIdioma, type Idioma } from "./idioma";
import { interpolar } from "./interpolar";

function idiomaInicial(claveStorage: string): Idioma {
  try {
    const guardado = window.localStorage.getItem(claveStorage);
    if (esIdioma(guardado)) {
      return guardado;
    }
  } catch {
    // storage bloqueado (modo privado / política del navegador): ES por defecto
  }
  return "es";
}

export interface PropsI18nProvider<C extends string> {
  children: ReactNode;
  diccionarios: Record<Idioma, Record<C, string>>;
  /** Dónde se recuerda la elección. */
  claveStorage?: string;
  /**
   * Para páginas prerenderizadas que se hidratan: el primer render es en
   * español, como el HTML del build, y el idioma guardado se aplica después de
   * montar (ver `ThemeProvider`).
   */
  hidratar?: boolean;
}

export function I18nProvider<C extends string>({
  children,
  diccionarios,
  claveStorage = "vmw.idioma",
  hidratar = false,
}: PropsI18nProvider<C>) {
  const [idioma, setIdiomaEstado] = useState<Idioma>(() =>
    hidratar ? "es" : idiomaInicial(claveStorage),
  );

  useEffect(() => {
    if (hidratar) {
      setIdiomaEstado(idiomaInicial(claveStorage));
    }
  }, [hidratar, claveStorage]);

  useEffect(() => {
    document.documentElement.lang = idioma;
  }, [idioma]);

  const setIdioma = useCallback(
    (siguiente: Idioma) => {
      setIdiomaEstado(siguiente);
      try {
        window.localStorage.setItem(claveStorage, siguiente);
      } catch {
        // sin persistencia: el idioma vale para esta sesión
      }
    },
    [claveStorage],
  );

  const valor = useMemo<ContextoI18n<C>>(
    () => ({
      idioma,
      setIdioma,
      t: (clave, params) => interpolar(diccionarios[idioma][clave], params),
    }),
    [idioma, setIdioma, diccionarios],
  );

  return (
    <I18nContext.Provider value={valor as ContextoI18n}>{children}</I18nContext.Provider>
  );
}
