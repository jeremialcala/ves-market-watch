// No es un módulo de la app sino del build: Fast Refresh no lo carga nunca.
// oxlint-disable react/only-export-components

/**
 * Entrada del prerender (RNF-4): pinta cada ruta a HTML en el build, sin datos
 * en vivo. Los paneles salen en «cargando» y el cliente los llena al hidratar.
 */

import { StrictMode } from "react";
import { renderToString } from "react-dom/server";

import { App } from "./App";
import { DICCIONARIOS } from "./i18n/dict";
import { RUTAS } from "./rutas";

export { RUTAS };

export function pintar(ruta: string): string {
  return renderToString(
    <StrictMode>
      <App rutaInicial={ruta} />
    </StrictMode>,
  );
}

/** Título y descripción de cada ruta, en español (el idioma del prerender). */
export function metadatos(ruta: string): { titulo: string; descripcion: string } {
  const es = DICCIONARIOS.es;
  const r = RUTAS.find((candidata) => candidata.ruta === ruta);
  if (r === undefined || r.ruta === "/") {
    return { titulo: "Criterio · datos del mercado VES", descripcion: es["hero.texto"] };
  }
  return { titulo: `${es[r.titulo]} · Criterio`, descripcion: es[r.descripcion] };
}
