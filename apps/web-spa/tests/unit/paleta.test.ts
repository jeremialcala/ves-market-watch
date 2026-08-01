/**
 * Canario de la paleta de datos.
 *
 * El validador del skill dataviz vive fuera del repo, así que este test no
 * puede volver a medir; lo que hace es **fijar los valores medidos** para que
 * nadie los cambie en silencio. Fue exactamente ese silencio el que dejó la
 * app con ΔE 5,9 bajo protanopia en tema claro mientras los documentos seguían
 * diciendo «paleta validada»: el color se cambió y ninguna prueba se enteró.
 *
 * Si este test falla es porque tocaste un slot de dato. No lo ajustes a mano:
 *   node scripts/validate_palette.js "<compra>,<venta>" --mode light  --surface "#FFFFFF"
 *   node scripts/validate_palette.js "<compra>,<venta>" --mode dark   --surface "#2D3134"
 *   node scripts/validate_palette.js "<c1>,…,<c5>"      --mode <tema> --surface <sup> --ordinal
 * (script del skill dataviz) y actualiza aquí los números que devuelva.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { PASOS_CALOR } from "../../src/lib/series";

// `import.meta.url` no es file: bajo el runner de vitest: se resuelve desde la raíz.
const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

/** Valor de una custom property dentro de un bloque (`:root` o el tema claro). */
function token(bloque: string, nombre: string): string {
  const cuerpo = CSS.split(bloque)[1]?.split("}")[0] ?? "";
  return cuerpo.match(new RegExp(`${nombre}:\\s*([^;]+);`))?.[1].trim() ?? "";
}

const OSCURO = ":root {";
const CLARO = '[data-theme="light"] {';

describe("slots categóricos (compra ↔ venta)", () => {
  // Medido con el validador: claro ΔE 8,1 (deutan) · oscuro ΔE 13,2 (deutan).
  it("tema claro conserva el par validado", () => {
    expect(token(CLARO, "--series-buy")).toBe("#10846e");
    expect(token(CLARO, "--series-sell")).toBe("#cf4946");
  });

  it("tema oscuro conserva el par validado", () => {
    expect(token(OSCURO, "--series-buy")).toBe("#8ad6cc");
    expect(token(OSCURO, "--series-sell")).toBe("#f97171");
  });

  it("«sin lado» es tinta neutra, no un tercer tono categórico", () => {
    // Es la AUSENCIA de lado: un tercer hue competiría con compra/venta y el
    // salvia de marca ya leía gris (croma 0,046).
    expect(token(CLARO, "--series-aqua")).toBe("var(--text-muted)");
    expect(token(OSCURO, "--series-aqua")).toBe("var(--text-muted)");
  });
});

describe("rampa secuencial del mapa de calor", () => {
  const rampa = (bloque: string) =>
    Array.from({ length: PASOS_CALOR }, (_, i) => token(bloque, `--calor-${i + 1}`));

  it("tema claro conserva la rampa validada", () => {
    expect(rampa(CLARO)).toEqual([
      "#fe8b86",
      "#db6c69",
      "#b84d4c",
      "#972e30",
      "#760715",
    ]);
  });

  it("tema oscuro conserva la rampa validada", () => {
    expect(rampa(OSCURO)).toEqual([
      "#b54a49",
      "#d06260",
      "#ec7b77",
      "#fe9b96",
      "#fec3bf",
    ]);
  });

  it("tiene un paso por escalón declarado en el código", () => {
    for (const bloque of [CLARO, OSCURO]) {
      expect(rampa(bloque).filter(Boolean)).toHaveLength(PASOS_CALOR);
    }
  });
});
