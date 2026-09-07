/**
 * La parte del precio que explica la pierna oficial se CALCULA.
 *
 * El enunciado del bloque traía un «88 %» fijo. El día que se implementó eran
 * 85,1 y la cifra se mueve con el mercado: cablearla habría dejado la frase
 * diciendo algo falso sin que ninguna prueba se enterara.
 */

import { describe, expect, it } from "vitest";

import { parteDelPrecio } from "../../src/lib/pierna";

describe("parteDelPrecio", () => {
  it("deriva la parte de la brecha vigente", () => {
    // Brecha 17,47 % -> la oficial es el 85,1 % del precio P2P. Es el dato real
    // del 2026-09-06, y el que desmintió el 88 % del enunciado.
    expect(parteDelPrecio("17.47")).toBe(85.1);
    expect(parteDelPrecio("0")).toBe(100);
    expect(parteDelPrecio("100")).toBe(50);
  });

  it("sin brecha no inventa la cifra", () => {
    expect(parteDelPrecio(null)).toBeNull();
  });

  it("una brecha imposible no produce un porcentaje imposible", () => {
    // -100 % anula el divisor; por debajo, la parte saldría negativa.
    expect(parteDelPrecio("-100")).toBeNull();
    expect(parteDelPrecio("-150")).toBeNull();
  });
});
