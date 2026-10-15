/** Idiomas de la interfaz. Vive aparte del diccionario para que `lib/decimal`
 * pueda tipar su locale sin arrastrar las cadenas. */
export type Idioma = "es" | "en";

export const IDIOMAS: readonly Idioma[] = ["es", "en"];

export function esIdioma(valor: unknown): valor is Idioma {
  return valor === "es" || valor === "en";
}
