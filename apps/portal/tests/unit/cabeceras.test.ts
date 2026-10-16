import { describe, expect, it } from "vitest";

import { cabeceras, origenApi, politica } from "../../src/cabeceras";
import { metadatos, pintar, RUTA_404 } from "../../src/entry-server";

const API = "https://criterio-api-dev.higerotech.com";

/** Las directivas de la CSP como mapa, para no depender del orden. */
function directivas(csp: string): Map<string, string> {
  return new Map(
    csp.split(";").map((d) => {
      const [nombre, ...valores] = d.trim().split(/\s+/);
      return [nombre, valores.join(" ")];
    }),
  );
}

describe("origen de la API", () => {
  it("acepta un origen https y devuelve su forma canónica", () => {
    expect(origenApi(API)).toBe(API);
    expect(origenApi("https://API.example.com")).toBe("https://api.example.com");
  });

  it("sin VITE_PORTAL_API, el portal habla con su propio origen", () => {
    expect(origenApi(undefined)).toBeNull();
    expect(origenApi("")).toBeNull();
  });

  it.each([
    "http://criterio-api-dev.higerotech.com",
    `${API}/`,
    `${API}/portal/v1`,
    `${API}?x=1`,
    "no es una url",
  ])("rechaza %s: la CSP saldría distinta de lo que pide el bundle", (api) => {
    expect(() => origenApi(api)).toThrow();
  });
});

describe("CSP", () => {
  it("connect-src lleva exactamente el origen del bundle, en https y en wss", () => {
    expect(directivas(politica(API)).get("connect-src")).toBe(`'self' ${API} ${API.replace("https:", "wss:")}`);
    expect(directivas(politica(null)).get("connect-src")).toBe("'self'");
  });

  it("ningún script ni hoja de estilo en línea; solo atributos style", () => {
    const d = directivas(politica(API));
    expect(d.get("script-src")).toBe("'self'");
    expect(d.get("style-src")).toBe("'self'");
    expect(d.get("style-src-attr")).toBe("'unsafe-inline'");
    for (const [nombre, valor] of d) {
      if (nombre !== "style-src-attr") {
        expect(valor, nombre).not.toContain("unsafe");
      }
    }
  });

  it("nadie mete el portal en un iframe", () => {
    expect(directivas(politica(API)).get("frame-ancestors")).toBe("'none'");
  });
});

describe("_headers", () => {
  const fichero = cabeceras(API);

  it("aplica las cabeceras de seguridad a todo", () => {
    const bloque = fichero.split("\n\n").find((b) => b.includes("\n/*\n") || b.startsWith("/*"));
    expect(bloque).toBeDefined();
    for (const cabecera of [
      "Content-Security-Policy:",
      "X-Content-Type-Options: nosniff",
      "Referrer-Policy: strict-origin-when-cross-origin",
      "Strict-Transport-Security:",
    ]) {
      expect(bloque).toContain(cabecera);
    }
  });

  it("solo lo de /assets es inmutable: el HTML se revalida", () => {
    expect(fichero).toMatch(/^\/assets\/\*\n {2}Cache-Control: public, max-age=31536000, immutable$/m);
    expect(fichero.match(/immutable/g)).toHaveLength(1);
  });

  it("cada línea cabe en el límite de Workers (2.000 caracteres)", () => {
    for (const linea of fichero.split("\n")) {
      expect(linea.length).toBeLessThan(2000);
    }
  });

  it("un origen mal escrito rompe el build, no la página", () => {
    expect(() => cabeceras(`${API}/`)).toThrow(/VITE_PORTAL_API/);
  });
});

describe("página 404", () => {
  it("la ruta del 404 no es ninguna de las del portal y pinta «no existe»", () => {
    const html = pintar(RUTA_404);
    expect(html).toContain("<main");
    expect(html).toContain("Esta página no existe");
  });

  it("lleva su propio título y descripción", () => {
    expect(metadatos(RUTA_404)).toEqual({
      titulo: "Esta página no existe · Criterio",
      descripcion: "El enlace está roto o la página se movió.",
    });
  });
});
