/**
 * Ritmo vertical de Histórico.
 *
 * Se comprueba **sobre la hoja** y no con `getComputedStyle`: jsdom no carga
 * `index.css`, así que ahí todo mediría cero y el test pasaría sobre cualquier
 * cosa. Mismo enfoque que el canario de `tema-tokens`.
 *
 * Lo que protege es un fallo que ya ocurrió: los 22 px del hueco serie→oficial
 * se escribieron en `.vmw-oficial` (especificidad 0,1,0) mientras la regla base
 * del contenedor —0,2,0— imponía 24. **No se aplicaron nunca**, y nada lo dijo.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

/** Cuerpo de la primera regla cuyo selector contenga `selector`. */
function bloque(selector: string): string {
  const i = CSS.indexOf(selector);
  expect(i, `no existe la regla ${selector}`).toBeGreaterThan(-1);
  const abre = CSS.indexOf("{", i);
  return CSS.slice(abre, CSS.indexOf("}", abre));
}

describe("ritmo de Histórico", () => {
  it("el contenedor da 1180 px y 24 px de aire lateral", () => {
    const c = bloque(".vmw-contenedor");
    expect(c).toContain("max-width: var(--maxw)");
    expect(c).toContain("padding: 0 var(--container-pad)");
    // Los dos tokens viven en la hoja de espaciado del sistema de diseno.
    const tokens = readFileSync(
      resolve(process.cwd(), "src/ds/tokens/spacing.css"),
      "utf8",
    );
    expect(tokens + CSS).toContain("--maxw: 1180px");
    expect(tokens + CSS).toContain("--container-pad: 24px");
  });

  it("la vista respira arriba y deja 96 px abajo", () => {
    expect(bloque(".vmw-vista {")).toContain(
      "padding: clamp(24px, 4vw, 44px) 0 96px",
    );
  });

  it("la separación base entre bloques son 24 px", () => {
    // Lectura → tarjeta de serie sale de aquí.
    expect(bloque(".vmw-vista > .vmw-contenedor > * + *")).toContain(
      "margin-top: 24px",
    );
  });

  it("serie → tasa oficial son 22 px, y con especificidad suficiente", () => {
    const selector = ".vmw-vista--historico > .vmw-contenedor > .vmw-oficial";
    expect(bloque(selector)).toContain("margin-top: 22px");
    // Tres clases contra las dos de la regla base: esta gana.
    expect(selector.match(/\./g)!.length).toBeGreaterThan(2);
    // Y ya NO queda un margin-top huérfano en la clase del bloque, que era el
    // que no se aplicaba.
    expect(bloque(".vmw-oficial {")).not.toContain("margin-top");
  });

  it("las dos secciones llevan 46 px: cambian de tema", () => {
    const b = bloque(
      ".vmw-vista--historico > .vmw-contenedor > .vmw-episodios,",
    );
    expect(b).toContain("margin-top: 46px");
    expect(CSS).toContain(
      ".vmw-vista--historico > .vmw-contenedor > .vmw-reglashist",
    );
  });

  it("las cabeceras de sección comparten fila, línea base y gap", () => {
    for (const sel of [".vmw-episodios__cabecera", ".vmw-reglashist__cabecera"]) {
      const b = bloque(sel);
      expect(b).toContain("display: flex");
      expect(b).toContain("align-items: baseline");
      expect(b).toContain("gap: 8px 14px");
    }
  });

  it("cada sección deja 18 px entre su cabecera y su contenido", () => {
    expect(bloque(".vmw-episodios {")).toContain("gap: 18px");
    expect(bloque(".vmw-reglashist {")).toContain("gap: 18px");
  });
});
