import { describe, expect, it } from "vitest";

import {
  compararDecimales,
  esDecimal,
  formatDecimal,
  formatPct,
  porcentajeRelativo,
  restarDecimales,
  signo,
  toChartNumber,
} from "../../src/lib/decimal";

describe("esDecimal", () => {
  it("acepta el patrón del contrato", () => {
    for (const v of ["0", "417.03", "-2.15", "1234567.89012345", "-0.5"]) {
      expect(esDecimal(v)).toBe(true);
    }
  });
  it("rechaza lo que el contrato no permite", () => {
    for (const v of ["", "1.", ".5", "1e3", "+1", "NaN", "1,5", " 1", "1 "]) {
      expect(esDecimal(v)).toBe(false);
    }
  });
});

describe("compararDecimales", () => {
  it("compara magnitudes sin float", () => {
    expect(compararDecimales("2", "10")).toBe(-1);
    expect(compararDecimales("10", "2")).toBe(1);
    expect(compararDecimales("417.03", "417.030000")).toBe(0);
    expect(compararDecimales("417.0300001", "417.03")).toBe(1);
  });
  it("maneja signos y ceros", () => {
    expect(compararDecimales("-1", "1")).toBe(-1);
    expect(compararDecimales("-1", "-2")).toBe(1);
    expect(compararDecimales("-0.000", "0")).toBe(0);
    expect(compararDecimales("0.00", "0")).toBe(0);
  });
  it("precisión más allá de float64", () => {
    // dos strings que un double colapsaría al mismo valor
    expect(
      compararDecimales("0.12345678901234567890", "0.12345678901234567891"),
    ).toBe(-1);
  });
  it("ceros a la izquierda no confunden", () => {
    expect(compararDecimales("007", "7")).toBe(0);
    expect(compararDecimales("010", "9")).toBe(1);
  });
  it("rechaza entradas inválidas", () => {
    expect(() => compararDecimales("1e3", "1")).toThrow(/decimal inválido/);
  });
});

describe("signo", () => {
  it("detecta positivo, negativo y cero", () => {
    expect(signo("417.03")).toBe(1);
    expect(signo("-2.15")).toBe(-1);
    expect(signo("0.000")).toBe(0);
    expect(signo("-0.0")).toBe(0);
  });
});

describe("formatDecimal (es-VE: grupo «.», decimal «,»)", () => {
  it("agrupa miles sin pasar por float", () => {
    expect(formatDecimal("1234567.89")).toBe("1.234.567,89");
    expect(formatDecimal("417.03000000", { maxDecimales: 2 })).toBe("417,03");
  });
  it("trunca (no redondea): el dato es exacto", () => {
    expect(formatDecimal("1.999", { maxDecimales: 2 })).toBe("1,99");
  });
  it("padding con minDecimales", () => {
    expect(formatDecimal("5", { minDecimales: 2 })).toBe("5,00");
  });
  it("negativos y ceros", () => {
    expect(formatDecimal("-1234.5")).toBe("-1.234,5");
    expect(formatDecimal("0.000", { maxDecimales: 4 })).toBe("0");
  });
  it("preserva precisión que float destruiría", () => {
    expect(formatDecimal("9007199254740993")).toBe("9.007.199.254.740.993");
  });
  it("formatPct añade el símbolo", () => {
    expect(formatPct("-2.1567")).toBe("-2,15 %");
  });
});

describe("toChartNumber (única conversión permitida)", () => {
  it("convierte para coordenadas", () => {
    expect(toChartNumber("417.03")).toBeCloseTo(417.03);
    expect(toChartNumber("-2.15")).toBeCloseTo(-2.15);
  });
  it("rechaza basura", () => {
    expect(() => toChartNumber("no")).toThrow(/decimal inválido/);
  });
});

describe("restarDecimales", () => {
  it("resta conservando la escala mayor", () => {
    expect(restarDecimales("420.5", "417.03")).toBe("3.47");
    expect(restarDecimales("417.03", "420.5")).toBe("-3.47");
    expect(restarDecimales("10", "10.000")).toBe("0.000");
  });
  it("cruza el cero y opera con negativos", () => {
    expect(restarDecimales("-1.5", "2.25")).toBe("-3.75");
    expect(restarDecimales("-1.5", "-2.25")).toBe("0.75");
  });
  it("es exacto donde float falla", () => {
    // 0.3 - 0.1 en float64 da 0.19999999999999998
    expect(restarDecimales("0.3", "0.1")).toBe("0.2");
    expect(restarDecimales("9007199254740993", "1")).toBe("9007199254740992");
  });
  it("rechaza entradas fuera del contrato", () => {
    expect(() => restarDecimales("1e3", "1")).toThrow(/decimal inválido/);
  });
});

describe("porcentajeRelativo", () => {
  it("calcula parte/base × 100 truncando", () => {
    expect(porcentajeRelativo("1.5", "3")).toBe("50.00");
    expect(porcentajeRelativo("3.47", "417.03")).toBe("0.83");
    expect(porcentajeRelativo("-3.47", "417.03")).toBe("-0.83");
  });
  it("trunca hacia cero, no redondea (el dato es exacto)", () => {
    // 2/3 × 100 = 66,6666… → se corta, no se redondea a 66,6667
    expect(porcentajeRelativo("2", "3", 4)).toBe("66.6666");
    expect(porcentajeRelativo("-2", "3", 4)).toBe("-66.6666");
  });
  it("base cero es null: ni infinito ni NaN", () => {
    expect(porcentajeRelativo("1", "0")).toBeNull();
    expect(porcentajeRelativo("1", "-0.000")).toBeNull();
  });
  it("base negativa invierte el signo del resultado", () => {
    expect(porcentajeRelativo("1", "-4")).toBe("-25.00");
  });
});
