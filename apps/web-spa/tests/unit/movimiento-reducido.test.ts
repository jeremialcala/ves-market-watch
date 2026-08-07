/**
 * El pulso del indicador de frescura tiene que pararse con
 * `prefers-reduced-motion: reduce`.
 *
 * Es la única animación en bucle de la aplicación, y una animación infinita es
 * justo la clase que ese ajuste existe para desactivar. No se puede comprobar en
 * el navegador desde la propia página —la media query depende del sistema, no
 * del documento—, así que se fija aquí sobre el CSS.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8").replaceAll("\r\n", "\n");

/**
 * Cuerpo de TODAS las media queries de movimiento reducido, concatenado.
 *
 * En plural desde que hay dos: la primera versión miraba solo la primera y, al
 * añadir la de la tarjeta de métrica, dio por descubierta la excepción del punto
 * de frescura que estaba en la segunda. Un ayudante que mira «el primero» falla
 * en silencio en cuanto aparece un segundo.
 */
function bloqueMovimientoReducido(): string {
  const marca = "@media (prefers-reduced-motion: reduce) {";
  const bloques: string[] = [];
  let desde = 0;
  for (;;) {
    const i = CSS.indexOf(marca, desde);
    if (i === -1) {
      break;
    }
    let nivel = 0;
    let fin = -1;
    for (let j = i + marca.length - 1; j < CSS.length; j++) {
      if (CSS[j] === "{") nivel++;
      else if (CSS[j] === "}") {
        nivel--;
        if (nivel === 0) {
          fin = j + 1;
          break;
        }
      }
    }
    if (fin === -1) {
      throw new Error("media query sin cerrar");
    }
    bloques.push(CSS.slice(i, fin));
    desde = fin;
  }
  expect(bloques.length).toBeGreaterThan(0);
  return bloques.join("\n");
}

describe("movimiento reducido", () => {
  it("el punto de frescura deja de latir", () => {
    const bloque = bloqueMovimientoReducido();
    expect(bloque).toContain(".vmw-frescura__punto");
    expect(bloque).toMatch(/\.vmw-frescura__punto\s*\{[^}]*animation:\s*none/);
  });

  it("toda animación en bucle del CSS está cubierta por la excepción", () => {
    /*
     * La guarda que importa: si mañana se añade otra animación infinita y nadie
     * la exceptúa, este test lo dice. Sin él, la regla de arriba solo protege a
     * la que existía el día que se escribió.
     */
    const enBucle = [...CSS.matchAll(/([\w-]+)\s+[\d.]+s[^;]*infinite/g)].map(
      (m) => m[1],
    );
    expect(enBucle.length).toBeGreaterThan(0);

    const bloque = bloqueMovimientoReducido();
    const selectoresConAnimacion = [
      ...CSS.matchAll(/(\.[\w-]+)\s*\{[^}]*animation:[^;]*infinite/g),
    ].map((m) => m[1]);
    for (const selector of selectoresConAnimacion) {
      expect(bloque, `${selector} anima en bucle sin excepción`).toContain(
        selector,
      );
    }
  });
});
