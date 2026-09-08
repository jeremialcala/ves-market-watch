import type { Clave } from "../i18n/dict";

export type Vista = "dashboard" | "intradia" | "historico";

/**
 * Orden de las pestañas en la barra (el del diseño, con Intradía —RF-7— entre
 * medias porque la vista ya existía cuando llegó el rediseño).
 *
 * **Análisis se disolvió el 2026-09-07** y la barra baja a tres. No se retiró
 * su contenido: la presión de liquidez y los riesgos se mudaron al Dashboard,
 * donde ya tenían hermanos. Lo que se retiró fue la pestaña, que prometía un
 * «análisis comprensivo» y contenía un dato del libro y cuatro autodiagnósticos.
 */
export const VISTAS: ReadonlyArray<{ clave: Vista; etiqueta: Clave }> = [
  { clave: "dashboard", etiqueta: "nav.dashboard" },
  { clave: "intradia", etiqueta: "nav.intradia" },
  { clave: "historico", etiqueta: "nav.historico" },
];
