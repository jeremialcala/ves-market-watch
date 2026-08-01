/**
 * Descomposición de la brecha (RF-12): historia por lado e interpretación.
 *
 * Lo que se vigila aquí, más que el render, es **que la etiqueta no mienta**.
 * La tarjeta rotulaba «Promedio 30 días» sobre 12 días de historia: el número
 * era real y la ventana no. `days_covered` es el mecanismo que lo corrige, y
 * estos tests son los que impiden que se pierda en un refactor.
 */

import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { GapDecomposition } from "../../src/components/GapDecomposition";
import { marketStore } from "../../src/state/marketStore";
import { FIXTURE_ANALISIS } from "../contract/fixtures.test";
import { renderConProveedores as render } from "../render";

afterEach(() => {
  cleanup();
  marketStore.reset();
  window.localStorage.clear();
});

const PIERNAS = {
  tasas: {
    USD: {
      currency: "USD",
      rate: "417.03",
      value_date: "2026-07-30",
      captured_at: new Date().toISOString(),
      stale: false,
    },
  },
  p2p: {
    buy: {
      side: "buy" as const,
      best_price: "850.00",
      median: "850.00",
      vwap: "834.06",
      volume: "1000",
      as_of: new Date().toISOString(),
      confidence: "normal" as const,
    },
  },
};

function ref(dias: number, cubiertos: number, mean: string, max: string) {
  return {
    days_configured: dias,
    days_covered: cubiertos,
    samples: 1000,
    mean,
    max,
    min: "10.00",
  };
}

/** El caso REAL medido en vivo: compra con 12 días, venta con 242. */
const LADOS = [
  {
    side: "buy" as const,
    current: "13.45",
    references: [
      ref(7, 7, "15.13", "17.73"),
      ref(30, 12, "16.22", "18.93"),
      ref(90, 12, "16.22", "18.93"),
    ],
  },
  {
    side: "sell" as const,
    current: "12.72",
    references: [
      ref(7, 7, "13.93", "16.98"),
      ref(30, 30, "15.00", "21.13"),
      ref(90, 90, "20.37", "44.06"),
    ],
  },
];

function conHistoria(sides = LADOS, claims = FIXTURE_ANALISIS.reading.claims) {
  marketStore.resync({
    ...PIERNAS,
    analisis: {
      ...FIXTURE_ANALISIS,
      reading: { ...FIXTURE_ANALISIS.reading, claims },
      gap_history: { sides },
    },
  });
}

describe("Descomposición de la brecha", () => {
  it("reparte el precio P2P en pierna oficial y brecha", () => {
    conHistoria();
    render(<GapDecomposition />);

    // 417,03 / 834,06 = 50 % exacto.
    expect(
      document.querySelectorAll<HTMLElement>("[style*='width: 50']").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("pierna oficial")).toBeTruthy();
  });

  it("muestra LOS DOS lados, cada uno contra su propia historia", () => {
    conHistoria();
    render(<GapDecomposition />);

    expect(screen.getByText("Compra")).toBeTruthy();
    expect(screen.getByText("Venta")).toBeTruthy();
    expect(screen.getByText("13,45 %")).toBeTruthy();
    expect(screen.getByText("12,72 %")).toBeTruthy();
  });

  it("ROTULA EL TRAMO REAL cuando la serie no llega a la ventana", () => {
    conHistoria();
    render(<GapDecomposition />);

    // Compra: 12 días de serie. La etiqueta lo dice en vez de llamarlo «30».
    expect(screen.getByText("Promedio 12 d (de 30)")).toBeTruthy();
    expect(screen.getByText("Máximo 12 d (de 90)")).toBeTruthy();
    // Venta: 242 días. Sus ventanas SÍ son las que dicen.
    expect(screen.getByText("Promedio 30 días")).toBeTruthy();
    expect(screen.getByText("Máximo 90 días")).toBeTruthy();
  });

  it("con la ventana completa NO aparece el rótulo parcial", () => {
    conHistoria([LADOS[1]]);
    render(<GapDecomposition />);
    expect(screen.queryByText(/de 30\)/)).toBeNull();
    expect(screen.queryByText(/empieza hace/)).toBeNull();
  });

  it("explica por qué un lado lleva tramos parciales", () => {
    conHistoria([LADOS[0]]);
    render(<GapDecomposition />);
    expect(screen.getByText(/La serie de este lado empieza hace 12 días/)).toBeTruthy();
  });

  it("la ventana ancha compara contra el MÁXIMO, no contra la media", () => {
    conHistoria([LADOS[1]]);
    render(<GapDecomposition />);
    // 44,06 es el máximo de 90 d; su media (20,37) no debe salir en esa fila.
    expect(screen.getByText("44,06 %")).toBeTruthy();
    expect(screen.queryByText("20,37 %")).toBeNull();
  });

  it("redacta la interpretación desde los claims del motor", () => {
    conHistoria(LADOS, [
      {
        code: "brecha_vs_historia",
        data: { lado: "buy", referencia: "media", dias: "7", posicion: "por_debajo", delta_pp: "1.68" },
      },
      {
        code: "brecha_vs_historia",
        data: { lado: "sell", referencia: "media", dias: "90", posicion: "por_debajo", delta_pp: "7.66" },
      },
    ]);
    render(<GapDecomposition />);

    const prosa = screen.getByText(/La brecha de compra/);
    expect(prosa.textContent).toContain(
      "La brecha de compra está 1,68 puntos por debajo de su promedio de 7 días.",
    );
    expect(prosa.textContent).toContain(
      "La brecha de venta está 7,66 puntos por debajo de su promedio de 90 días.",
    );
  });

  it("no repite aquí los claims que redacta la tarjeta de régimen", () => {
    conHistoria(LADOS, [
      { code: "oficial_rancia", data: {} },
      { code: "brecha", data: { direccion: "comprimiendo", delta_pp: "1.02", horas: "6" } },
    ]);
    render(<GapDecomposition />);
    expect(screen.queryByText(/La distancia entre el precio/)).toBeNull();
  });

  it("dice cuándo no hay historia suficiente ni para la ventana más corta", () => {
    conHistoria(LADOS, [
      { code: "historia_parcial", data: { lado: "buy", ventana: "90", dias: "1" } },
    ]);
    render(<GapDecomposition />);
    expect(
      screen.getByText(/solo hay 1 días de historia, todavía no bastan/),
    ).toBeTruthy();
  });

  it("sin gap_history lo dice en vez de dibujar barras vacías", () => {
    marketStore.resync({
      ...PIERNAS,
      analisis: { ...FIXTURE_ANALISIS, gap_history: undefined },
    });
    render(<GapDecomposition />);
    expect(screen.getByText(/Sin historia todavía para comparar/)).toBeTruthy();
  });

  it("sin tasa oficial ni VWAP no reparte nada y lo explica", () => {
    render(<GapDecomposition />);
    expect(screen.getByText(/hacen falta la tasa oficial/i)).toBeTruthy();
  });

  it("rotula el tramo real también en inglés", () => {
    conHistoria();
    render(<GapDecomposition />, { idioma: "en" });
    expect(screen.getByText("12-day average (of 30)")).toBeTruthy();
    expect(screen.getByText("90-day maximum")).toBeTruthy();
  });
});
