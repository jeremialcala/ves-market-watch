/** DepthChart y HistoryView con recharts stubbeado (jsdom no hace layout):
 * lo que se prueba es el mapeo de datos, los estados vacíos/error y la
 * paginación con progreso — no el dibujo SVG. */

import { cleanup, screen, waitFor } from "@testing-library/react";
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

import { renderConProveedores as render } from "../render";

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
  // El rediseño cambió las barras de recharts por barras del sistema: lo que
  // se comprueba ahora es el string exacto por banda y el ancho relativo al
  // volumen acumulado mayor, no el mapeo a coordenadas.
  it("pinta una barra por banda con su volumen exacto y marca el lado faltante", () => {
    marketStore.profundidad("buy", FIXTURE_PROFUNDIDAD);
    render(<DepthChart />);

    expect(screen.getByText("854,2")).toBeTruthy();
    expect(screen.getByText("858,5")).toBeTruthy();
    expect(screen.getByText("50.000")).toBeTruthy();
    // El total del lado (último acumulado) sale en la cabecera y en la barra.
    expect(screen.getAllByText(/120\.000/).length).toBeGreaterThan(0);

    const barras = document.querySelectorAll<HTMLElement>(
      ".vmw-profundidad__fila .vmw-barra__relleno",
    );
    expect(barras).toHaveLength(2);
    expect(barras[1].style.width).toBe("100%"); // el mayor acumulado
    expect(barras[0].style.width).toBe("41.7%"); // 50.000 / 120.000

    expect(screen.getByText(/sin profundidad servida/i)).toBeTruthy();
  });

  it("los dos lados comparten escala: el libro más fino se ve más fino", () => {
    /*
     * Escalando cada lado contra su propio total, la última barra siempre llena
     * el ancho y dos libros que difieren en tres órdenes de magnitud salen
     * idénticos. Pasó el 2026-08-06 —651.963 USDT de compra y 372 de venta con
     * la misma pinta—, y las cifras exactas al lado no lo arreglan: un small
     * multiple invita a comparar las barras, no a leer los números.
     */
    marketStore.profundidad("buy", {
      side: "buy",
      as_of: "2026-08-06T12:00:00Z",
      levels: [{ price_band: "850.0", cum_volume: "1000000" }],
    });
    marketStore.profundidad("sell", {
      side: "sell",
      as_of: "2026-08-06T12:00:00Z",
      levels: [{ price_band: "845.0", cum_volume: "1000" }],
    });
    render(<DepthChart />);

    const barras = document.querySelectorAll<HTMLElement>(
      ".vmw-profundidad__fila .vmw-barra__relleno",
    );
    expect(barras).toHaveLength(2);
    expect(barras[0].style.width).toBe("100%"); // compra: el mayor de los dos
    expect(barras[1].style.width).toBe("0.1%"); // venta: mil sobre un millón
  });

  it("un volumen despreciable se ve poco, no desaparece", () => {
    /*
     * Con escala compartida, 200 USDT sobre 3 M redondean a 0,0 % y la barra se
     * queda sin ancho. «Poco» y «nada» tienen que verse distinto: es la misma
     * regla que el hueco sin dato del mapa de calor.
     */
    marketStore.profundidad("buy", {
      side: "buy",
      as_of: "2026-08-06T12:00:00Z",
      levels: [
        { price_band: "851.2", cum_volume: "200" },
        { price_band: "855.4", cum_volume: "3000000" },
      ],
    });
    render(<DepthChart />);

    const barras = document.querySelectorAll<HTMLElement>(
      ".vmw-profundidad__fila .vmw-barra__relleno",
    );
    expect(barras[0].style.width).toBe("0%");
    expect(barras[0].style.minWidth).toBe("2px"); // pero se ve
    expect(barras[1].style.minWidth).toBe("2px");
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
