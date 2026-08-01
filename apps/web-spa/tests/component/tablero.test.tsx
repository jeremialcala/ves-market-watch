/**
 * Secciones nuevas del rediseño.
 *
 * Lo que se comprueba en cada una es de qué lado cae: las que salen del
 * gateway muestran el dato real (y su vacío honesto cuando no hay), y las que
 * el diseño pide pero la plataforma no calcula llevan el sello «demo · sin
 * fuente» — la regla RF-5 aplicada al rediseño.
 */

import { cleanup, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { GapDecomposition } from "../../src/components/GapDecomposition";
import { GapHeatmap } from "../../src/components/GapHeatmap";
import { MarketRegimeCard } from "../../src/components/MarketRegimeCard";
import { config } from "../../src/config";
import { marketStore } from "../../src/state/marketStore";
import { AnalysisView } from "../../src/views/AnalysisView";
import { FIXTURE_INDICADORES } from "../contract/fixtures.test";
import { renderConProveedores as render } from "../render";
import { limpiarTokenDeTest, registrarTokenDeTest } from "../soporte";

const BASE = `${config.apiBaseUrl}/api/v1`;
const servidor = setupServer();

/** Una fila por hora hacia atrás desde ahora, con valores que suben. */
function serieHoraria(horas: number) {
  const ahora = Date.now();
  return Array.from({ length: horas }, (_, i) => ({
    as_of: new Date(ahora - i * 3_600_000).toISOString(),
    indicator: "p2p_brecha_pct_buy",
    currency: "VES",
    value: `${(12 + i * 0.1).toFixed(2)}`,
    calc_version: 1,
  }));
}

function conHistorial(filas: ReturnType<typeof serieHoraria>) {
  servidor.use(
    http.get(`${BASE}/indicators/history`, () =>
      HttpResponse.json({
        data: filas,
        pagination: {
          page: 1,
          page_size: 500,
          total_items: filas.length,
          has_more: false,
        },
        interval: "1h",
      }),
    ),
  );
}

beforeAll(() => {
  servidor.listen({ onUnhandledRequest: "error" });
  registrarTokenDeTest();
});
afterEach(() => {
  cleanup();
  servidor.resetHandlers();
  marketStore.reset();
  window.localStorage.clear();
});
afterAll(() => {
  servidor.close();
  limpiarTokenDeTest();
});

// El panel de medidores tiene su propia suite: `tests/component/medidores.test.tsx`.

// La lectura del mercado tiene su propia suite: `tests/component/lectura.test.tsx`.

describe("MarketRegimeCard", () => {
  it("sin lectura lo dice, y deja los dos indicadores reales al lado", () => {
    marketStore.push({
      topic: "indicators",
      event_id: "evento-regimen",
      occurred_at: "2026-07-30T12:00:00Z",
      data: {
        as_of: "2026-07-30T12:00:00Z",
        calc_version: 1,
        official_stale: false,
        triggered_by: "11111111-2222-3333-4444-555555555555",
        indicators: [
          {
            indicator: "p2p_outliers_pct_buy",
            currency: "VES",
            value: "0.50000000",
          },
        ],
      },
    });
    render(<MarketRegimeCard />);
    // El régimen dejó de ser demo: sin lectura se dice, no se sella un ejemplo.
    expect(screen.queryByText("demo · sin fuente")).toBeNull();
    expect(screen.getByText(/sin lectura del mercado/i)).toBeTruthy();
    expect(screen.getByText("0,50 %")).toBeTruthy();
  });
});

describe("GapHeatmap", () => {
  it("pinta una celda por hora con su valor exacto en el tooltip", async () => {
    conHistorial(serieHoraria(30));
    render(<GapHeatmap />);

    await waitFor(() =>
      expect(document.querySelectorAll(".vmw-calor__fila").length).toBe(14),
    );
    const celdas = document.querySelectorAll(".vmw-calor__celda");
    expect(celdas).toHaveLength(14 * 24);
    const conDato = [...celdas].filter(
      (celda) => celda.getAttribute("style") !== null,
    );
    expect(conDato.length).toBeGreaterThan(0);
    expect(conDato[0].getAttribute("title")).toMatch(/\d+:00 —/);
    // Las horas sin bucket quedan vacías y lo dicen en el tooltip.
    const sinDato = [...celdas].find((celda) =>
      celda.getAttribute("title")?.includes("sin dato"),
    );
    expect(sinDato).toBeTruthy();
  });

  it("sin serie lo dice en vez de dibujar una parrilla vacía", async () => {
    conHistorial([]);
    render(<GapHeatmap />);
    await waitFor(() =>
      expect(screen.getByText(/sin serie horaria/i)).toBeTruthy(),
    );
  });
});

describe("GapDecomposition", () => {
  it("reparte el precio P2P entre pierna oficial y brecha, y compara con la historia", async () => {
    marketStore.resync({
      indicadores: FIXTURE_INDICADORES,
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
          side: "buy",
          best_price: "850.00",
          median: "850.00",
          vwap: "834.06",
          volume: "1000",
          as_of: new Date().toISOString(),
          confidence: "normal",
        },
      },
    });
    conHistorial(serieHoraria(48));
    render(<GapDecomposition />);

    // 417,03 / 834,06 = 50 % exacto para la pierna oficial.
    const barras = document.querySelectorAll<HTMLElement>(
      ".vmw-tarjeta div[style*='width: 50']",
    );
    expect(barras.length).toBeGreaterThan(0);
    expect(screen.getByText("pierna oficial")).toBeTruthy();

    await waitFor(() =>
      expect(screen.getByText("Promedio 7 días")).toBeTruthy(),
    );
    expect(screen.getByText("Máximo 90 días")).toBeTruthy();
  });

  it("sin tasa oficial ni VWAP no reparte nada y lo explica", () => {
    conHistorial([]);
    render(<GapDecomposition />);
    expect(screen.getByText(/hacen falta la tasa oficial/i)).toBeTruthy();
  });
});

describe("AnalysisView", () => {
  it("sella escenarios y riesgos, y calcula la presión de liquidez real", () => {
    marketStore.resync({
      indicadores: {
        ...FIXTURE_INDICADORES,
        volumes: { buy: "1201837", sell: "2025806" },
      },
    });
    render(<AnalysisView />);

    // Dos sellos: el de la cabecera (escenarios) y el de riesgos.
    expect(screen.getAllByText("demo · sin fuente")).toHaveLength(2);
    expect(screen.getByText("asks 1.201.837 USDT")).toBeTruthy();
    expect(screen.getByText("bids 2.025.806 USDT")).toBeTruthy();
  });

  it("sin liquidez servida lo dice en vez de dibujar una barra vacía", () => {
    marketStore.resync({
      indicadores: { ...FIXTURE_INDICADORES, volumes: null },
    });
    render(<AnalysisView />);
    expect(screen.getByText(/sin liquidez servida/i)).toBeTruthy();
  });
});
