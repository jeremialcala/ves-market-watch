import type { Clave } from "../i18n/dict";

export type Vista = "dashboard" | "analisis" | "intradia" | "historico";

/** Orden de las pestañas en la barra (el del diseño, con Intradía —RF-7— entre
 * medias porque la vista ya existía cuando llegó el rediseño). */
export const VISTAS: ReadonlyArray<{ clave: Vista; etiqueta: Clave }> = [
  { clave: "dashboard", etiqueta: "nav.dashboard" },
  { clave: "analisis", etiqueta: "nav.analisis" },
  { clave: "intradia", etiqueta: "nav.intradia" },
  { clave: "historico", etiqueta: "nav.historico" },
];
