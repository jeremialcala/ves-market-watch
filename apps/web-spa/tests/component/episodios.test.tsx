/**
 * Sección «Episodios comparables».
 *
 * Dos cosas se defienden aquí, y ninguna es que se pinte:
 *
 * 1. **Las tarjetas se eligen por parecido**, no a mano. El test cambia el
 *    estado de hoy y comprueba que cambia la tarjeta que va primera.
 * 2. **«Qué pasó después» es historia observada, no acierto.** Si la ventana no
 *    se ha cumplido, la tarjeta lo dice en vez de dejar el hueco: «todavía no
 *    ocurrió» y «no pasó nada» son cosas distintas.
 */

import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { Analisis, Senal } from "../../src/api/endpoints";
import { EpisodiosComparables } from "../../src/components/EpisodiosComparables";
import { ES } from "../../src/i18n/dict";
import { renderConProveedores as render } from "../render";

afterEach(cleanup);

function senal(
  as_of: string,
  inputs: Record<string, string>,
  outcome: { hours: number; gap_delta_pp: string } | null = null,
): Senal {
  return {
    type: "arranque_alcista",
    direction: "alcista",
    currency: "VES",
    as_of,
    emitted_at: as_of,
    calc_version: 1,
    triggered_by: "00000000-0000-0000-0000-000000000000",
    evidence: { rule: "arranque_alcista@v1", inputs },
    ...(outcome === null ? {} : { outcome }),
  } as unknown as Senal;
}

function analisis(hoyA: string, hoyB: string): Analisis {
  return {
    rule_proximity: [
      {
        rule: "arranque_alcista@v1",
        type: "arranque_alcista",
        direction: "alcista",
        conditions_total: 2,
        conditions_met: 0,
        evaluable: true,
        blocked_by: null,
        conditions: [
          { indicator: "p2p_momentum_bid_3h_pct", op: "gt", threshold: "10", value: hoyA, met: false, distance: null },
          { indicator: "p2p_spread_pct", op: "gt", threshold: "10", value: hoyB, met: false, distance: null },
        ],
      },
    ],
  } as unknown as Analisis;
}

function pintar(senales: Senal[], a: Analisis | null, idioma: "es" | "en" = "es") {
  return render(
    <EpisodiosComparables senales={senales} analisis={a} idioma={idioma} />,
    { idioma },
  );
}

const fechas = () =>
  [...document.querySelectorAll(".vmw-episodio__fecha")].map(
    (n) => n.textContent ?? "",
  );

describe("EpisodiosComparables", () => {
  it("las tarjetas se ELIGEN por parecido: cambia hoy, cambia el orden", () => {
    const senales = [
      senal("2026-08-01T10:00:00Z", { p2p_momentum_bid_3h_pct: "50", p2p_spread_pct: "50" }),
      senal("2026-08-02T10:00:00Z", { p2p_momentum_bid_3h_pct: "12", p2p_spread_pct: "12" }),
    ];
    pintar(senales, analisis("12", "12"));
    const primeraCerca = fechas()[0];
    cleanup();

    pintar(senales, analisis("50", "50"));
    const primeraLejos = fechas()[0];

    expect(primeraCerca).not.toBe(primeraLejos);
  });

  it("como mucho tres tarjetas, y con su porcentaje", () => {
    const senales = Array.from({ length: 6 }, (_, i) =>
      senal(`2026-08-0${i + 1}T10:00:00Z`, {
        p2p_momentum_bid_3h_pct: String(11 + i),
        p2p_spread_pct: "12",
      }),
    );
    pintar(senales, analisis("12", "12"));
    expect(document.querySelectorAll(".vmw-episodio")).toHaveLength(3);
    expect(document.querySelectorAll(".vmw-episodio__pastilla")).toHaveLength(3);
    expect(screen.getAllByText(/% de coincidencia/).length).toBe(3);
  });

  it("la minitabla enfrenta entonces y hoy, condición por condición", () => {
    pintar(
      [senal("2026-08-01T10:00:00Z", { p2p_momentum_bid_3h_pct: "12", p2p_spread_pct: "8" })],
      analisis("14", "9"),
    );
    expect(screen.getByText(ES["episodios.colCondicion"])).toBeTruthy();
    expect(screen.getByText(ES["episodios.colEntonces"])).toBeTruthy();
    expect(screen.getByText(ES["episodios.colHoy"])).toBeTruthy();
    expect(document.querySelectorAll(".vmw-episodio__fila")).toHaveLength(2);
    expect(screen.getByText("p2p_momentum_bid_3h_pct")).toBeTruthy();
  });

  it("el valor de hoy se colorea según coincida de lado con entonces", () => {
    pintar(
      [senal("2026-08-01T10:00:00Z", { p2p_momentum_bid_3h_pct: "12", p2p_spread_pct: "12" })],
      analisis("14", "8"), // el segundo cruzó al otro lado del umbral 10
    );
    const hoy = [...document.querySelectorAll<HTMLElement>(".vmw-episodio__hoy")];
    expect(hoy[0].style.color).toBe("var(--sage)");
    expect(hoy[1].style.color).toBe("var(--coral)");
  });

  it("«qué pasó después» es la variación observada, sin nota de acierto", () => {
    pintar(
      [senal("2026-08-01T10:00:00Z", { p2p_momentum_bid_3h_pct: "12", p2p_spread_pct: "12" }, { hours: 24, gap_delta_pp: "1.5" })],
      analisis("12", "12"),
    );
    const bloque =
      document.querySelector(".vmw-episodio__despues")?.textContent ?? "";
    expect(bloque).toContain("24 h");
    expect(bloque).toContain("1,5");
    expect(bloque).toMatch(/no una medida de acierto/);
    // Nada que se lea como acierto/fallo.
    expect(bloque).not.toMatch(/acert|fall[oó]|correct/i);
  });

  it("si la ventana no se ha cumplido lo DICE, en vez de dejar el hueco", () => {
    pintar(
      [senal("2026-08-01T10:00:00Z", { p2p_momentum_bid_3h_pct: "12", p2p_spread_pct: "12" }, null)],
      analisis("12", "12"),
    );
    expect(screen.getByText(ES["episodios.sinVentana"])).toBeTruthy();
    expect(document.querySelector(".vmw-episodio__resultado")).toBeNull();
  });

  it("sin episodios comparables no se pinta la sección", () => {
    // Una rejilla vacía con su título prometería algo que no hay.
    pintar([], analisis("12", "12"));
    expect(document.querySelector(".vmw-episodios")).toBeNull();
    cleanup();
    pintar([senal("2026-08-01T10:00:00Z", { a: "1" })], null);
    expect(document.querySelector(".vmw-episodios")).toBeNull();
  });

  it("en inglés no se escapa ninguna clave sin traducir", () => {
    pintar(
      [senal("2026-08-01T10:00:00Z", { p2p_momentum_bid_3h_pct: "12", p2p_spread_pct: "12" }, { hours: 24, gap_delta_pp: "1.5" })],
      analisis("12", "12"),
      "en",
    );
    expect(document.body.textContent).not.toContain("episodios.");
    expect(screen.getByText("Comparable episodes")).toBeTruthy();
  });
});
