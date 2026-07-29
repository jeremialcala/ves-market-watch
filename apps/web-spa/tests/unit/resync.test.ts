/** Reposición REST del estado (ADR-0016): sobreescribe lo disponible y tolera
 * 404/fallos por endpoint sin abortar el resto. */

import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { config } from "../../src/config";
import { marketStore } from "../../src/state/marketStore";
import { resyncTodo } from "../../src/state/resync";
import {
  FIXTURE_INDICADORES,
  FIXTURE_P2P_LOW,
  FIXTURE_PROFUNDIDAD,
  FIXTURE_SENAL,
  FIXTURE_TASA,
} from "../contract/fixtures.test";
import { limpiarTokenDeTest, registrarTokenDeTest } from "../soporte";

const BASE = `${config.apiBaseUrl}/api/v1`;
const servidor = setupServer();

beforeAll(() => {
  servidor.listen({ onUnhandledRequest: "error" });
  registrarTokenDeTest();
});
afterEach(() => {
  servidor.resetHandlers();
  marketStore.reset();
});
afterAll(() => {
  servidor.close();
  limpiarTokenDeTest();
});

const problem404 = () =>
  HttpResponse.json(
    { title: "Sin datos", status: 404 },
    { status: 404, headers: { "content-type": "application/problem+json" } },
  );

describe("resyncTodo", () => {
  it("repone todas las vistas y tolera monedas/lados sin datos", async () => {
    servidor.use(
      http.get(`${BASE}/rates/official/current`, ({ request }) => {
        const moneda = new URL(request.url).searchParams.get("currency");
        return moneda === "USD"
          ? HttpResponse.json(FIXTURE_TASA)
          : problem404();
      }),
      http.get(`${BASE}/rates/p2p/current`, ({ request }) =>
        new URL(request.url).searchParams.get("side") === "buy"
          ? HttpResponse.json(FIXTURE_P2P_LOW)
          : problem404(),
      ),
      http.get(`${BASE}/indicators/current`, () =>
        HttpResponse.json(FIXTURE_INDICADORES),
      ),
      http.get(`${BASE}/market/depth`, ({ request }) =>
        new URL(request.url).searchParams.get("side") === "buy"
          ? HttpResponse.json(FIXTURE_PROFUNDIDAD)
          : problem404(),
      ),
      http.get(`${BASE}/signals`, () =>
        HttpResponse.json({
          data: [FIXTURE_SENAL],
          pagination: { page: 1, page_size: 20, total_items: 1, has_more: false },
        }),
      ),
      http.get(`${BASE}/health`, () =>
        HttpResponse.json({ status: "ok", components: {} }),
      ),
    );
    await resyncTodo();
    const estado = marketStore.getState();
    expect(estado.tasas.USD.rate).toBe(FIXTURE_TASA.rate);
    expect(estado.tasas.EUR).toBeUndefined();
    expect(estado.p2p.buy?.confidence).toBe("low");
    expect(estado.p2p.sell).toBeUndefined();
    expect(estado.indicadores?.gap_pct).toBe("103.83000000");
    expect(estado.profundidad.buy?.levels).toHaveLength(2);
    expect(estado.senales).toHaveLength(1);
    expect(estado.salud?.status).toBe("ok");
  });

  it("un endpoint caído no impide reponer el resto (best-effort)", async () => {
    servidor.use(
      http.get(`${BASE}/rates/official/current`, () =>
        HttpResponse.json(FIXTURE_TASA),
      ),
      http.get(`${BASE}/rates/p2p/current`, () => HttpResponse.error()),
      http.get(`${BASE}/indicators/current`, () => HttpResponse.error()),
      http.get(`${BASE}/market/depth`, () => HttpResponse.error()),
      http.get(`${BASE}/signals`, () => HttpResponse.error()),
      http.get(`${BASE}/health`, () => HttpResponse.error()),
    );
    await resyncTodo();
    const estado = marketStore.getState();
    expect(estado.tasas.USD).toBeDefined();
    expect(estado.indicadores).toBeNull();
    expect(estado.senales).toEqual([]); // señales no vino: se conserva el previo (vacío)
  });
});
