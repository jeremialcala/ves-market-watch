/** IntradayView con recharts stubbeado (jsdom no hace layout): se prueba el
 * agrupado por familia, la Δ contra la apertura y los estados vacío/error —
 * no el dibujo SVG. */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ReactNode } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { config } from "../../src/config";
import { limpiarTokenDeTest, registrarTokenDeTest } from "../soporte";

vi.mock("recharts", () => {
  const Caja = ({ children }: { children?: ReactNode }) => (
    <div data-testid="chart">{children}</div>
  );
  const Hoja = () => null;
  return {
    ResponsiveContainer: Caja,
    LineChart: ({ data, children }: { data: unknown[]; children?: ReactNode }) => (
      <div data-testid="linechart" data-puntos={JSON.stringify(data)}>
        {children}
      </div>
    ),
    Line: Hoja,
    XAxis: Hoja,
    YAxis: Hoja,
    Tooltip: Hoja,
    ReferenceLine: Hoja,
  };
});

import { IntradayView } from "../../src/views/IntradayView";

const BASE = `${config.apiBaseUrl}/api/v1`;
const servidor = setupServer();

beforeAll(() => {
  servidor.listen({ onUnhandledRequest: "error" });
  registrarTokenDeTest();
});
afterEach(() => {
  cleanup();
  servidor.resetHandlers();
});
afterAll(() => {
  servidor.close();
  limpiarTokenDeTest();
});

function fila(indicador: string, moneda: string, valor: string, hora: string) {
  return {
    as_of: `2026-07-28T${hora}:00Z`,
    indicator: indicador,
    currency: moneda,
    value: valor,
    calc_version: 1,
  };
}

/** El gateway responde por moneda y en orden DESC: el handler lo emula. */
function conSeries() {
  servidor.use(
    http.get(`${BASE}/indicators/history`, ({ request }) => {
      const moneda = new URL(request.url).searchParams.get("currency");
      const data =
        moneda === "VES"
          ? [
              fila("p2p_mediana_buy", "VES", "120", "13:00"),
              fila("p2p_mediana_buy", "VES", "100", "04:00"),
              fila("p2p_mediana_sell", "VES", "95", "13:00"),
              fila("p2p_mediana_sell", "VES", "100", "04:00"),
              fila("p2p_spread_pct", "VES", "2.5", "13:00"),
              fila("p2p_spread_pct", "VES", "2.5", "04:00"),
            ]
          : [fila("official_rate", "USD", "417.03", "04:00")];
      return HttpResponse.json({
        data,
        pagination: {
          page: 1,
          page_size: 500,
          total_items: data.length,
          has_more: false,
        },
        interval: "5m",
      });
    }),
  );
}

describe("IntradayView", () => {
  it("agrupa por familia y mide la Δ contra la apertura del día", async () => {
    conSeries();
    render(<IntradayView />);

    await waitFor(() =>
      expect(screen.getByLabelText("P2P — compra (buy)")).toBeTruthy(),
    );
    expect(screen.getByLabelText("P2P — venta (sell)")).toBeTruthy();
    expect(screen.getByLabelText("Tasa oficial (BCV)")).toBeTruthy();
    expect(screen.getByLabelText("Microestructura")).toBeTruthy();

    // La Δ va contra la apertura (100), no contra el bucket previo, y el
    // resumen accesible lleva apertura + último + variación.
    expect(
      screen.getByLabelText("Mediana: apertura 100, último 120, variación +20 (+20 %)"),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Mediana: apertura 100, último 95, variación -5 (-5 %)"),
    ).toBeTruthy();
    // Día plano: variación cero, sin signo inventado.
    expect(
      screen.getByLabelText("Spread: apertura 2,5, último 2,5, variación 0 (0 %)"),
    ).toBeTruthy();
  });

  it("pasa al gráfico el string decimal exacto, no solo la coordenada", async () => {
    conSeries();
    render(<IntradayView />);

    await waitFor(() => expect(screen.getAllByTestId("linechart").length).toBe(4));
    const puntos = JSON.parse(
      screen.getAllByTestId("linechart")[0].dataset.puntos ?? "[]",
    ) as { valor: number; valorStr: string }[];
    // El primer panel es el de la tasa oficial (grupo «oficial» va primero).
    expect(puntos).toEqual([
      { t: Date.parse("2026-07-28T04:00:00Z"), valor: 417.03, valorStr: "417.03" },
    ]);
  });

  it("un indicador desconocido se dibuja igual, con su nombre canónico", async () => {
    servidor.use(
      http.get(`${BASE}/indicators/history`, ({ request }) => {
        const moneda = new URL(request.url).searchParams.get("currency");
        const data =
          moneda === "VES" ? [fila("p2p_metrica_nueva_buy", "VES", "7", "04:00")] : [];
        return HttpResponse.json({
          data,
          pagination: {
            page: 1,
            page_size: 500,
            total_items: data.length,
            has_more: false,
          },
          interval: "5m",
        });
      }),
    );
    render(<IntradayView />);
    await waitFor(() =>
      expect(screen.getByText("p2p_metrica_nueva_buy")).toBeTruthy(),
    );
  });

  it("sin datos del día lo dice, en vez de mostrar una parrilla vacía", async () => {
    servidor.use(
      http.get(`${BASE}/indicators/history`, () =>
        HttpResponse.json({
          data: [],
          pagination: { page: 1, page_size: 500, total_items: 0, has_more: false },
          interval: "5m",
        }),
      ),
    );
    render(<IntradayView />);
    await waitFor(() =>
      expect(screen.getByText(/todavía no hay indicadores/i)).toBeTruthy(),
    );
  });

  it("un problem+json del gateway se muestra como error, sin romper la vista", async () => {
    servidor.use(
      http.get(`${BASE}/indicators/history`, () =>
        HttpResponse.json(
          { title: "Rango no procesable", status: 422 },
          { status: 422, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    render(<IntradayView />);
    await waitFor(() =>
      expect(screen.getByText(/rango no procesable/i)).toBeTruthy(),
    );
  });

  it("cambiar la moneda vuelve a pedir el intradía de esa moneda", async () => {
    const monedas: string[] = [];
    servidor.use(
      http.get(`${BASE}/indicators/history`, ({ request }) => {
        const moneda = new URL(request.url).searchParams.get("currency");
        if (moneda !== null && moneda !== "VES") {
          monedas.push(moneda);
        }
        return HttpResponse.json({
          data: [],
          pagination: { page: 1, page_size: 500, total_items: 0, has_more: false },
          interval: "5m",
        });
      }),
    );
    render(<IntradayView />);
    await waitFor(() => expect(monedas).toEqual(["USD"]));

    await userEvent.selectOptions(
      screen.getByLabelText("Moneda de la tasa oficial"),
      "EUR",
    );
    await waitFor(() => expect(monedas).toEqual(["USD", "EUR"]));
  });
});
