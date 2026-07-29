/** Cliente REST contra un gateway mockeado (MSW): convenciones del contrato —
 * 404 = null en los «current», problem+json → ApiError, paginación
 * transparente y validación de rango en cliente. */

import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  historialIndicadores,
  historialIntradia,
  indicadores,
  salud,
  senalesRecientes,
  tasaOficial,
  validarRango,
} from "../../src/api/endpoints";
import { ApiError } from "../../src/api/problem";
import { config } from "../../src/config";
import { limpiarTokenDeTest, registrarTokenDeTest } from "../soporte";

const BASE = `${config.apiBaseUrl}/api/v1`;
const servidor = setupServer();

beforeAll(() => {
  servidor.listen({ onUnhandledRequest: "error" });
  registrarTokenDeTest();
});
afterEach(() => servidor.resetHandlers());
afterAll(() => {
  servidor.close();
  limpiarTokenDeTest();
});

const TASA = {
  currency: "USD",
  rate: "417.03000000",
  value_date: "2026-07-27",
  captured_at: "2026-07-27T11:30:00Z",
  stale: false,
};

describe("convenciones del contrato", () => {
  it("envía el Bearer y devuelve la tasa", async () => {
    let autorizacion: string | null = null;
    servidor.use(
      http.get(`${BASE}/rates/official/current`, ({ request }) => {
        autorizacion = request.headers.get("authorization");
        return HttpResponse.json(TASA);
      }),
    );
    const tasa = await tasaOficial("USD");
    expect(tasa?.rate).toBe("417.03000000");
    expect(autorizacion).toMatch(/^Bearer eyJ/);
  });

  it("404 en un «current» es null (sin datos frescos), no excepción", async () => {
    servidor.use(
      http.get(`${BASE}/indicators/current`, () =>
        HttpResponse.json(
          { title: "Sin datos", status: 404 },
          { status: 404, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    expect(await indicadores("USD")).toBeNull();
  });

  it("un problem+json distinto de 404 se lanza como ApiError", async () => {
    servidor.use(
      http.get(`${BASE}/signals`, () =>
        HttpResponse.json(
          { title: "Demasiadas peticiones", status: 429, detail: "espere" },
          { status: 429, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    await expect(senalesRecientes()).rejects.toThrowError(ApiError);
  });

  it("pagina hasta agotar has_more y reporta progreso", async () => {
    const fila = (n: number) => ({
      as_of: `2026-07-2${n}T00:00:00Z`,
      indicator: "official_rate",
      currency: "USD",
      value: "417.03000000",
      calc_version: 1,
    });
    servidor.use(
      http.get(`${BASE}/indicators/history`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get("page"));
        return HttpResponse.json({
          data: [fila(page)],
          pagination: {
            page,
            page_size: 500,
            total_items: 3,
            has_more: page < 3,
          },
          interval: "1h",
        });
      }),
    );
    const progreso: number[] = [];
    const filas = await historialIndicadores(
      new Date("2026-07-20T00:00:00Z"),
      new Date("2026-07-27T00:00:00Z"),
      "1h",
      { indicador: "official_rate", moneda: "USD" },
      { alProgresar: (paginas) => progreso.push(paginas) },
    );
    expect(filas).toHaveLength(3);
    expect(progreso).toEqual([1, 2, 3]);
  });

  it("envía el filtro de indicador al servidor y reintenta un 429 con Retry-After", async () => {
    let intentos = 0;
    let filtroRecibido: string | null = null;
    servidor.use(
      http.get(`${BASE}/indicators/history`, ({ request }) => {
        intentos += 1;
        filtroRecibido = new URL(request.url).searchParams.get("indicator");
        if (intentos === 1) {
          return HttpResponse.json(
            { title: "Demasiadas peticiones", status: 429 },
            {
              status: 429,
              headers: {
                "content-type": "application/problem+json",
                "Retry-After": "0",
              },
            },
          );
        }
        return HttpResponse.json({
          data: [],
          pagination: { page: 1, page_size: 500, total_items: 0, has_more: false },
          interval: "1h",
        });
      }),
    );
    const filas = await historialIndicadores(
      new Date("2026-07-26T00:00:00Z"),
      new Date("2026-07-27T00:00:00Z"),
      "1h",
      { indicador: "p2p_brecha_pct_buy", moneda: "VES" },
    );
    expect(filas).toEqual([]);
    expect(intentos).toBe(2); // 429 → espera Retry-After → reintento único
    expect(filtroRecibido).toBe("p2p_brecha_pct_buy");
  });

  it("valida el rango de 90 días en cliente (el 422 del server es cinturón)", () => {
    const hasta = new Date("2026-07-27T00:00:00Z");
    const desde = new Date(hasta.getTime() - 91 * 86_400_000);
    expect(() => validarRango(desde, hasta)).toThrowError(ApiError);
    expect(() => validarRango(hasta, desde)).toThrowError(/anterior al inicio/i);
  });

  it("salud es pública (sin Bearer) y acepta el 503 con schema Health", async () => {
    let autorizacion: string | null = "no-verificado";
    servidor.use(
      http.get(`${BASE}/health`, ({ request }) => {
        autorizacion = request.headers.get("authorization");
        return HttpResponse.json(
          { status: "down", components: { database: "down" } },
          { status: 503 },
        );
      }),
    );
    const estado = await salud();
    expect(estado.status).toBe("down");
    expect(autorizacion).toBeNull();
  });
});

function paginaIndicadores(data: unknown[]) {
  return HttpResponse.json({
    data,
    pagination: { page: 1, page_size: 500, total_items: data.length, has_more: false },
    interval: "5m",
  });
}

describe("historialIntradia (día operativo VET, todas las series)", () => {
  it("pide una pasada por moneda, sin filtro de indicador, desde las 00:00 VET", async () => {
    const consultas: URLSearchParams[] = [];
    servidor.use(
      http.get(`${BASE}/indicators/history`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        consultas.push(params);
        return paginaIndicadores(
          params.get("currency") === "VES"
            ? [
                // a propósito en orden DESC, como responde el gateway
                {
                  as_of: "2026-07-28T13:00:00Z",
                  indicator: "p2p_mediana_buy",
                  currency: "VES",
                  value: "120",
                  calc_version: 1,
                },
                {
                  as_of: "2026-07-28T04:00:00Z",
                  indicator: "p2p_mediana_buy",
                  currency: "VES",
                  value: "100",
                  calc_version: 1,
                },
              ]
            : [
                {
                  as_of: "2026-07-28T04:00:00Z",
                  indicator: "official_rate",
                  currency: "USD",
                  value: "417.03",
                  calc_version: 1,
                },
              ],
        );
      }),
    );

    const progreso: Array<[number, number]> = [];
    const series = await historialIntradia(
      "USD",
      "5m",
      new Date("2026-07-28T15:30:00Z"),
      { alProgresar: (paginas, items) => progreso.push([paginas, items]) },
    );

    expect(consultas).toHaveLength(2);
    expect(consultas.map((p) => p.get("currency")).sort()).toEqual(["USD", "VES"]);
    for (const params of consultas) {
      // Sin filtro de indicador: aquí se quieren TODAS las series del día.
      expect(params.get("indicator")).toBeNull();
      expect(params.get("from")).toBe("2026-07-28T04:00:00.000Z");
      expect(params.get("interval")).toBe("5m");
    }
    // El gateway ordena por bucket DESC: la apertura debe quedar primera.
    expect(series.get("p2p_mediana_buy")?.map((p) => p.valor)).toEqual([
      "100",
      "120",
    ]);
    expect(series.get("official_rate")?.map((p) => p.valor)).toEqual(["417.03"]);
    // El progreso agrega las dos pasadas: termina en 2 páginas y 3 puntos.
    expect(progreso.at(-1)).toEqual([2, 3]);
  });

  it("no duplica la pasada si la moneda oficial coincide con la P2P", async () => {
    let llamadas = 0;
    servidor.use(
      http.get(`${BASE}/indicators/history`, () => {
        llamadas += 1;
        return paginaIndicadores([]);
      }),
    );
    const series = await historialIntradia(
      "VES",
      "1h",
      new Date("2026-07-28T15:30:00Z"),
    );
    expect(llamadas).toBe(1);
    expect(series.size).toBe(0);
  });
});
