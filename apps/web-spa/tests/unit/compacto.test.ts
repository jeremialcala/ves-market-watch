/**
 * El corte entre barra ancha y compacta vive en dos sitios que no pueden
 * compartir constante: `ANCHO_COMPACTO` (TS) y la media query de `index.css`.
 * Este test es el que impide que se separen.
 *
 * También fija que la tira de estado se esconda por CSS además de por estado de
 * React: el estado llega un tic tarde y la tira alcanzaba a pintarse un
 * fotograma en móvil, con su salto de layout.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ANCHO_COMPACTO } from "../../src/lib/useCompacto";

const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

/** Cuerpo de la primera media query `max-width: <ancho>px` del archivo. */
function bloqueMedia(ancho: number): string | null {
  const marca = `@media (max-width: ${ancho}px) {`;
  const i = CSS.indexOf(marca);
  if (i === -1) {
    return null;
  }
  // Recorre llaves hasta cerrar la media query (contiene reglas anidadas).
  let nivel = 0;
  for (let j = i + marca.length - 1; j < CSS.length; j++) {
    if (CSS[j] === "{") nivel++;
    else if (CSS[j] === "}") {
      nivel--;
      if (nivel === 0) return CSS.slice(i + marca.length, j);
    }
  }
  return null;
}

describe("corte compacto", () => {
  it("la media query del CSS usa el mismo ancho que el hook", () => {
    const cuerpo = bloqueMedia(ANCHO_COMPACTO - 1);
    expect(
      cuerpo,
      `no hay @media (max-width: ${ANCHO_COMPACTO - 1}px) en index.css`,
    ).not.toBeNull();
  });

  it("esconde la tira de estado por debajo del corte", () => {
    const cuerpo = bloqueMedia(ANCHO_COMPACTO - 1) ?? "";
    expect(cuerpo).toMatch(/\.vmw-tira\s*\{[^}]*display:\s*none/);
  });

  it("por encima del corte la tira no se esconde", () => {
    // La regla de 1079 solo repliega los secundarios, nunca la tira entera.
    const intermedio = bloqueMedia(1079) ?? "";
    expect(intermedio).toContain(".vmw-tira__secundario");
    expect(intermedio).not.toMatch(/\.vmw-tira\s*\{/);
  });
});
