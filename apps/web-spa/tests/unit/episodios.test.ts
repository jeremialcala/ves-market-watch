/**
 * La similitud de los episodios se CALCULA.
 *
 * El requisito es que no se elijan a mano, así que lo que estos tests fijan es
 * el orden: ante el mismo conjunto de señales, el que más se parece al estado
 * de hoy va primero, y eso cambia cuando cambia el estado de hoy. Una selección
 * cableada pasaría cualquier prueba que solo contase tarjetas.
 */

import { describe, expect, it } from "vitest";

import type { Analisis, Senal } from "../../src/api/endpoints";
import {
  colorCoincidencia,
  colorResultado,
  episodiosComparables,
} from "../../src/lib/episodios";

function senal(as_of: string, inputs: Record<string, string>, rule = "r@v1"): Senal {
  return {
    type: "arranque_alcista",
    direction: "alcista",
    currency: "VES",
    as_of,
    emitted_at: as_of,
    calc_version: 1,
    triggered_by: "00000000-0000-0000-0000-000000000000",
    evidence: { rule, inputs },
  } as unknown as Senal;
}

/** Análisis con una regla de dos condiciones y los valores de HOY. */
function analisis(hoyA: string | null, hoyB: string | null, rule = "r@v1"): Analisis {
  return {
    rule_proximity: [
      {
        rule,
        type: "arranque_alcista",
        direction: "alcista",
        conditions_total: 2,
        conditions_met: 0,
        evaluable: true,
        blocked_by: null,
        conditions: [
          { indicator: "a", op: "gt", threshold: "10", value: hoyA, met: false, distance: null },
          { indicator: "b", op: "gt", threshold: "10", value: hoyB, met: false, distance: null },
        ],
      },
    ],
  } as unknown as Analisis;
}

describe("episodiosComparables", () => {
  it("sin análisis no hay con qué comparar", () => {
    expect(episodiosComparables([senal("2026-08-01T00:00:00Z", { a: "1" })], null)).toEqual([]);
  });

  it("ordena por parecido al estado de HOY, no por fecha", () => {
    const senales = [
      senal("2026-08-01T00:00:00Z", { a: "50", b: "50" }), // lejos
      senal("2026-08-02T00:00:00Z", { a: "12", b: "12" }), // cerca
      senal("2026-08-03T00:00:00Z", { a: "30", b: "30" }), // medio
    ];
    const orden = episodiosComparables(senales, analisis("12", "12")).map(
      (e) => e.senal.as_of,
    );
    // El más parecido va primero aunque sea el del medio en fecha.
    expect(orden[0]).toBe("2026-08-02T00:00:00Z");
    expect(orden[2]).toBe("2026-08-01T00:00:00Z");
  });

  it("el orden CAMBIA si cambia el estado de hoy", () => {
    const senales = [
      senal("2026-08-01T00:00:00Z", { a: "50", b: "50" }),
      senal("2026-08-02T00:00:00Z", { a: "12", b: "12" }),
    ];
    const cercaDe12 = episodiosComparables(senales, analisis("12", "12"))[0];
    const cercaDe50 = episodiosComparables(senales, analisis("50", "50"))[0];
    expect(cercaDe12.senal.as_of).not.toBe(cercaDe50.senal.as_of);
  });

  it("un estado idéntico da 100 % y uno a un umbral de distancia da 0 %", () => {
    const identico = episodiosComparables(
      [senal("2026-08-01T00:00:00Z", { a: "12", b: "12" })],
      analisis("12", "12"),
    )[0];
    expect(identico.similitud).toBe(100);

    // Umbral 10: separarse 10 en ambas condiciones es 1 umbral de distancia.
    const lejos = episodiosComparables(
      [senal("2026-08-01T00:00:00Z", { a: "2", b: "2" })],
      analisis("12", "12"),
    )[0];
    expect(lejos.similitud).toBe(0);
  });

  it("nunca da porcentajes negativos", () => {
    const e = episodiosComparables(
      [senal("2026-08-01T00:00:00Z", { a: "-500", b: "-500" })],
      analisis("500", "500"),
    )[0];
    expect(e.similitud).toBe(0);
  });

  it("descarta el episodio si su regla ya no está en el ruleset", () => {
    // El ruleset subió de versión: comparar contra otras condiciones diría algo
    // que no es. Mejor no enseñar el episodio.
    const e = episodiosComparables(
      [senal("2026-08-01T00:00:00Z", { a: "12" }, "r@v2")],
      analisis("12", "12", "r@v1"),
    );
    expect(e).toEqual([]);
  });

  it("descarta el episodio si no queda ninguna condición comparable", () => {
    // Ningún indicador vigente hoy: puntuarlo sería inventarse la cifra.
    const e = episodiosComparables(
      [senal("2026-08-01T00:00:00Z", { a: "12", b: "12" })],
      analisis(null, null),
    );
    expect(e).toEqual([]);
  });

  it("marca si hoy cae del mismo lado del umbral que entonces", () => {
    const [e] = episodiosComparables(
      [senal("2026-08-01T00:00:00Z", { a: "12", b: "8" })],
      analisis("14", "2"), // a: arriba y arriba; b: abajo y abajo
    );
    expect(e.condiciones[0].coincide).toBe(true);
    expect(e.condiciones[1].coincide).toBe(true);

    const [cruzado] = episodiosComparables(
      [senal("2026-08-01T00:00:00Z", { a: "12", b: "12" })],
      analisis("8", "12"), // a cambió de lado
    );
    expect(cruzado.condiciones[0].coincide).toBe(false);
    expect(cruzado.condiciones[1].coincide).toBe(true);
  });

  it("respeta el límite pedido", () => {
    const senales = Array.from({ length: 8 }, (_, i) =>
      senal(`2026-08-0${i + 1}T00:00:00Z`, { a: String(10 + i), b: "12" }),
    );
    expect(episodiosComparables(senales, analisis("12", "12"))).toHaveLength(3);
    expect(episodiosComparables(senales, analisis("12", "12"), 5)).toHaveLength(5);
  });
});

describe("color del resultado", () => {
  it("describe el movimiento; no juzga acierto", () => {
    // La brecha ensanchándose va en coral porque el coral marca lo que acerca
    // un disparo, no «lo malo». Sin nota de acierto por ningún lado.
    expect(colorResultado("1.2")).toBe("var(--coral)");
    expect(colorResultado("-1.2")).toBe("var(--sage)");
    expect(colorResultado("0")).toBe("var(--text-muted)");
    expect(colorResultado(null)).toBe("var(--text-muted)");
    expect(colorResultado(undefined)).toBe("var(--text-muted)");
  });

  it("la coincidencia colorea el valor de hoy", () => {
    expect(colorCoincidencia(true)).toBe("var(--sage)");
    expect(colorCoincidencia(false)).toBe("var(--coral)");
  });
});
