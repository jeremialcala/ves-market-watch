/**
 * Las rutas del portal (plan 1.3). Todas se prerenderizan: las de contenido
 * fijo (Producto, Precios, APIs, la carcasa de Estado) para indexarse (RNF-4),
 * y el resto para que la primera pintura no sea una página en blanco.
 */

import type { Clave } from "./i18n/dict";

export interface Ruta {
  ruta: string;
  nav: Clave;
  titulo: Clave;
  descripcion: Clave;
}

export const RUTAS: readonly Ruta[] = [
  { ruta: "/", nav: "nav.producto", titulo: "hero.etiqueta", descripcion: "hero.texto" },
  { ruta: "/dashboard", nav: "nav.dashboard", titulo: "dashboard.titulo", descripcion: "dashboard.desc" },
  { ruta: "/intradia", nav: "nav.intradia", titulo: "intradia.titulo", descripcion: "intradia.desc" },
  { ruta: "/historico", nav: "nav.historico", titulo: "historico.titulo", descripcion: "historico.desc" },
  { ruta: "/apis", nav: "nav.apis", titulo: "apis.titulo", descripcion: "apis.desc" },
  { ruta: "/precios", nav: "nav.precios", titulo: "precios.titulo", descripcion: "precios.desc" },
  { ruta: "/estado", nav: "nav.estado", titulo: "estado.titulo", descripcion: "estado.desc" },
];

/** Tras estas, un separador en la barra: datos a la izquierda, oferta a la derecha. */
export const ULTIMA_DE_DATOS = "/historico";

export function buscarRuta(ruta: string): Ruta | null {
  return RUTAS.find((r) => r.ruta === ruta) ?? null;
}
