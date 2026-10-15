/**
 * Router mínimo del portal: siete rutas fijas, sin parámetros.
 *
 * Sin dependencia nueva a propósito: una librería de rutas es más superficie
 * de cadena de suministro (T8) para algo que cabe aquí. Los enlaces son `<a>`
 * de verdad, con su `href`, para que el sitio se rastree y se pueda abrir en
 * otra pestaña; el clic normal navega sin recargar.
 *
 * En el prerender no hay `window`: la ruta llega por prop (`rutaInicial`).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";

import { normalizar, RutaContext, useClicInterno } from "./router/contexto";


export function RouterProvider({
  rutaInicial,
  children,
}: {
  rutaInicial: string;
  children: ReactNode;
}) {
  const [ruta, setRuta] = useState(() => normalizar(rutaInicial));

  useEffect(() => {
    const alVolver = () => setRuta(normalizar(window.location.pathname));
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, []);

  const navegar = useCallback((destino: string) => {
    const siguiente = normalizar(destino);
    if (siguiente !== normalizar(window.location.pathname)) {
      window.history.pushState(null, "", siguiente);
    }
    setRuta(siguiente);
    window.scrollTo(0, 0);
  }, []);

  const valor = useMemo(() => ({ ruta, navegar }), [ruta, navegar]);
  return <RutaContext.Provider value={valor}>{children}</RutaContext.Provider>;
}

type PropsEnlace = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };

export function Enlace({ to, onClick, children, ...resto }: PropsEnlace) {
  const interno = useClicInterno(to);
  const alClic = (evento: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(evento);
    interno(evento);
  };
  return (
    <a href={to} onClick={alClic} {...resto}>
      {children}
    </a>
  );
}
