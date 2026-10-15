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
export { cabeceras } from "./cabeceras";

/**
 * Una ruta que no existe: su HTML es la página 404 (`dist/404.html`), que
 * Workers sirve con estado 404 a cualquier ruta desconocida (ADR-0035).
 */
export const RUTA_404 = "/404";

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
  if (r === undefined) {
    return { titulo: `${es["noEncontrada.titulo"]} · Criterio`, descripcion: es["noEncontrada.desc"] };
  }
  if (r.ruta === "/") {
    return { titulo: "Criterio · datos del mercado VES", descripcion: es["hero.texto"] };
  }
  return { titulo: `${es[r.titulo]} · Criterio`, descripcion: es[r.descripcion] };
}
