/** DepthChart y HistoryView con recharts stubbeado (jsdom no hace layout):
 * lo que se prueba es el mapeo de datos, los estados vacíos/error y la
 * paginación con progreso — no el dibujo SVG. */

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
import { marketStore } from "../../src/state/marketStore";
import { FIXTURE_PROFUNDIDAD, FIXTURE_TASA } from "../contract/fixtures.test";
import { limpiarTokenDeTest, registrarTokenDeTest } from "../soporte";

vi.mock("recharts", () => {
  const Caja = ({ children }: { children?: ReactNode }) => (
    <div data-testid="chart">{children}</div>
  );
  const Hoja = () => null;
  return {
    ResponsiveContainer: Caja,
    BarChart: ({ data, children }: { data: unknown[]; children?: ReactNode }) => (
      <div data-testid="barchart" data-puntos={JSON.stringify(data)}>
        {children}
      </div>
    ),
    LineChart: ({ data, children }: { data: unknown[]; children?: ReactNode }) => (
      <div data-testid="linechart" data-puntos={JSON.stringify(data)}>
        {children}
      </div>
    ),
    Bar: Hoja,
    Line: Hoja,
    XAxis: Hoja,
    YAxis: Hoja,
    CartesianGrid: Hoja,
    Tooltip: Hoja,
  };
});

import { DepthChart } from "../../src/components/DepthChart";
import { HistoryView } from "../../src/views/HistoryView";

const BASE = `${config.apiBaseUrl}/api/v1`;
const servidor = setupServer();

beforeAll(() => {
  servidor.listen({ onUnhandledRequest: "error" });
  registrarTokenDeTest();
});
afterEach(() => {
  cleanup();
  servidor.resetHandlers();
  marketStore.reset();
});
afterAll(() => {
  servidor.close();
  limpiarTokenDeTest();
});

describe("DepthChart", () => {
  it("mapea niveles a puntos de gráfico y marca el lado faltante", () => {
    marketStore.profundidad("buy", FIXTURE_PROFUNDIDAD);
    render(<DepthChart />);
    const barchart = screen.getByTestId("barchart");
    const puntos = JSON.parse(barchart.dataset.puntos ?? "[]") as {
      volumen: number;
      volumenStr: string;
    }[];
    expect(puntos).toHaveLength(2);
    expect(puntos[1].volumen).toBe(120000);
    expect(puntos[1].volumenStr).toBe("120000"); // string exacto para tooltip
    expect(screen.getByText(/sin snapshot del lado sell/i)).toBeTruthy();
  });
});

describe("HistoryView", () => {
  function conHandlers() {
    servidor.use(
      http.get(`${BASE}/rates/official/history`, () =>
        HttpResponse.json({
          data: [
            {
              currency: "USD",
              rate: FIXTURE_TASA.rate,
              value_date: "2026-07-26",
              captured_at: "2026-07-26T12:00:00Z",
            },
          ],
          pagination: { page: 1, page_size: 500, total_items: 1, has_more: false },
        }),
      ),
      http.get(`${BASE}/indicators/history`, ({ request }) => {
        // el filtro ahora es del SERVIDOR: el handler lo emula
        const filtro = new URL(request.url).searchParams.get("indicator");
        const todas = [
          {
            as_of: "2026-07-26T12:00:00Z",
            indicator: "p2p_brecha_pct_buy",
            currency: "VES",
            value: "103.83000000",
            calc_version: 1,
          },
          {
            as_of: "2026-07-26T13:00:00Z",
            indicator: "official_rate",
            currency: "USD",
            value: "417.03000000",
            calc_version: 1,
          },
        ];
        const data = todas.filter(
          (fila) => filtro === null || fila.indicator === filtro,
        );
        return HttpResponse.json({
          data,
          pagination: {
            page: 1,
            page_size: 500,
            total_items: data.length,
            has_more: false,
          },
          interval: "1h",
        });
      }),
    );
  }

  it("carga ambas series, filtra por indicador y reporta el progreso", async () => {
    conHandlers();
    render(<HistoryView />);
    await waitFor(() => {
      expect(screen.getAllByTestId("linechart")).toHaveLength(2);
    });
    const [tasas, serie] = screen.getAllByTestId("linechart");
    expect(JSON.parse(tasas.dataset.puntos ?? "[]")).toHaveLength(1);
    // del histórico solo quedan las filas del indicador seleccionado
    const puntosSerie = JSON.parse(serie.dataset.puntos ?? "[]") as {
      valorStr: string;
    }[];
    expect(puntosSerie).toHaveLength(1);
    expect(puntosSerie[0].valorStr).toBe("103.83000000");
    // el indicador de progreso se limpia al terminar la carga (por diseño)
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("un error del gateway se muestra sin romper la vista", async () => {
    servidor.use(
      http.get(`${BASE}/rates/official/history`, () =>
        HttpResponse.json(
          { title: "Demasiadas peticiones", status: 429, detail: "espere" },
          {
            status: 429,
            headers: {
              "content-type": "application/problem+json",
              // el cliente reintenta UNA vez respetando Retry-After; con 0 el
              // segundo 429 emerge de inmediato como error visible
              "Retry-After": "0",
            },
          },
        ),
      ),
      http.get(`${BASE}/indicators/history`, () =>
        HttpResponse.json({
          data: [],
          pagination: { page: 1, page_size: 500, total_items: 0, has_more: false },
          interval: "1h",
        }),
      ),
    );
    render(<HistoryView />);
    await waitFor(() => {
      expect(screen.getByText("espere")).toBeTruthy();
    });
  });

  it("cambiar el preset re-consulta el rango", async () => {
    conHandlers();
    const usuario = userEvent.setup();
    render(<HistoryView />);
    await waitFor(() =>
      expect(screen.getAllByTestId("linechart")).toHaveLength(2),
    );
    let rangos: number[] = [];
    servidor.use(
      http.get(`${BASE}/rates/official/history`, ({ request }) => {
        const q = new URL(request.url).searchParams;
        rangos.push(
          (Date.parse(`${q.get("to")}T00:00:00Z`) -
            Date.parse(`${q.get("from")}T00:00:00Z`)) /
            86_400_000,
        );
        return HttpResponse.json({
          data: [],
          pagination: { page: 1, page_size: 500, total_items: 0, has_more: false },
        });
      }),
    );
    await usuario.click(screen.getByRole("button", { name: "90 días" }));
    await waitFor(() => expect(rangos.length).toBeGreaterThan(0));
    expect(Math.round(rangos[0])).toBe(90);
  });
});
