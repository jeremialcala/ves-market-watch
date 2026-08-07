/**
 * «Cronología de la sesión» — lo que pinta.
 *
 * El criterio vive en `unit/cronologia.test.ts`. Aquí se fija que cada clase de
 * evento se distinga por algo MÁS que el color, que las cifras del momento
 * acompañen al titular, y que el hilo termine donde termina la sesión.
 */

import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SessionTimeline } from "../../src/components/SessionTimeline";
import { MUESTRAS_MINIMAS_SIGMA } from "../../src/lib/movimiento";
import type { PuntoIntradia } from "../../src/lib/intradia";
import { renderConProveedores as render } from "../render";

afterEach(cleanup);

const T0 = Date.parse("2026-08-06T04:00:00Z"); // 00:00 VET
const PASO = 3_600_000;

function serie(valores: string[]): PuntoIntradia[] {
  return valores.map((valor, i) => ({ t: T0 + i * PASO, valor }));
}

const ANALISIS = {
  as_of: new Date(T0 + 5 * PASO).toISOString(),
  rule_proximity: [
    {
      rule: "arranque_alcista@v1",
      conditions: [
        {
          indicator: "p2p_momentum_bid_3h_pct",
          op: "gt" as const,
          threshold: "0.5",
        },
      ],
    },
  ],
};

/** Sesión con un cruce sostenido y un salto de liquidez. */
function escenario() {
  const sesion = new Map([
    ["p2p_momentum_bid_3h_pct", serie(["0.2", "0.7", "0.8", "0.9", "0.9", "0.9"])],
    [
      "p2p_liquidez_sell",
      serie(["1000000", "1010000", "1500000", "1510000", "1520000", "1530000"]),
    ],
  ]);
  const referencia = new Map([
    [
      "p2p_liquidez_sell",
      serie(
        Array.from({ length: MUESTRAS_MINIMAS_SIGMA + 1 }, (_, i) =>
          String(1_000_000 + (i % 2 === 0 ? 0 : 100_000)),
        ),
      ),
    ],
  ]);
  return { sesion, referencia };
}

describe("SessionTimeline", () => {
  it("cada clase de evento se distingue por su TÍTULO, no solo por el color", () => {
    /*
     * El punto es coral, teal, salvia o tinta según la clase, pero el color no
     * puede ser la única pista: quien no lo distinga tiene que poder leer qué
     * pasó.
     */
    const { sesion, referencia } = escenario();
    render(
      <SessionTimeline
        sesion={sesion}
        referencia={referencia}
        analisis={ANALISIS}
      />,
    );

    expect(screen.getByText("Apertura de la sesión")).toBeTruthy();
    expect(screen.getByText("Umbral del ruleset cruzado")).toBeTruthy();
    expect(screen.getByText("Salto de liquidez")).toBeTruthy();
    expect(screen.getByText("Último recálculo")).toBeTruthy();
  });

  it("un cruce nombra su regla, su valor y el umbral contra el que se midió", () => {
    /*
     * Sin la regla, dos cruces del mismo indicador contra umbrales distintos se
     * leen como una línea repetida — pasó en vivo con el ratio, que tiene tres
     * condiciones en tres reglas.
     */
    const { sesion, referencia } = escenario();
    render(
      <SessionTimeline
        sesion={sesion}
        referencia={referencia}
        analisis={ANALISIS}
      />,
    );

    const cifras = [...document.querySelectorAll(".vmw-crono__cifras")].map(
      (c) => c.textContent ?? "",
    );
    const cruce = cifras.find((c) => c.includes("p2p_momentum_bid_3h_pct"))!;
    expect(cruce).toContain("arranque_alcista@v1");
    expect(cruce).toContain("umbral 0.5");
  });

  it("un salto de liquidez dice cuánto y cuántas σ, con el signo escrito", () => {
    const { sesion, referencia } = escenario();
    render(
      <SessionTimeline
        sesion={sesion}
        referencia={referencia}
        analisis={ANALISIS}
      />,
    );

    const cifras = [...document.querySelectorAll(".vmw-crono__cifras")].map(
      (c) => c.textContent ?? "",
    );
    const salto = cifras.find((c) => c.includes("USDT"))!;
    // El color refuerza el sentido; el signo va escrito.
    expect(salto).toMatch(/\+/);
    expect(salto).toMatch(/σ/);
  });

  it("la hora va en VET, que es la del día operativo", () => {
    const { sesion, referencia } = escenario();
    render(
      <SessionTimeline
        sesion={sesion}
        referencia={referencia}
        analisis={ANALISIS}
      />,
    );

    // T0 son las 04:00 UTC = 00:00 en Caracas.
    expect(document.querySelector(".vmw-crono__hora")?.textContent).toBe("00:00");
  });

  it("el hilo termina donde termina la sesión", () => {
    /*
     * El último evento no arrastra línea ni hueco: cerrar el bloque con un hilo
     * colgando sugiere un evento que no llegó.
     */
    const { sesion, referencia } = escenario();
    render(
      <SessionTimeline
        sesion={sesion}
        referencia={referencia}
        analisis={ANALISIS}
      />,
    );

    const eventos = [...document.querySelectorAll(".vmw-crono__evento")];
    expect(eventos.at(-1)?.getAttribute("data-ultimo")).toBe("si");
    expect(eventos[0].getAttribute("data-ultimo")).toBe("no");
  });

  it("sin eventos no se pinta una cronología vacía", () => {
    /*
     * Un bloque con «sin novedad» invita a creer que se vigiló algo; si no hay
     * series, no hay nada que se haya vigilado.
     */
    render(
      <SessionTimeline
        sesion={new Map()}
        referencia={new Map()}
        analisis={ANALISIS}
      />,
    );

    expect(document.querySelector(".vmw-crono")).toBeNull();
  });

  it("sin análisis quedan los eventos que no dependen de él", () => {
    const { sesion, referencia } = escenario();
    render(
      <SessionTimeline sesion={sesion} referencia={referencia} analisis={null} />,
    );

    expect(screen.getByText("Apertura de la sesión")).toBeTruthy();
    expect(screen.getByText("Salto de liquidez")).toBeTruthy();
    expect(screen.queryByText("Umbral del ruleset cruzado")).toBeNull();
    expect(screen.queryByText("Último recálculo")).toBeNull();
  });

  it("un salto de liquidez del lado compra se nombra como tal", () => {
    const sesion = new Map([
      [
        "p2p_liquidez_buy",
        serie(["1000000", "1500000", "1510000", "1520000", "1530000"]),
      ],
    ]);
    const referencia = new Map([
      [
        "p2p_liquidez_buy",
        serie(
          Array.from({ length: MUESTRAS_MINIMAS_SIGMA + 1 }, (_, i) =>
            String(1_000_000 + (i % 2 === 0 ? 0 : 100_000)),
          ),
        ),
      ],
    ]);
    render(
      <SessionTimeline sesion={sesion} referencia={referencia} analisis={null} />,
    );

    const texto = document.querySelector(".vmw-crono__texto:last-of-type");
    expect(
      [...document.querySelectorAll(".vmw-crono__texto")].some((t) =>
        /compra/.test(t.textContent ?? ""),
      ),
    ).toBe(true);
    expect(texto).toBeTruthy();
  });
});
