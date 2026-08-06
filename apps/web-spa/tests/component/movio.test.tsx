/**
 * «Qué se movió desde la apertura».
 *
 * El criterio se prueba en `unit/movimiento.test.ts`; aquí se fija lo que la
 * sección AFIRMA: cuántas series explican la sesión, qué dice del resto, y que
 * el borde coral solo aparezca donde el proyecto tiene una lectura establecida.
 */

import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SessionMovers } from "../../src/components/SessionMovers";
import type { PuntoIntradia } from "../../src/lib/intradia";
import { MUESTRAS_MINIMAS_SIGMA } from "../../src/lib/movimiento";
import { renderConProveedores as render } from "../render";

afterEach(cleanup);

function serie(valores: string[]): PuntoIntradia[] {
  return valores.map((valor, i) => ({ t: 1_000 + i * 300_000, valor }));
}

function historia(base: number, dispersion: number): PuntoIntradia[] {
  return serie(
    Array.from({ length: MUESTRAS_MINIMAS_SIGMA }, (_, i) =>
      String(base + (i % 2 === 0 ? dispersion : -dispersion)),
    ),
  );
}

/** Seis series con historia; las cuatro primeras se mueven mucho más. */
function escenario() {
  const sesion = new Map([
    ["p2p_brecha_pct_buy", serie(["12", "18"])],
    ["p2p_liquidez_sell", serie(["1000000", "700000"])],
    ["p2p_spread_pct", serie(["0.4", "0.9"])],
    ["p2p_mediana_buy", serie(["850", "858"])],
    ["p2p_vwap_buy", serie(["850", "850.1"])],
    ["p2p_ratio_oferta_demanda", serie(["0.2", "0.201"])],
  ]);
  const historial = new Map([
    ["p2p_brecha_pct_buy", historia(12, 0.5)],
    ["p2p_liquidez_sell", historia(1_000_000, 20_000)],
    ["p2p_spread_pct", historia(0.4, 0.02)],
    ["p2p_mediana_buy", historia(850, 1)],
    ["p2p_vwap_buy", historia(850, 1)],
    ["p2p_ratio_oferta_demanda", historia(0.2, 0.02)],
  ]);
  return { sesion, historial };
}

describe("SessionMovers", () => {
  it("pinta cuatro tarjetas y dice sobre cuántas series se eligieron", () => {
    const { sesion, historial } = escenario();
    render(<SessionMovers sesion={sesion} historia={historial} />);

    expect(document.querySelectorAll(".vmw-movio__tarjeta")).toHaveLength(4);
    expect(screen.getByText(/4 de 6 series explican la sesión/i)).toBeTruthy();
  });

  it("afirma que el resto se mantuvo en su rango SOLO si es cierto", () => {
    /*
     * La frase es una afirmación sobre las series que NO están en la rejilla. Si
     * se cablea, el día que una quinta se dispare el panel mentirá sin que nadie
     * se entere; por eso se cuenta.
     */
    const { sesion, historial } = escenario();
    render(<SessionMovers sesion={sesion} historia={historial} />);
    expect(screen.getByText(/el resto se mantuvo dentro de su rango/i)).toBeTruthy();
    cleanup();

    /*
     * Una QUINTA que también se sale. Tiene que quedar por debajo de las cuatro
     * primeras: si se moviera más que ellas entraría en la rejilla y no probaría
     * nada — z aquí es 6, frente a 25/15/12/8 de las que sí son tarjeta.
     */
    sesion.set("p2p_vwap_buy", serie(["850", "856"]));
    render(<SessionMovers sesion={sesion} historia={historial} />);

    expect(screen.queryByText(/el resto se mantuvo/i)).toBeNull();
    expect(screen.getByText(/también se salieron de su rango/i)).toBeTruthy();
  });

  it("el borde coral es del movimiento adverso, no de cualquier movimiento", () => {
    const sesion = new Map([
      ["p2p_brecha_pct_buy", serie(["12", "18"])], // la brecha se abre: adverso
      ["p2p_mediana_buy", serie(["850", "870"])], // sin lectura establecida
    ]);
    const historial = new Map([
      ["p2p_brecha_pct_buy", historia(12, 0.5)],
      ["p2p_mediana_buy", historia(850, 1)],
    ]);
    render(<SessionMovers sesion={sesion} historia={historial} />);

    const tarjetas = [...document.querySelectorAll(".vmw-movio__tarjeta")];
    const porAdverso = Object.fromEntries(
      tarjetas.map((t) => [
        t.querySelector(".vmw-movio__metrica")?.textContent ?? "",
        t.getAttribute("data-adverso"),
      ]),
    );
    expect(Object.values(porAdverso)).toContain("si");
    expect(Object.values(porAdverso)).toContain("no");
  });

  it("la nota dice qué implica el movimiento, no solo que lo hubo", () => {
    const sesion = new Map([["p2p_brecha_pct_buy", serie(["12", "18"])]]);
    const historial = new Map([["p2p_brecha_pct_buy", historia(12, 0.5)]]);
    render(<SessionMovers sesion={sesion} historia={historial} />);

    const nota = document.querySelector(".vmw-movio__nota")!.textContent!;
    expect(nota).toMatch(/la brecha se abrió/i);
    // Y la magnitud, que es lo que justifica que esta serie esté en la rejilla.
    expect(nota).toMatch(/veces su variación típica/i);
  });

  it("una serie que llevaba una semana quieta lo dice con esas palabras", () => {
    const sesion = new Map([["p2p_outliers_pct_buy", serie(["0", "3"])]]);
    const historial = new Map([["p2p_outliers_pct_buy", historia(0, 0)]]);
    render(<SessionMovers sesion={sesion} historia={historial} />);

    expect(screen.getByText(/no se había movido en los últimos 7 días/i)).toBeTruthy();
  });

  it("el pie ancla la lectura entre la apertura y el ahora", () => {
    const { sesion, historial } = escenario();
    render(<SessionMovers sesion={sesion} historia={historial} />);

    const pie = document.querySelector(".vmw-movio__pie")!.textContent!;
    expect(pie).toMatch(/apertura/i);
    expect(pie).toMatch(/ahora/i);
  });

  it("sin ventana de referencia no se pinta: no hay con qué normalizar", () => {
    const { sesion } = escenario();
    render(<SessionMovers sesion={sesion} historia={new Map()} />);

    expect(document.querySelector(".vmw-movio__rejilla")).toBeNull();
  });
});
