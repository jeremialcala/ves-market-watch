/**
 * Lógica del tooltip: qué punto, qué contexto y dónde cabe.
 */

import { describe, expect, it } from "vitest";

import {
  anclajeTooltip,
  contextoPunto,
  fraccionDe,
  MARGEN_VOLTEO,
  puntoMasCercano,
  transformTooltip,
} from "../../src/lib/tooltipSerie";

const DIA = 86_400_000;
const serie = (...vs: string[]) => vs.map((valor, i) => ({ t: i * DIA, valor }));

describe("puntoMasCercano", () => {
  it("busca por TIEMPO, no por índice", () => {
    // Dias 0, 1 y 10: el del medio esta al 10 % del ancho, no al 50 %.
    const puntos = [
      { t: 0, valor: "1" },
      { t: DIA, valor: "2" },
      { t: 10 * DIA, valor: "3" },
    ];
    expect(puntoMasCercano(puntos, 0.1)).toBe(1);
    // A MITAD del ancho el objetivo es el dia 5: el dia 1 esta a 4 y el dia 10
    // a 5, asi que gana el 1. Por indice habria salido el 1 tambien, pero por
    // la razon equivocada — aqui manda la distancia temporal.
    expect(puntoMasCercano(puntos, 0.5)).toBe(1);
    // Al 90 % el objetivo es el dia 9 y ya gana el ultimo.
    expect(puntoMasCercano(puntos, 0.9)).toBe(2);
    expect(puntoMasCercano(puntos, 0)).toBe(0);
    expect(puntoMasCercano(puntos, 1)).toBe(2);
  });

  it("sin puntos no señala nada", () => {
    expect(puntoMasCercano([], 0.5)).toBeNull();
  });

  it("una ventana sin lapso señala el único punto", () => {
    expect(puntoMasCercano([{ t: 5, valor: "1" }], 0.7)).toBe(0);
  });
});

describe("fraccionDe", () => {
  it("devuelve la posición temporal del punto", () => {
    const puntos = [
      { t: 0, valor: "1" },
      { t: DIA, valor: "2" },
      { t: 10 * DIA, valor: "3" },
    ];
    expect(fraccionDe(puntos, 0)).toBe(0);
    expect(fraccionDe(puntos, 1)).toBeCloseTo(0.1, 5);
    expect(fraccionDe(puntos, 2)).toBe(1);
  });
});

describe("contextoPunto", () => {
  it("da el percentil y la distancia con signo", () => {
    const puntos = serie("10", "12", "14", "16", "18");
    expect(contextoPunto(puntos, 4, "14")).toEqual({
      percentil: 90,
      distancia: "4",
    });
    expect(contextoPunto(puntos, 0, "14")).toEqual({
      percentil: 10,
      distancia: "-4",
    });
  });

  it("una serie plana da 50, no 0", () => {
    // Contar solo los estrictamente menores diria «minimo de la ventana» sobre
    // algo que no se ha movido.
    expect(contextoPunto(serie("7", "7", "7"), 1, "7")).toEqual({
      percentil: 50,
      distancia: "0",
    });
  });

  it("la distancia es exacta, sin coma flotante", () => {
    expect(contextoPunto(serie("1.10", "1.35"), 1, "1.10").distancia).toBe("0.25");
  });
});

describe("anclaje", () => {
  it("se voltea cerca de los bordes y se centra en medio", () => {
    expect(anclajeTooltip(10, 1000)).toBe("izquierda");
    expect(anclajeTooltip(990, 1000)).toBe("derecha");
    expect(anclajeTooltip(500, 1000)).toBe("centro");
  });

  it("el umbral son 140 px", () => {
    expect(MARGEN_VOLTEO).toBe(140);
    expect(anclajeTooltip(139, 1000)).toBe("izquierda");
    expect(anclajeTooltip(141, 1000)).toBe("centro");
  });

  it("el transform deja 8 px sobre el punto en los tres casos", () => {
    for (const a of ["centro", "izquierda", "derecha"] as const) {
      expect(transformTooltip(a)).toContain("calc(-100% - 8px)");
    }
    expect(transformTooltip("centro")).toContain("translate(-50%");
    expect(transformTooltip("izquierda")).toContain("translate(0");
    expect(transformTooltip("derecha")).toContain("translate(-100%");
  });
});
