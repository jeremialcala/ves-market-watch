/**
 * Las tarjetas de microestructura.
 *
 * Lo que se fija: que el color salga del ESTADO de la condición y no de la
 * sección, que sin análisis no se pinte ningún estado, y que la línea de disparo
 * comparta escala con la serie — sin eso, una chispa con el umbral recortado se
 * lee como si el disparo estuviera cerca.
 */

import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MicroCards } from "../../src/components/MicroCards";
import type { PuntoIntradia } from "../../src/lib/intradia";
import { renderConProveedores as render } from "../render";

afterEach(cleanup);

const T0 = Date.parse("2026-08-06T04:00:00Z");

function serie(valores: string[]): PuntoIntradia[] {
  return valores.map((valor, i) => ({ t: T0 + i * 300_000, valor }));
}

const ANALISIS = {
  summary: { closest_rule: "arranque_alcista@v1" },
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
  ],
};

const SERIES: Array<readonly [string, PuntoIntradia[]]> = [
  ["p2p_drenaje_oferta_6h_pct", serie(["-10", "-12"])],
  ["p2p_momentum_bid_3h_pct", serie(["0.2", "0.9"])],
];

function tarjetas() {
  return [...document.querySelectorAll(".vmw-metrica")];
}

describe("MicroCards", () => {
  it("el color lo decide el estado de la condición, no la sección", () => {
    render(<MicroCards indicadores={SERIES} analisis={ANALISIS} />);

    /*
     * Con la tarjeta comun, el estado vive en la PASTILLA —que lo dice con
     * palabras— y el borde coral solo marca el caso que cumple, que es el que
     * acerca una regla a disparar.
     */
    const [drenaje, momentum] = tarjetas();
    expect(momentum.getAttribute("data-tono")).toBe("alerta");
    expect(drenaje.getAttribute("data-tono")).toBe("neutro");

    const pastilla = (t: Element) => t.querySelector(".vmw-metrica__pastilla")!;
    expect(pastilla(momentum).textContent).toBe("Cumple");
    expect(pastilla(momentum).getAttribute("data-tono")).toBe("alerta");
    expect(pastilla(drenaje).textContent).toBe("No cumple");
    expect(pastilla(drenaje).getAttribute("data-tono")).toBe("calma");
  });

  it("nombra la regla y la posición de la condición dentro de ella", () => {
    /*
     * «Cumple» sin la regla no dice qué se cumple: el mismo indicador es
     * condición de tres reglas con tres umbrales.
     */
    render(<MicroCards indicadores={SERIES} analisis={ANALISIS} />);

    expect(
      tarjetas()[0].querySelector(".vmw-metrica__regla")?.textContent,
    ).toBe("arranque_alcista@v1 · condición 2 de 3");
  });

  it("el pie escribe la condición de disparo con su operador", () => {
    render(<MicroCards indicadores={SERIES} analisis={ANALISIS} />);

    expect(tarjetas()[0].querySelector(".vmw-metrica__pie")?.textContent).toContain(
      "dispara < −40 %",
    );
  });

  it("la línea de umbral comparte escala con la serie", () => {
    /*
     * El defecto que evita: con el dominio ajustado solo a la serie (−10 a −12),
     * un umbral de −40 cae fuera del lienzo y NO se dibuja. La chispa quedaría
     * sin línea de disparo y se leería como si el disparo estuviera al lado.
     */
    render(<MicroCards indicadores={SERIES} analisis={ANALISIS} />);

    const umbral = tarjetas()[0].querySelector("polyline[stroke-dasharray]")!;
    const y = Number(umbral.getAttribute("points")!.split(",")[1].split(" ")[0]);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(44);
    // Y la serie queda arriba, que es lo que significa estar lejos de disparar.
    const polilineas = tarjetas()[0].querySelectorAll("polyline");
    const traza = polilineas[polilineas.length - 1];
    const yes = traza
      .getAttribute("points")!
      .split(" ")
      .map((p) => Number(p.split(",")[1]));
    expect(Math.max(...yes)).toBeLessThan(y);
  });

  it("sin análisis no se pinta un estado que nadie ha calculado", () => {
    render(<MicroCards indicadores={SERIES} analisis={null} />);

    // Sin condicion no hay pastilla que poner: es la ausencia lo que lo dice.
    expect(tarjetas()[0].getAttribute("data-tono")).toBe("neutro");
    expect(document.querySelector(".vmw-metrica__pastilla")).toBeNull();
    expect(document.querySelector("polyline[stroke-dasharray]")).toBeNull();
    expect(
      tarjetas()[0].querySelector(".vmw-metrica__regla")?.textContent,
    ).toMatch(/no es condición de ninguna regla/i);
  });

  it("un indicador de microestructura fuera del ruleset aparece igual", () => {
    /*
     * RF-7: el motor publica una métrica nueva y la tarjeta sale sola. Lo que no
     * sale es un estado, porque no lo tiene.
     */
    render(
      <MicroCards
        indicadores={[["p2p_indicador_nuevo", serie(["1", "2"])]]}
        analisis={ANALISIS}
      />,
    );

    expect(tarjetas()).toHaveLength(1);
    expect(screen.getByTitle("p2p_indicador_nuevo")).toBeTruthy();
    expect(tarjetas()[0].getAttribute("data-tono")).toBe("neutro");
    expect(tarjetas()[0].querySelector(".vmw-metrica__pastilla")).toBeNull();
  });

  it("una serie sin datos del día lo dice, sin cifra inventada", () => {
    render(
      <MicroCards
        indicadores={[["p2p_spread_pct", []]]}
        analisis={ANALISIS}
      />,
    );

    expect(document.querySelector(".vmw-metrica__cifra")).toBeNull();
    expect(tarjetas()[0].textContent).toMatch(/sin datos/i);
  });

  it("la nota explica qué mide el indicador", () => {
    render(<MicroCards indicadores={SERIES} analisis={ANALISIS} />);

    expect(
      tarjetas()[0].querySelector(".vmw-metrica__nota")?.textContent,
    ).toMatch(/seis horas/i);
  });

  it("sin series no se pinta una sección vacía", () => {
    render(<MicroCards indicadores={[]} analisis={ANALISIS} />);

    expect(document.querySelector(".vmw-metrica__rejilla")).toBeNull();
  });
});
