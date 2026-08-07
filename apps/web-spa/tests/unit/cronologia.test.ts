/**
 * Los eventos de la «Cronología de la sesión».
 *
 * La sección solo vale si cada línea se puede señalar en una serie. Lo que se
 * fija aquí es que ninguna se invente y que las ausencias quiten SUS eventos, no
 * la cronología entera.
 */

import { describe, expect, it } from "vitest";

import { eventosDeSesion, SIGMAS_SALTO } from "../../src/lib/cronologia";
import type { PuntoIntradia } from "../../src/lib/intradia";
import { MUESTRAS_MINIMAS_SIGMA } from "../../src/lib/movimiento";

const T0 = Date.parse("2026-08-06T04:00:00Z"); // 00:00 VET
const PASO = 3_600_000;

function serie(valores: string[], desde = T0): PuntoIntradia[] {
  return valores.map((valor, i) => ({ t: desde + i * PASO, valor }));
}

/** Referencia con saltos de ±`salto`: σ de los saltos sale `salto`. */
function referenciaConSaltos(base: number, salto: number): PuntoIntradia[] {
  const valores: string[] = [];
  for (let i = 0; i < MUESTRAS_MINIMAS_SIGMA + 1; i += 1) {
    valores.push(String(base + (i % 2 === 0 ? 0 : salto)));
  }
  return serie(valores);
}

const ANALISIS = {
  as_of: new Date(T0 + 3 * PASO).toISOString(),
  rule_proximity: [
    {
      conditions: [
        { indicator: "p2p_momentum_bid_3h_pct", op: "gt" as const, threshold: "0.5" },
      ],
    },
  ],
};

describe("eventosDeSesion", () => {
  it("la apertura es el primer bucket del día, sea de la serie que sea", () => {
    const sesion = new Map([
      ["a", serie(["1", "2"], T0 + PASO)],
      ["b", serie(["1", "2"], T0)], // esta empieza antes
    ]);

    const [primero] = eventosDeSesion(sesion, new Map(), null);

    expect(primero.clase).toBe("apertura");
    expect(primero.t).toBe(T0);
  });

  it("sin ninguna serie no hay cronología que contar", () => {
    expect(eventosDeSesion(new Map(), new Map(), ANALISIS)).toEqual([]);
  });

  it("marca el cruce de umbral en el bucket en que cambia de estado", () => {
    const sesion = new Map([
      ["p2p_momentum_bid_3h_pct", serie(["0.2", "0.4", "0.7", "0.9"])],
    ]);

    const cruces = eventosDeSesion(sesion, new Map(), ANALISIS).filter(
      (e) => e.clase === "umbral",
    );

    // Cruza entre 0,4 y 0,7 — un solo evento, en el bucket del 0,7.
    expect(cruces).toHaveLength(1);
    expect(cruces[0].t).toBe(T0 + 2 * PASO);
    expect(cruces[0].cumple).toBe(true);
    expect(cruces[0].valor).toBe("0.7");
    expect(cruces[0].umbral).toBe("0.5");
  });

  it("dejar de cumplir también es un cruce", () => {
    const sesion = new Map([
      ["p2p_momentum_bid_3h_pct", serie(["0.9", "0.7", "0.2"])],
    ]);

    const cruces = eventosDeSesion(sesion, new Map(), ANALISIS).filter(
      (e) => e.clase === "umbral",
    );

    expect(cruces).toHaveLength(1);
    expect(cruces[0].cumple).toBe(false);
  });

  it("una serie que nunca cruza no genera eventos", () => {
    const sesion = new Map([
      ["p2p_momentum_bid_3h_pct", serie(["0.1", "0.2", "0.3"])],
    ]);

    expect(
      eventosDeSesion(sesion, new Map(), ANALISIS).filter(
        (e) => e.clase === "umbral",
      ),
    ).toEqual([]);
  });

  it("la misma condición en dos reglas se evalúa UNA vez", () => {
    /*
     * `rule_proximity` trae una entrada por regla y varias comparten condición:
     * sin deduplicar, un solo cruce aparecía tres veces en la cronología.
     */
    const analisis = {
      ...ANALISIS,
      rule_proximity: [ANALISIS.rule_proximity[0], ANALISIS.rule_proximity[0]],
    };
    const sesion = new Map([
      ["p2p_momentum_bid_3h_pct", serie(["0.2", "0.7"])],
    ]);

    expect(
      eventosDeSesion(sesion, new Map(), analisis).filter(
        (e) => e.clase === "umbral",
      ),
    ).toHaveLength(1);
  });

  it("un salto de liquidez entra solo si supera 2σ de los saltos habituales", () => {
    /*
     * σ se mide sobre los SALTOS, no sobre los valores: lo que se afirma es que
     * este movimiento es grande para lo que esa serie se mueve normalmente, no
     * que el nivel sea alto.
     */
    const sesion = new Map([
      ["p2p_liquidez_sell", serie(["1000000", "1010000", "1500000"])],
    ]);
    const referencia = new Map([
      ["p2p_liquidez_sell", referenciaConSaltos(1_000_000, 100_000)],
    ]);

    const saltos = eventosDeSesion(sesion, referencia, null).filter(
      (e) => e.clase === "liquidez",
    );

    // +10 000 no llega a 2σ; +490 000 sí.
    expect(saltos).toHaveLength(1);
    expect(saltos[0].delta).toBe("490000");
    expect(saltos[0].sigmas).toBeGreaterThan(SIGMAS_SALTO);
  });

  it("sin ventana de referencia no se afirma que un salto sea grande", () => {
    const sesion = new Map([
      ["p2p_liquidez_sell", serie(["1000000", "9000000"])],
    ]);

    expect(
      eventosDeSesion(sesion, new Map(), null).filter(
        (e) => e.clase === "liquidez",
      ),
    ).toEqual([]);
  });

  it("el recálculo es el as_of del análisis, y solo si cae en la sesión", () => {
    const sesion = new Map([["a", serie(["1", "2", "3", "4"])]]);

    const dentro = eventosDeSesion(sesion, new Map(), ANALISIS).filter(
      (e) => e.clase === "recalculo",
    );
    expect(dentro).toHaveLength(1);
    expect(dentro[0].t).toBe(Date.parse(ANALISIS.as_of));

    // Un análisis anterior a la apertura es de la sesión de ayer.
    const viejo = { ...ANALISIS, as_of: new Date(T0 - PASO).toISOString() };
    expect(
      eventosDeSesion(sesion, new Map(), viejo).filter(
        (e) => e.clase === "recalculo",
      ),
    ).toEqual([]);
  });

  it("sin análisis quedan los eventos que no dependen de él", () => {
    /*
     * Una ausencia quita SUS eventos, no la cronología: sin análisis no hay
     * umbrales ni recálculo, pero la apertura y los saltos siguen siendo hechos.
     */
    const sesion = new Map([
      ["p2p_liquidez_sell", serie(["1000000", "1500000"])],
    ]);
    const referencia = new Map([
      ["p2p_liquidez_sell", referenciaConSaltos(1_000_000, 100_000)],
    ]);

    const clases = eventosDeSesion(sesion, referencia, null).map((e) => e.clase);

    expect(clases).toEqual(["apertura", "liquidez"]);
  });

  it("dos eventos en el mismo bucket no cambian de orden entre refrescos", () => {
    const sesion = new Map([
      ["p2p_liquidez_buy", serie(["1000000", "1500000"])],
      ["p2p_liquidez_sell", serie(["1000000", "1500000"])],
    ]);
    const referencia = new Map([
      ["p2p_liquidez_buy", referenciaConSaltos(1_000_000, 100_000)],
      ["p2p_liquidez_sell", referenciaConSaltos(1_000_000, 100_000)],
    ]);

    const orden = () =>
      eventosDeSesion(sesion, referencia, null)
        .filter((e) => e.clase === "liquidez")
        .map((e) => e.indicador);

    expect(orden()).toEqual(["p2p_liquidez_buy", "p2p_liquidez_sell"]);
    expect(orden()).toEqual(orden());
  });

  it("los eventos salen en orden cronológico", () => {
    const sesion = new Map([
      ["p2p_momentum_bid_3h_pct", serie(["0.2", "0.7", "0.2", "0.9"])],
    ]);

    const tiempos = eventosDeSesion(sesion, new Map(), ANALISIS).map((e) => e.t);

    expect(tiempos).toEqual([...tiempos].sort((a, b) => a - b));
  });
});
