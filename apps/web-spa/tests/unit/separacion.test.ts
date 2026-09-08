/**
 * La separación entre bloques de una vista.
 *
 * jsdom no resuelve layout, así que esto NO mide píxeles: comprueba la REGLA en
 * la hoja de estilos. Lo que vigila es el defecto que la motivó — que la
 * separación dependiera de que dos bloques fueran ambos `.vmw-seccion`.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Sin comentarios: la regla vieja se NOMBRA en el comentario que explica por
 *  qué se retiró, y buscarla en crudo daba un falso positivo. */
const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8").replaceAll("\r\n", "\n").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

describe("separación entre bloques de una vista", () => {
  it("va por HIJO DIRECTO del contenedor, no por clase de sección", () => {
    /*
     * `.vmw-seccion + .vmw-seccion` solo aplicaba entre dos secciones
     * adyacentes: bastaba con que se colara un `.vmw-grid` entre medias para que
     * la cadena se rompiera y los bloques quedaran pegados. Medido en el
     * dashboard antes del cambio: 0 · 0 · 46 · 46 · 0 · 0 · 46.
     */
    expect(CSS).toMatch(/\.vmw-vista > \.vmw-contenedor > \* \+ \* \{\s*margin-top: 24px;/);
    expect(CSS).not.toMatch(/\.vmw-seccion \+ \.vmw-seccion/);
  });
});
