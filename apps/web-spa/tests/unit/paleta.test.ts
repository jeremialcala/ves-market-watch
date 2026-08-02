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

import { PASOS_CALOR, PASOS_CALOR_ALTO } from "../../src/lib/series";

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

/*
 * La rampa teal NO pasó por el validador del skill (no está instalado en esta
 * máquina). Se derivó igualando **escalón por escalón** el contraste de la
 * rampa coral que sí validó —de ahí que los ratios coincidan con los suyos— y
 * se midió aparte lo que el cambio ponía en riesgo:
 *
 *   contraste sobre su superficie   oscuro 2,51 3,49 4,83 6,47 8,61
 *                                   claro  2,29 3,30 4,97 7,59 11,57
 *   ΔE2000 mínimo entre escalones   oscuro 7,32 · claro 8,56   (protan/deutan)
 *   ΔE2000 del salto teal→coral     protan 14,0 · deutan 26,7  (el peor caso)
 *
 * Ese último número es el que sostiene el diseño: el coral es una CATEGORÍA
 * («por encima del p90»), y solo vale si sobrevive al daltonismo — 14,0 contra
 * los ~7 que separan escalones dentro de la rampa. Aun así el exceso se dice
 * también en el tooltip, porque una categoría no debe vivir solo en el tono.
 */
describe("rampa secuencial del mapa de calor", () => {
  const rampa = (bloque: string) =>
    Array.from({ length: PASOS_CALOR }, (_, i) => token(bloque, `--calor-${i + 1}`));
  const exceso = (bloque: string) =>
    Array.from({ length: PASOS_CALOR_ALTO }, (_, i) =>
      token(bloque, `--calor-alto-${i + 1}`),
    );

  it("tema claro conserva la rampa validada", () => {
    expect(rampa(CLARO)).toEqual([
      "#30bfad",
      "#279e8e",
      "#1f7d70",
      "#175e54",
      "#104039",
    ]);
  });

  it("tema oscuro conserva la rampa validada", () => {
    expect(rampa(OSCURO)).toEqual([
      "#1e796d",
      "#259385",
      "#2caf9d",
      "#33cbb6",
      "#88e1d6",
    ]);
  });

  it("el exceso reutiliza el coral ya validado, sin retocarlo", () => {
    // Son los dos escalones más marcados de la rampa coral anterior tal cual:
    // el tono cambia de sitio (de rampa a categoría), los valores no.
    expect(exceso(OSCURO)).toEqual(["#fe9b96", "#fec3bf"]);
    expect(exceso(CLARO)).toEqual(["#972e30", "#760715"]);
  });

  it("tiene un paso por escalón declarado en el código", () => {
    for (const bloque of [CLARO, OSCURO]) {
      expect(rampa(bloque).filter(Boolean)).toHaveLength(PASOS_CALOR);
      expect(exceso(bloque).filter(Boolean)).toHaveLength(PASOS_CALOR_ALTO);
    }
  });

  it("el exceso NO es la continuación de la rampa: cambia de tono", () => {
    /*
     * La guarda del diseño. Si alguien «arregla» el coral acercándolo al teal
     * —o al revés— el mapa pasa a leerse como un degradado continuo y el p90
     * deja de ser un umbral visible, que es justo lo que codifica.
     */
    for (const bloque of [CLARO, OSCURO]) {
      const separacion = distanciaTono(
        tono(rampa(bloque)[PASOS_CALOR - 1]),
        tono(exceso(bloque)[0]),
      );
      expect(separacion).toBeGreaterThan(60);
    }
  });
});

/** Separación circular entre dos tonos, en grados (0–180). */
function distanciaTono(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Tono HSL en grados. */
function tono(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) {
    return 0;
  }
  const d = max - min;
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
