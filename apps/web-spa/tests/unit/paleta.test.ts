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
const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8").replaceAll("\r\n", "\n");

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
 * La rampa es el teal de marca a cinco alfas (8, 22, 40, 65 y 100 %). Medido
 * contra la superficie de la tarjeta:
 *
 *   contraste       oscuro 1,19 · 1,66 · 2,53 · 4,25 · 7,85
 *                   claro  1,11 · 1,35 · 1,77 · 2,68 · 5,15
 *   salto a salto   oscuro 1,39 → 1,85   (creciente y monótono)
 *
 * El primer escalón queda por debajo del 2:1 que el proyecto usa como piso para
 * una marca sobre su fondo. Aquí se acepta a propósito: **en un mapa lo que hay
 * que distinguir es una celda de su VECINA**, no del fondo, y esos saltos sí
 * separan. Lo que NO se distinguía era el hueco sin dato —1,06:1 contra la celda
 * más floja—, y por eso lleva filete: una pista de forma, que no compite por
 * ese tramo de luminosidad.
 *
 * El coral es aparte: es la CATEGORÍA «por encima del p90», con ΔE 14,0 bajo
 * protanopia contra el extremo de la rampa. Aun así el exceso se dice también en
 * el tooltip, porque una categoría no debe vivir solo en el tono.
 */
describe("rampa secuencial del mapa de calor", () => {
  const rampa = (bloque: string) =>
    Array.from({ length: PASOS_CALOR }, (_, i) => token(bloque, `--calor-${i + 1}`));
  const exceso = (bloque: string) =>
    Array.from({ length: PASOS_CALOR_ALTO }, (_, i) =>
      token(bloque, `--calor-alto-${i + 1}`),
    );

  it("tema oscuro: el teal de marca a cinco alfas", () => {
    expect(rampa(OSCURO)).toEqual([
      "rgb(138 214 204 / 8%)",
      "rgb(138 214 204 / 22%)",
      "rgb(138 214 204 / 40%)",
      "rgb(138 214 204 / 65%)",
      "rgb(138 214 204 / 100%)",
    ]);
  });

  it("tema claro: las MISMAS alfas sobre su teal", () => {
    expect(rampa(CLARO)).toEqual([
      "rgb(31 122 112 / 8%)",
      "rgb(31 122 112 / 22%)",
      "rgb(31 122 112 / 40%)",
      "rgb(31 122 112 / 65%)",
      "rgb(31 122 112 / 100%)",
    ]);
  });

  it("el hueco sin dato NO se distingue por color, y por eso lleva filete", () => {
    /*
     * Medido: el blanco al 4 % queda a 1,13:1 del fondo de la tarjeta y a 1,06:1
     * de la celda más floja de la rampa — o sea, indistinguible de ambas. La
     * ausencia se marca además con FORMA (un filete interior), que no compite
     * por ese tramo estrechísimo de luminosidad.
     */
    for (const bloque of [OSCURO, CLARO]) {
      expect(token(bloque, "--calor-hueco")).not.toBe("");
      expect(token(bloque, "--calor-hueco-filete")).not.toBe("");
    }
    expect(CSS).toMatch(/\.vmw-calor__celda\[data-vacia="si"\]\s*\{[^}]*box-shadow/);
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

/** Tono HSL en grados. Acepta `#rrggbb` y `rgb(r g b / a%)`: la rampa se declara
 *  con alfa y el coral en hexadecimal, y aquí se comparan entre sí. */
function tono(color: string): number {
  const canales = color.startsWith("#")
    ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    : (color.match(/\d+/g) ?? []).slice(0, 3).map((n) => Number(n) / 255);
  const [r, g, b] = canales;
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
