/**
 * Qué condición gobierna a cada indicador de microestructura.
 *
 * El caso que obliga a tener este módulo: `p2p_ratio_oferta_demanda` y
 * `p2p_momentum_bid_3h_pct` son condición de TRES reglas con umbrales distintos,
 * así que «cumple» no significa nada sin decir de qué regla se habla.
 */

import { describe, expect, it } from "vitest";

import { condicionDe } from "../../src/lib/reglas";

/** Las tres reglas del ruleset v1, con sus umbrales reales. */
const ANALISIS = {
  summary: { closest_rule: "techo_inminente@v1" },
  rule_proximity: [
    {
      rule: "arranque_alcista@v1",
      conditions_total: 3,
      conditions: [
        { indicator: "p2p_momentum_bid_3h_pct", op: "gt" as const, threshold: "0.5", met: true },
        { indicator: "p2p_drenaje_oferta_6h_pct", op: "lt" as const, threshold: "-40", met: false },
        { indicator: "p2p_ratio_oferta_demanda", op: "lt" as const, threshold: "0.3", met: true },
      ],
    },
    {
      rule: "techo_inminente@v1",
      conditions_total: 3,
      conditions: [
        { indicator: "p2p_momentum_bid_3h_pct", op: "gt" as const, threshold: "1.5", met: false },
        { indicator: "p2p_spread_pct", op: "lt" as const, threshold: "0.5", met: true },
        { indicator: "p2p_ratio_oferta_demanda", op: "lt" as const, threshold: "0.2", met: false },
      ],
    },
  ],
};

describe("condicionDe", () => {
  it("prefiere la regla más cercana, que es la que el resto de la vista destaca", () => {
    /*
     * El momentum vive en las dos con umbrales distintos: 0,5 y 1,5. Sin elegir
     * la misma que el titular, la tarjeta diría «no cumple» mientras la lectura
     * de sesión habla de otra regla — y las dos tendrían razón.
     */
    const condicion = condicionDe(ANALISIS, "p2p_momentum_bid_3h_pct")!;

    expect(condicion.regla).toBe("techo_inminente@v1");
    expect(condicion.umbral).toBe("1.5");
    expect(condicion.cumple).toBe(false);
  });

  it("sin regla cercana elige siempre la misma, no la primera que llegue", () => {
    /*
     * El orden de `rule_proximity` lo decide el motor y puede cambiar entre
     * revisiones: sin desempate estable, la tarjeta cambiaría de umbral sola.
     */
    const sinCercana = { ...ANALISIS, summary: { closest_rule: null } };
    const alReves = {
      ...sinCercana,
      rule_proximity: [...ANALISIS.rule_proximity].reverse(),
    };

    expect(condicionDe(sinCercana, "p2p_ratio_oferta_demanda")?.regla).toBe(
      "arranque_alcista@v1",
    );
    expect(condicionDe(alReves, "p2p_ratio_oferta_demanda")?.regla).toBe(
      "arranque_alcista@v1",
    );
  });

  it("dice qué posición ocupa dentro de su regla", () => {
    const condicion = condicionDe(ANALISIS, "p2p_drenaje_oferta_6h_pct")!;

    expect(condicion.regla).toBe("arranque_alcista@v1");
    expect(condicion.indice).toBe(2);
    expect(condicion.total).toBe(3);
  });

  it("el total sale del contrato, no del largo del array", () => {
    /*
     * Si alguna condición no viaja —indicador sin valor vigente—, contar el
     * array diría «1 de 1» de una regla que tiene tres.
     */
    const recortado = {
      summary: {},
      rule_proximity: [
        {
          rule: "arranque_alcista@v1",
          conditions_total: 3,
          conditions: [
            { indicator: "p2p_spread_pct", op: "lt" as const, threshold: "0.5", met: true },
          ],
        },
      ],
    };

    expect(condicionDe(recortado, "p2p_spread_pct")?.total).toBe(3);
  });

  it("un indicador fuera del ruleset no tiene condición que mostrar", () => {
    expect(condicionDe(ANALISIS, "p2p_mediana_buy")).toBeNull();
  });

  it("sin análisis no se inventa un estado", () => {
    expect(condicionDe(null, "p2p_spread_pct")).toBeNull();
  });
});
