/** Derivaciones de las series del rediseño: extremos exactos, coordenadas de
 * la sparkline, parrilla día × hora en VET y anchos de barra. */

import { describe, expect, it } from "vitest";

import {
  areaPolilinea,
  colorCalor,
  extremos,
  parrillaCalor,
  porcentajeDeMaximo,
  puntosPolilinea,
  type Punto,
} from "../../src/lib/series";

const T0 = Date.parse("2026-07-30T04:00:00Z"); // 00:00 VET del 30/7

function punto(horasDesdeT0: number, valor: string): Punto {
  return { t: T0 + horasDesdeT0 * 3_600_000, valor };
}

describe("extremos", () => {
  it("compara como decimal exacto, no como texto ni float", () => {
    // "9" > "10" si se comparasen como strings; y 0.1+0.2 rompería en float.
    const rango = extremos([
      punto(0, "9.5"),
      punto(1, "10.25"),
      punto(2, "9.50000001"),
    ]);
    expect(rango).toEqual({ min: "9.5", max: "10.25" });
  });

  it("sin puntos no hay extremos", () => {
    expect(extremos([])).toBeNull();
  });
});

describe("puntosPolilinea", () => {
  it("normaliza al rango propio de la serie", () => {
    const puntos = [punto(0, "10"), punto(1, "20"), punto(2, "30")];
    const linea = puntosPolilinea(puntos, 100, 50, 5);
    const pares = linea.split(" ").map((p) => p.split(",").map(Number));
    expect(pares).toHaveLength(3);
    expect(pares[0][0]).toBe(0); // primer x pegado al origen
    expect(pares[2][0]).toBe(100); // último x al ancho total
    expect(pares[0][1]).toBeGreaterThan(pares[2][1]); // el mayor valor, más arriba
  });

  it("una serie plana no divide por cero", () => {
    const linea = puntosPolilinea([punto(0, "5"), punto(1, "5")], 100, 50, 5);
    expect(linea).not.toContain("NaN");
  });

  it("con un solo punto no divide por cero", () => {
    expect(puntosPolilinea([punto(0, "5")], 100, 50, 5)).not.toContain("NaN");
  });

  it("sin puntos devuelve vacío y el área también", () => {
    expect(puntosPolilinea([], 100, 50, 5)).toBe("");
    expect(areaPolilinea("", 100, 50)).toBe("");
  });

  it("el área cierra la línea contra la base", () => {
    const area = areaPolilinea("0,10 100,20", 100, 50);
    expect(area.startsWith("0,50")).toBe(true);
    expect(area.endsWith("100,50")).toBe(true);
  });
});

describe("parrillaCalor", () => {
  const ahora = new Date(Date.parse("2026-07-30T14:00:00Z"));

  it("agrupa por día operativo VET y rellena las 24 horas", () => {
    const filas = parrillaCalor([punto(3, "13.5")], 2, ahora);
    expect(filas).toHaveLength(2);
    expect(filas[1].dia).toBe("2026-07-30"); // el día más reciente va al final
    expect(filas[1].celdas).toHaveLength(24);
    expect(filas[1].celdas[3].valor).toBe("13.5");
  });

  it("las horas sin bucket quedan en null, no se interpolan", () => {
    const filas = parrillaCalor([punto(3, "13.5")], 1, ahora);
    expect(filas[0].celdas[4].valor).toBeNull();
  });

  it("usa el desplazamiento VET, no la zona del navegador", () => {
    // 03:00 UTC del 30 es todavía el 29 en Venezuela (UTC−4).
    const filas = parrillaCalor(
      [{ t: Date.parse("2026-07-30T03:00:00Z"), valor: "12" }],
      2,
      ahora,
    );
    expect(filas[0].dia).toBe("2026-07-29");
    expect(filas[0].celdas[23].valor).toBe("12");
  });
});

describe("colorCalor", () => {
  it("recorre salvia, teal y coral según el valor dentro del rango", () => {
    expect(colorCalor("12", 12, 20)).toContain("158 188 182"); // salvia
    expect(colorCalor("16", 12, 20)).toContain("138 214 204"); // teal
    expect(colorCalor("20", 12, 20)).toContain("249 113 113"); // coral
  });

  it("un rango degenerado no revienta", () => {
    expect(colorCalor("12", 12, 12)).toContain("rgb(");
  });
});

describe("porcentajeDeMaximo", () => {
  it("da el ancho relativo acotado a [0, 100]", () => {
    expect(porcentajeDeMaximo("50", "200")).toBe("25.0%");
    expect(porcentajeDeMaximo("400", "200")).toBe("100.0%");
    expect(porcentajeDeMaximo("-5", "200")).toBe("0.0%");
  });

  it("con máximo cero no hay porcentaje", () => {
    expect(porcentajeDeMaximo("50", "0")).toBe("0%");
  });
});
