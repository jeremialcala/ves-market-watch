/** IntradayView con recharts stubbeado (jsdom no hace layout): se prueba el
 * agrupado por familia, la Δ contra la apertura y los estados vacío/error —
 * no el dibujo SVG. */

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

/**
 * Separa las dos consultas que hace la vista: la del día operativo y la ventana
 * de referencia de 7 días. Contarlas juntas escondía cuál se estaba repitiendo.
 */
function espiarPeticiones() {
  const monedasDelDia: string[] = [];
  const ventanas: { ms: number; intervalo: string | null }[] = [];
  servidor.use(
    http.get(`${BASE}/indicators/history`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const moneda = params.get("currency");
      const desde = Date.parse(params.get("from") ?? "");
      const hasta = Date.parse(params.get("to") ?? "");
      const ventana = hasta - desde;
      ventanas.push({ ms: ventana, intervalo: params.get("interval") });
      // Solo la del día operativo, y solo la moneda oficial (los p2p_* van en VES).
      if (moneda !== null && moneda !== "VES" && ventana < 2 * 86_400_000) {
        monedasDelDia.push(moneda);
      }
      return HttpResponse.json({
        data: [],
        pagination: { page: 1, page_size: 500, total_items: 0, has_more: false },
        interval: "5m",
      });
    }),
  );
  return { monedasDelDia, ventanas };
}

describe("IntradayView", () => {
  it("agrupa por familia y mide la Δ contra la apertura del día", async () => {
    conSeries();
    render(<IntradayView />);

    /*
     * Compra y venta ya no son dos parrillas: viven enfrentadas en la misma
     * fila, que es donde se pueden comparar. Los grupos sin contraparte
     * —oficial y microestructura— siguen como parrilla.
     */
    await waitFor(() =>
      expect(
        screen.getByLabelText("Compra vs. venta, métrica por métrica"),
      ).toBeTruthy(),
    );
    expect(screen.queryByLabelText("P2P — compra (buy)")).toBeNull();
    expect(screen.queryByLabelText("P2P — venta (sell)")).toBeNull();
    expect(screen.getByLabelText("Tasa oficial (BCV)")).toBeTruthy();
    expect(screen.getByLabelText("Microestructura")).toBeTruthy();

    // La Δ va contra la apertura (100), no contra el bucket previo, y cada lado
    // la lleva en su columna con el signo escrito.
    const fila = document.querySelector(".vmw-vs__fila")!;
    const [compra, venta] = [...fila.querySelectorAll(".vmw-vs__celda")];
    expect(compra.querySelector(".vmw-vs__valor")?.textContent).toBe("120");
    expect(compra.querySelector(".vmw-vs__delta")?.textContent).toBe("+20 (+20 %)");
    expect(venta.querySelector(".vmw-vs__valor")?.textContent).toBe("95");
    expect(venta.querySelector(".vmw-vs__delta")?.textContent).toBe("-5 (-5 %)");
    // Y la clave canónica de la métrica, sin maquillar.
    expect(fila.querySelector(".vmw-vs__clave")?.textContent).toBe("p2p_mediana");

    // Día plano en un grupo sin contraparte: variación cero, sin signo inventado.
    expect(
      screen.getByLabelText("Spread: apertura 2,5, último 2,5, variación 0 (0 %)"),
    ).toBeTruthy();
  });

  it("pasa al gráfico el string decimal exacto, no solo la coordenada", async () => {
    conSeries();
    render(<IntradayView />);

    /*
     * Solo quedan los paneles sin contraparte —tasa oficial y spread—: compra y
     * venta pasaron al bloque enfrentado, que dibuja su chispa en SVG propio.
     */
    await waitFor(() => expect(screen.getAllByTestId("linechart").length).toBe(2));
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
    const { monedasDelDia } = espiarPeticiones();
    render(<IntradayView />);
    await waitFor(() => expect(monedasDelDia).toEqual(["USD"]));

    await userEvent.selectOptions(
      screen.getByLabelText("Moneda de la tasa oficial"),
      "EUR",
    );
    await waitFor(() => expect(monedasDelDia).toEqual(["USD", "EUR"]));
  });

  it("si la ventana de referencia falla, la parrilla sigue", async () => {
    /*
     * La referencia solo alimenta «qué se movió» y los saltos de la cronología.
     * Si no llega, esas secciones no se pintan —no hay con qué normalizar— pero
     * el intradía es el contenido principal de la vista y tiene que seguir.
     */
    servidor.use(
      http.get(`${BASE}/indicators/history`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        const ventana =
          Date.parse(params.get("to") ?? "") - Date.parse(params.get("from") ?? "");
        if (ventana > 2 * 86_400_000) {
          return HttpResponse.json({ title: "Rango no procesable", status: 422 }, {
            status: 422,
            headers: { "content-type": "application/problem+json" },
          });
        }
        return HttpResponse.json({
          data: [
            {
              as_of: "2026-08-06T12:00:00Z",
              indicator: "p2p_brecha_pct_buy",
              currency: "VES",
              value: "12.5",
              calc_version: 1,
            },
          ],
          pagination: { page: 1, page_size: 500, total_items: 1, has_more: false },
          interval: "5m",
        });
      }),
    );
    render(<IntradayView />);

    // El contenido llega; «qué se movió» y la cronología de saltos, no.
    await waitFor(() =>
      expect(document.querySelector(".vmw-vs__fila")).toBeTruthy(),
    );
    expect(document.querySelector(".vmw-movio__rejilla")).toBeNull();
    // Y ningún error se le echa encima al usuario: la vista no falló.
    expect(screen.queryByText(/rango no procesable/i)).toBeNull();
  });

  it("la ventana de referencia se pide aparte y cubre 7 días", async () => {
    /*
     * «Qué se movió» normaliza contra la desviación típica de 7 días, así que
     * hace falta una segunda consulta con otra ventana: la del día operativo no
     * sirve para medir qué es normal en esa serie.
     */
    const { ventanas } = espiarPeticiones();
    render(<IntradayView />);

    await waitFor(() => expect(ventanas.length).toBeGreaterThanOrEqual(2));
    const dias = ventanas.map((v) => Math.round(v.ms / 86_400_000));
    expect(dias).toContain(7);
    expect(Math.min(...dias)).toBeLessThanOrEqual(1); // la del día operativo

    /*
     * Y SIEMPRE en bucket de 1 h, ignore lo que diga el selector: con 5 min son
     * ~2 000 buckets por serie y 7 días pasan de 40 000 filas. Se vio en vivo
     * paginando por la 33 mientras la sección seguía sin pintarse.
     */
    const referencia = ventanas.find((v) => v.ms > 6 * 86_400_000)!;
    expect(referencia.intervalo).toBe("1h");
  });
});
