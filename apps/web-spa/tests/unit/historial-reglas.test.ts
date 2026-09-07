/**
 * Historial de las reglas: las cifras salen de las señales emitidas.
 *
 * Lo que se defiende aquí, por orden de importancia:
 *
 * 1. **Una regla que no ha disparado sigue en la tabla.** Omitirla la haría
 *    desaparecer, y «existe y no ha disparado» es lo que alguien querría saber.
 * 2. **La media solo cuenta los casos medibles.** Promediar como cero los que
 *    aún no tienen ventana cumplida movería la media por una razón que no es
 *    del mercado.
 * 3. **No hay contador de aciertos.** La segunda métrica es completitud, no
 *    veredicto — el contrato de la API lo prohíbe expresamente.
 */

import { describe, expect, it } from "vitest";

import type { Analisis, Senal } from "../../src/api/endpoints";
import {
  colorMedible,
  colorSuficiencia,
  formatearEfecto,
  historialDeReglas,
} from "../../src/lib/historialReglas";

function senal(
  rule: string,
  outcome: { hours: number; gap_delta_pp: string } | null = null,
): Senal {
  return {
    type: rule.split("@")[0],
    direction: "alcista",
    currency: "VES",
    as_of: "2026-08-01T00:00:00Z",
    emitted_at: "2026-08-01T00:00:00Z",
    calc_version: 1,
    triggered_by: "00000000-0000-0000-0000-000000000000",
    evidence: { rule, inputs: { a: "1" } },
    ...(outcome === null ? {} : { outcome }),
  } as unknown as Senal;
}

function analisis(...reglas: string[]): Analisis {
  return {
    rule_proximity: reglas.map((rule) => ({
      rule,
      type: rule.split("@")[0],
      direction: "alcista",
      conditions_total: 1,
      conditions_met: 0,
      evaluable: true,
      blocked_by: null,
      conditions: [],
    })),
  } as unknown as Analisis;
}

describe("historialDeReglas", () => {
  it("sin análisis no hay ruleset del que hablar", () => {
    expect(historialDeReglas([senal("a@v1")], null)).toEqual([]);
  });

  it("una regla que nunca disparó SIGUE en la tabla, con cero casos", () => {
    const filas = historialDeReglas(
      [senal("arranque@v1")],
      analisis("arranque@v1", "techo@v1"),
    );
    expect(filas).toHaveLength(2);
    const techo = filas.find((f) => f.clave === "techo")!;
    expect(techo.casos).toBe(0);
    expect(techo.efectoMedio).toBeNull();
    expect(techo.suficiencia).toBe("sin-casos");
  });

  it("cuenta casos y separa los que ya tienen ventana cumplida", () => {
    const filas = historialDeReglas(
      [
        senal("a@v1", { hours: 24, gap_delta_pp: "1" }),
        senal("a@v1", { hours: 24, gap_delta_pp: "3" }),
        senal("a@v1", null), // pendiente
      ],
      analisis("a@v1"),
    );
    expect(filas[0].casos).toBe(3);
    expect(filas[0].conResultado).toBe(2);
    // Media de 1 y 3 = 2. El pendiente NO entra como cero: si entrara, saldria
    // 1,33 y la cifra estaria movida por algo que no es el mercado.
    expect(Number(filas[0].efectoMedio)).toBe(2);
    expect(filas[0].horas).toBe(24);
  });

  it("la clave se queda en snake_case, sin la versión", () => {
    const filas = historialDeReglas([], analisis("arranque_alcista@v1"));
    expect(filas[0].clave).toBe("arranque_alcista");
    expect(filas[0].regla).toBe("arranque_alcista@v1");
  });

  it("la suficiencia distingue sin casos, hipótesis y muestra indicativa", () => {
    const pocas = Array.from({ length: 3 }, () => senal("a@v1"));
    const muchas = Array.from({ length: 20 }, () => senal("b@v1"));
    const filas = historialDeReglas(
      [...pocas, ...muchas],
      analisis("a@v1", "b@v1", "c@v1"),
    );
    const por = (clave: string) => filas.find((f) => f.clave === clave)!;
    expect(por("a").suficiencia).toBe("hipotesis");
    expect(por("b").suficiencia).toBe("indicativa");
    expect(por("c").suficiencia).toBe("sin-casos");
  });

  it("ordena por casos, y los empates por clave para no bailar", () => {
    const filas = historialDeReglas(
      [senal("z@v1"), senal("a@v1"), senal("m@v1"), senal("m@v1")],
      analisis("z@v1", "a@v1", "m@v1"),
    );
    expect(filas.map((f) => f.clave)).toEqual(["m", "a", "z"]);
  });

  it("NO expone ningún recuento de aciertos", () => {
    // El contrato de la API lo prohíbe: «sin contador agregado (…) un N de M se
    // lee como tasa de acierto». Si alguien añade el campo, esto falla.
    const [fila] = historialDeReglas(
      [senal("a@v1", { hours: 24, gap_delta_pp: "1" })],
      analisis("a@v1"),
    );
    expect(Object.keys(fila).sort()).toEqual([
      "casos",
      "clave",
      "conResultado",
      "efectoMedio",
      "horas",
      "regla",
      "suficiencia",
    ]);
  });
});

describe("formato y color", () => {
  it("el efecto medio lleva su signo explícito", () => {
    expect(formatearEfecto("0.84", "es")).toBe("+0,84");
    expect(formatearEfecto("-0.12", "es")).toBe("-0,12");
    expect(formatearEfecto(null, "es")).toBeNull();
  });

  it("«con resultado» se colorea por medible, no por acierto", () => {
    const base = { regla: "a@v1", clave: "a", efectoMedio: null, horas: null } as const;
    expect(
      colorMedible({ ...base, casos: 4, conResultado: 4, suficiencia: "hipotesis" }),
    ).toBe("var(--sage)");
    expect(
      colorMedible({ ...base, casos: 4, conResultado: 2, suficiencia: "hipotesis" }),
    ).toBe("var(--text-muted)");
    expect(
      colorMedible({ ...base, casos: 0, conResultado: 0, suficiencia: "sin-casos" }),
    ).toBe("var(--text-dim)");
  });

  it("la pastilla de muestra se colorea por suficiencia", () => {
    expect(colorSuficiencia("indicativa")).toBe("var(--sage)");
    expect(colorSuficiencia("hipotesis")).toBe("var(--coral)");
    expect(colorSuficiencia("sin-casos")).toBe("var(--text-dim)");
  });
});
