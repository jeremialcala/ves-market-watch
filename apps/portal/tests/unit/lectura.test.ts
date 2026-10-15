import { describe, expect, it } from "vitest";

import {
  absoluto,
  conSigno,
  cuotaOficial,
  deltaVsSieteDias,
  descomposicion,
  edad,
  fechaVet,
  medidoresLanding,
  operador,
  puntosSparkline,
  reglaCercana,
  tasaUsd,
  valorIndicador,
  vistaMedidor,
} from "../../src/lib/lectura";
import { AHORA, snapshot } from "../fixtura";

describe("edad", () => {
  const hace = (ms: number) => new Date(AHORA - ms).toISOString();
  it.each([
    [500, "tiempo.ahora", 0],
    [20_000, "tiempo.segundos", 20],
    [5 * 60_000, "tiempo.minutos", 5],
    [3 * 3_600_000, "tiempo.horas", 3],
    [3 * 86_400_000, "tiempo.dias", 3],
  ])("%i ms → %s %i", (ms, clave, n) => {
    expect(edad(hace(ms), AHORA)).toEqual({ clave, n });
  });

  it("una fecha ilegible o futura es «ahora», no un número absurdo", () => {
    expect(edad("no-es-fecha", AHORA).clave).toBe("tiempo.ahora");
    expect(edad(new Date(AHORA + 60_000).toISOString(), AHORA).clave).toBe("tiempo.ahora");
  });
});

describe("cifras", () => {
  it("fechaVet pone la hora de Caracas", () => {
    expect(fechaVet("2026-10-15T00:08:00Z", "es")).toMatch(/14 oct · 20:08 VET/);
    expect(fechaVet("2026-10-15T00:08:00Z", "en")).toMatch(/Oct 14 · 20:08 VET/);
  });

  it("valorIndicador usa % solo para los _pct", () => {
    expect(valorIndicador("0.4955", "p2p_spread_pct", "es")).toBe("0,49 %");
    expect(valorIndicador("0.1689", "p2p_ratio_oferta_demanda", "es")).toBe("0,16");
  });

  it("conSigno marca el signo con el menos tipográfico", () => {
    expect(conSigno("1.2", "es")).toBe("+1,20");
    expect(conSigno("-0.53", "es")).toBe("−0,53");
    expect(conSigno("0", "en")).toBe("0.00");
  });

  it("absoluto y operador", () => {
    expect(absoluto("-7.8")).toBe("7.8");
    expect(absoluto("7.8")).toBe("7.8");
    expect([operador("gt"), operador("lte"), operador("raro")]).toEqual([">", "≤", "raro"]);
  });
});

describe("hero", () => {
  it("la brecha contra su media de 7 días, exacta", () => {
    expect(deltaVsSieteDias(snapshot())).toBe("-0.53159720");
  });

  it("sin historia de 7 días no hay comparación", () => {
    const s = snapshot();
    s.analysis!.gap_history = null;
    expect(deltaVsSieteDias(s)).toBeNull();
    expect(deltaVsSieteDias({ ...snapshot(), gap: null })).toBeNull();
  });

  it("la tasa en USD", () => {
    expect(tasaUsd(snapshot())).toBe("879.25310000");
    expect(tasaUsd({ ...snapshot(), official_rates: [] })).toBeNull();
  });

  it("la sparkline ocupa el alto disponible y necesita dos puntos", () => {
    const puntos = puntosSparkline([{ value: "10" }, { value: "20" }, { value: "15" }], 100, 50, 5);
    expect(puntos).toBe("0.0,45.0 50.0,5.0 100.0,25.0");
    expect(puntosSparkline([{ value: "1" }], 100, 50)).toBe("");
    // Una serie plana no divide por cero.
    expect(puntosSparkline([{ value: "1" }, { value: "1" }], 100, 50, 5)).toBe("0.0,45.0 100.0,45.0");
  });
});

describe("anticipación", () => {
  it("la regla más cercana es la que dice el resumen", () => {
    expect(reglaCercana(snapshot())?.rule).toBe("arranque_alcista@v1");
  });

  it("si el resumen no la nombra, la primera; sin análisis, ninguna", () => {
    const s = snapshot();
    s.analysis!.summary.closest_rule = null;
    expect(reglaCercana(s)?.rule).toBe("arranque_alcista@v1");
    expect(reglaCercana({ ...snapshot(), analysis: null })).toBeNull();
  });
});

describe("contexto", () => {
  it("elige los tres medidores de la landing, en orden", () => {
    expect(medidoresLanding(snapshot()).map((m) => m.indicator)).toEqual([
      "p2p_spread_pct",
      "p2p_ratio_oferta_demanda",
      "p2p_momentum_bid_3h_pct",
    ]);
    expect(medidoresLanding({ ...snapshot(), analysis: null })).toEqual([]);
  });

  it("un medidor con una regla cumplida la muestra a ella, con la zona a la izquierda (lt)", () => {
    const [, ratio] = medidoresLanding(snapshot());
    const vista = vistaMedidor(ratio);
    expect(vista.regla).toEqual({ nombre: "arranque_alcista@v1", cumple: true, distancia: "0.1310203089920197158591284370" });
    expect(vista.umbral).toBeCloseTo(17.72);
    expect(vista.zona).toEqual({ izquierda: 0, ancho: vista.umbral });
    expect(vista.percentil).toBe(7);
    expect(vista.cortes).toEqual({ bajo: "0.21934255", medio: "0.63728885", alto: "1.83457014" });
  });

  it("sin reglas cumplidas, la más cercana; con gt, la zona va a la derecha", () => {
    const [, , momentum] = medidoresLanding(snapshot());
    const vista = vistaMedidor(momentum);
    expect(vista.regla?.nombre).toBe("arranque_alcista@v1");
    expect(vista.zona?.izquierda).toBeCloseTo(85.68);
    expect(vista.marcador).toBeCloseTo(46.86);
  });

  it("sin reglas ni posición", () => {
    const [spread] = medidoresLanding(snapshot());
    const vista = vistaMedidor({ ...spread, rules: [], position: null, scale: { ...spread.scale, source: "ruleset", cuts: [] } });
    expect(vista).toMatchObject({ regla: null, umbral: null, zona: null, marcador: 0, percentil: null });
    expect(vista.cortes).toEqual({ bajo: null, medio: null, alto: null });
  });
});

describe("explicación", () => {
  it("qué parte del precio P2P es la oficial", () => {
    expect(descomposicion(snapshot())).toEqual({
      oficial: "879.25310000",
      vwap: "1014.20480201",
      pctOficial: "86.6",
      pctBrecha: "13.4",
    });
  });

  it("sin tasa o sin VWAP no hay descomposición", () => {
    expect(descomposicion({ ...snapshot(), official_rates: [] })).toBeNull();
    const s = snapshot();
    s.p2p.buy = null;
    expect(descomposicion(s)).toBeNull();
  });

  it("con VWAP cero no se divide", () => {
    const s = snapshot();
    s.p2p.buy!.vwap = "0";
    expect(descomposicion(s)).toBeNull();
  });

  it("la cuota oficial en %, entera", () => {
    expect(cuotaOficial("0.9838735687792291565876471537")).toBe("98");
    expect(cuotaOficial(null)).toBeNull();
  });
});
