/**
 * Canario del tema: ningún color de texto se cablea.
 *
 * El defecto que lo motiva es concreto y mío. Los prompts de esta rama decían
 * «blanco» y escribí `color: #fff` siete veces en vez de `var(--white)`, que es
 * el token que significa «máximo contraste» y vale `#15181b` en tema claro. En
 * claro quedaron **siete elementos de Intradía en blanco sobre fondo blanco** —el
 * veredicto de la sesión, cuatro títulos de sección, las cifras de las tarjetas y
 * los valores de la tabla—, con contraste 1:1. Ninguna prueba se enteró, porque
 * todas corrían en oscuro.
 *
 * Que un tema exista no lo prueba nadie mirando el otro: hace falta que el color
 * SALGA de un token, no de un literal.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8").replaceAll("\r\n", "\n");

/** Colores literales de texto: `color: #fff`, `color: white`, `color: #000`… */
const LITERALES =
  /color:\s*(#[0-9a-fA-F]{3,8}|white|black|rgb\(|rgba\()[^;]*;/g;

describe("tokens de tema", () => {
  it("ningún `color:` de la hoja usa un literal en vez de un token", () => {
    const encontrados = [...CSS.matchAll(LITERALES)]
      // `currentcolor` y las variables no son literales.
      .map((m) => m[0])
      .filter((decl) => !decl.includes("var("));

    expect(encontrados, encontrados.join(" | ")).toEqual([]);
  });

  it("`--white` se voltea con el tema, que es lo que lo hace un token", () => {
    /*
     * Si alguien lo iguala en los dos temas, `var(--white)` deja de proteger de
     * nada y el canario de arriba pasaría igual mientras la vista se rompe.
     */
    const oscuro = readFileSync(
      resolve(process.cwd(), "src/ds/tokens/colors.css"),
      "utf8",
    ).replaceAll("\r\n", "\n");
    const claro = readFileSync(
      resolve(process.cwd(), "src/ds/tokens/theme-light.css"),
      "utf8",
    ).replaceAll("\r\n", "\n");
    const valor = (css: string) => /--white:\s*([^;]+);/.exec(css)?.[1].trim();

    expect(valor(oscuro)).toBe("#ffffff");
    expect(valor(claro)).toBe("#15181b");
  });
});
