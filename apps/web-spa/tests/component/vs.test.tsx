/**
 * «Compra vs. venta, métrica por métrica».
 *
 * Lo que se fija: que las filas se DERIVEN de las series —RF-7 promete que un
 * indicador nuevo del motor aparece sin tocar el front—, que un lado ausente se
 * diga en vez de rellenarse, y que el signo de la Δ vaya escrito, porque el
 * color de dirección comparte tonos con las cabeceras de lado.
 */

import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SideBySide } from "../../src/components/SideBySide";
import type { PuntoIntradia } from "../../src/lib/intradia";
import { renderConProveedores as render } from "../render";

afterEach(cleanup);

const T0 = Date.parse("2026-08-06T04:00:00Z");

function serie(valores: string[]): PuntoIntradia[] {
  return valores.map((valor, i) => ({ t: T0 + i * 300_000, valor }));
}

function filas() {
  return [...document.querySelectorAll(".vmw-vs__fila")];
}

describe("SideBySide", () => {
  it("una fila por métrica, con los dos lados en la misma línea", () => {
    render(
      <SideBySide
        series={
          new Map([
            ["p2p_mediana_buy", serie(["100", "120"])],
            ["p2p_mediana_sell", serie(["100", "95"])],
            ["p2p_liquidez_buy", serie(["1000", "1200"])],
            ["p2p_liquidez_sell", serie(["2000", "2500"])],
          ])
        }
      />,
    );

    expect(filas()).toHaveLength(2);
    // El orden es el declarado: liquidez antes que mediana.
    expect(filas()[0].querySelector(".vmw-vs__clave")?.textContent).toBe(
      "p2p_liquidez",
    );
  });

  it("un indicador desconocido aparece igual, con su clave canónica", () => {
    /*
     * La promesa de RF-7: el motor publica una métrica nueva y el front la
     * pinta sin cambios. Una lista fija de ocho la habría escondido en silencio.
     */
    render(
      <SideBySide
        series={
          new Map([
            ["p2p_metrica_nueva_buy", serie(["1", "2"])],
            ["p2p_metrica_nueva_sell", serie(["3", "4"])],
          ])
        }
      />,
    );

    expect(filas()).toHaveLength(1);
    expect(screen.getByText("p2p_metrica_nueva")).toBeTruthy();
  });

  it("las métricas conocidas van antes que las nuevas", () => {
    render(
      <SideBySide
        series={
          new Map([
            ["p2p_zzz_nueva_buy", serie(["1", "2"])],
            ["p2p_vwap_buy", serie(["10", "12"])],
          ])
        }
      />,
    );

    expect(filas().map((f) => f.querySelector(".vmw-vs__clave")?.textContent)).toEqual(
      ["p2p_vwap", "p2p_zzz_nueva"],
    );
  });

  it("un lado sin serie se DICE, no se rellena", () => {
    /*
     * Copiar el otro lado o poner un cero se leería como «no se movió», que es
     * una afirmación sobre un dato que no existe.
     */
    render(
      <SideBySide series={new Map([["p2p_vwap_buy", serie(["10", "12"])]])} />,
    );

    const celdas = [...filas()[0].querySelectorAll(".vmw-vs__celda")];
    expect(celdas[0].textContent).toContain("12");
    expect(celdas[1].textContent).toMatch(/sin serie de este lado/i);
  });

  it("el signo de la Δ va escrito, no solo en el color", () => {
    /*
     * En este bloque teal y coral encabezan las columnas (el lado) Y colorean la
     * Δ (la dirección). Con dos significados para el mismo par de tonos, el
     * signo escrito es lo que hace la celda legible por sí sola.
     */
    render(
      <SideBySide
        series={
          new Map([
            ["p2p_vwap_buy", serie(["10", "12"])],
            ["p2p_vwap_sell", serie(["10", "8"])],
          ])
        }
      />,
    );

    const deltas = [...document.querySelectorAll(".vmw-vs__delta")].map(
      (d) => d.textContent ?? "",
    );
    expect(deltas[0].startsWith("+")).toBe(true);
    // Menos tipográfico U+2212, jamás el guion ASCII.
    expect(deltas[1].startsWith("−")).toBe(true);
    expect(deltas[1]).not.toContain("-");
  });

  it("un día plano lo DICE, no imprime un «0 (0 %)»", () => {
    /*
     * Un cero con su porcentaje se lee como una medición; «sin cambio» se lee
     * como lo que es. Y va en tinta apagada, no en el color de una dirección
     * que no existe.
     */
    render(
      <SideBySide series={new Map([["p2p_vwap_buy", serie(["10", "10"])]])} />,
    );

    const delta = document.querySelector(".vmw-vs__delta") as HTMLElement;
    expect(delta.textContent).toBe("— sin cambio");
    expect(delta.style.color).toBe("var(--dir-neutral)");
  });

  it("la nota de contexto cruza la fila entera y solo donde hace falta", () => {
    render(
      <SideBySide
        series={
          new Map([
            ["p2p_mejor_precio_buy", serie(["100", "120"])],
            ["p2p_vwap_buy", serie(["10", "12"])],
          ])
        }
      />,
    );

    // «Mejor precio» avisa de que no pasa por el filtro de outliers; VWAP no la
    // necesita, y una nota en cada fila deja de leerse.
    const notas = [...document.querySelectorAll(".vmw-vs__nota")];
    expect(notas).toHaveLength(1);
    expect(notas[0].textContent).toMatch(/filtro de outliers/i);
  });

  it("sin series de lado no se pinta la tabla", () => {
    render(
      <SideBySide series={new Map([["official_rate", serie(["1", "2"])]])} />,
    );

    expect(document.querySelector(".vmw-vs")).toBeNull();
  });

  it("las cabeceras nombran el lado: ya no hacen falta pastillas", () => {
    render(
      <SideBySide series={new Map([["p2p_vwap_buy", serie(["10", "12"])]])} />,
    );

    expect(screen.getByText("Compra (buy)")).toBeTruthy();
    expect(screen.getByText("Venta (sell)")).toBeTruthy();
    expect(screen.getByText("Métrica")).toBeTruthy();
  });
});
