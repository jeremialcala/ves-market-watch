/**
 * «Lectura de la sesión» — bloque rector del Intradía.
 *
 * Lo que se fija aquí es lo mismo que el resto de la app: que todo lo que se
 * afirma salga del contrato, que la regla la elija el motor y no este panel, y
 * que un botón que no hace nada lo diga.
 */

import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionReading } from "../../src/components/SessionReading";
import type { PuntoIntradia } from "../../src/lib/intradia";
import { marketStore } from "../../src/state/marketStore";
import { FIXTURE_ANALISIS } from "../contract/fixtures.test";
import { renderConProveedores as render } from "../render";

const AHORA = new Date("2026-07-27T15:16:00Z"); // 11:16 VET
const APERTURA = Date.parse("2026-07-27T14:00:00Z"); // 10:00 VET

function serie(nombre: string, valores: string[]): [string, PuntoIntradia[]] {
  return [
    nombre,
    valores.map((valor, i) => ({ t: APERTURA + i * 300_000, valor })),
  ];
}

const SERIES = new Map([
  serie("p2p_liquidez_sell", ["1000000", "1250000"]),
  serie("p2p_momentum_bid_3h_pct", ["0.10", "0.30"]),
]);

beforeEach(() => {
  marketStore.reset?.();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SessionReading", () => {
  it("el veredicto y las condiciones salen del análisis, no del panel", () => {
    marketStore.push({
      topic: "analysis",
      event_id: "e1",
      occurred_at: FIXTURE_ANALISIS.as_of,
      data: FIXTURE_ANALISIS,
    });
    render(<SessionReading series={SERIES} ahora={AHORA} />);

    // `summary.closest_rule` del fixture es `techo_inminente@v1`, 1 de 3.
    expect(screen.getByText(/techo inminente cumple 1 de 3/i)).toBeTruthy();
    // Las tres condiciones, con su nombre canónico SIN maquillar.
    expect(screen.getByText("p2p_momentum_bid_3h_pct")).toBeTruthy();
    expect(screen.getByText("p2p_spread_pct")).toBeTruthy();
  });

  it("la prosa nombra el indicador que bloquea y qué implica", () => {
    marketStore.push({
      topic: "analysis",
      event_id: "e1",
      occurred_at: FIXTURE_ANALISIS.as_of,
      data: FIXTURE_ANALISIS,
    });
    render(<SessionReading series={SERIES} ahora={AHORA} />);

    /*
     * El término técnico y su consecuencia en la MISMA frase: sin la segunda
     * mitad, el panel obliga a saberse el ruleset para entender por qué importa
     * que ese indicador esté donde está.
     */
    const prosa = document.querySelector(".vmw-sesion__prosa")!.textContent!;
    expect(prosa).toContain("p2p_momentum_bid_3h_pct");
    expect(prosa).toMatch(/no dispara/i);
  });

  it("el sello absorbe el día operativo, la apertura y lo transcurrido", () => {
    render(<SessionReading series={SERIES} ahora={AHORA} />);

    const sello = document.querySelector(".vmw-sesion__sello")!.textContent!;
    expect(sello).toMatch(/10:00 VET/);
    expect(sello).toMatch(/1 h 16 m/);
  });

  it("sin serie no inventa una apertura", () => {
    render(<SessionReading series={new Map()} ahora={AHORA} />);

    const sello = document.querySelector(".vmw-sesion__sello")!.textContent!;
    expect(sello).not.toMatch(/VET/);
    expect(sello).toMatch(/sin datos todavía/i);
  });

  it("«Vigilar esta regla» va deshabilitada y explica por qué", async () => {
    /*
     * Mismo criterio que «Crear alerta» del dashboard (ADR-0021): vigilar una
     * regla exige persistencia, evaluación en el motor y un canal de aviso. Un
     * botón que no hace nada sin decirlo es peor que no tenerlo.
     */
    render(<SessionReading series={SERIES} ahora={AHORA} />);

    const boton = screen.getByRole("button", { name: /vigilar esta regla/i });
    expect(boton.hasAttribute("disabled")).toBe(true);
    expect(boton.getAttribute("title")).toMatch(/ADR-0021/);
  });

  it("«Exportar sesión» vuelca el valor EXACTO de cada bucket", async () => {
    const usuario = userEvent.setup();
    const blobs: string[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      void (blob as Blob).text().then((texto) => blobs.push(texto));
      return "blob:x";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );

    render(<SessionReading series={SERIES} ahora={AHORA} />);
    await usuario.click(screen.getByRole("button", { name: /exportar sesión/i }));
    await new Promise((r) => setTimeout(r, 0));

    // Sin redondear: quien exporta quiere el dato, no la presentación.
    expect(blobs[0]).toContain("p2p_liquidez_sell");
    expect(blobs[0]).toContain("1250000");
    expect(blobs[0]).toContain("10:00");
  });

  it("sin serie no hay nada que exportar y el botón lo refleja", () => {
    render(<SessionReading series={new Map()} ahora={AHORA} />);

    expect(
      screen
        .getByRole("button", { name: /exportar sesión/i })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("sin análisis no afirma nada del ruleset", () => {
    render(<SessionReading series={SERIES} ahora={AHORA} />);

    expect(screen.getByText(/todavía no hay análisis/i)).toBeTruthy();
    expect(document.querySelector(".vmw-sesion__condiciones")).toBeNull();
  });

  it("cada hecho es una pastilla con su cifra", () => {
    marketStore.push({
      topic: "analysis",
      event_id: "e1",
      occurred_at: FIXTURE_ANALISIS.as_of,
      data: FIXTURE_ANALISIS,
    });
    render(<SessionReading series={SERIES} ahora={AHORA} />);

    const hechos = [...document.querySelectorAll(".vmw-sesion__hecho")].map(
      (h) => h.textContent ?? "",
    );
    expect(hechos.some((h) => /1 de 3 condiciones/.test(h))).toBe(true);
    expect(hechos.some((h) => /liquidez/i.test(h))).toBe(true);
    expect(hechos.some((h) => /momentum/i.test(h))).toBe(true);
    expect(hechos.some((h) => /confianza/i.test(h))).toBe(true);
  });
});
