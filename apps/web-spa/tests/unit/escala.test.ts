import { describe, expect, it } from "vitest";

import { pctDesdeFraccion } from "../../src/lib/escala";

describe("pctDesdeFraccion", () => {
  it("convierte la fracción del contrato a un ancho CSS", () => {
    expect(pctDesdeFraccion("0.2996")).toBe("29.96%");
    expect(pctDesdeFraccion("0")).toBe("0.00%");
    expect(pctDesdeFraccion("1")).toBe("100.00%");
  });

  it("acota fuera de rango en vez de desbordar la barra", () => {
    expect(pctDesdeFraccion("1.5")).toBe("100.00%");
    expect(pctDesdeFraccion("2")).toBe("100.00%");
  });

  it("rechaza lo que no es un decimal del contrato", () => {
    // Un NaN silencioso dejaría la barra con `width: NaN%`, que el navegador
    // ignora: la barra se vería llena sin que nada lo declare.
    expect(() => pctDesdeFraccion("no-es-un-numero")).toThrow(/decimal inválido/);
    expect(() => pctDesdeFraccion("")).toThrow(/decimal inválido/);
  });
});
