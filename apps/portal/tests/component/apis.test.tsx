/** APIs (`/apis`, RF-7): catálogo generado de los contratos y playground real. */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/App";
import { pintar } from "../../src/entry-server";

function montar() {
  window.history.replaceState(null, "", "/apis");
  return render(<App rutaInicial="/apis" />);
}

const catalogo = () => screen.getByRole("navigation", { name: "Catálogo de endpoints" });
const playground = () => screen.getByRole("region", { name: /^(GET|WSS) / });

class WebSocketFalso {
  static ultimo: WebSocketFalso | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  constructor(public url: string) {
    WebSocketFalso.ultimo = this;
    queueMicrotask(() => this.onclose?.({ code: 4401, reason: "token requerido" }));
  }
  close() {}
}

beforeEach(() => {
  window.localStorage.clear();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("catálogo", () => {
  it("los grupos del diseño, con los 8 endpoints de datos, /health y el WSS", () => {
    montar();
    const nav = within(catalogo());
    expect(nav.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Tasas",
      "Indicadores",
      "Mercado",
      "Sistema",
      "WebSocket",
    ]);
    expect(nav.getAllByRole("button")).toHaveLength(10);
    expect(nav.getByText("/api/v1/rates/p2p/current")).toBeTruthy();
    expect(nav.getByText("Push de 5 tópicos: rates.official, p2p.snapshot, indicators, signals, analysis.")).toBeTruthy();
  });

  it("los parámetros salen del contrato, con su obligatoriedad", () => {
    montar();
    const p2p = within(catalogo()).getByRole("button", { name: /rates\/p2p\/current/ });
    expect(p2p.textContent).toContain("side=buy|sell obligatorio");
    const historia = within(catalogo()).getByRole("button", { name: /indicators\/history/ });
    expect(historia.textContent).toContain("interval=5m|15m|1h|1d opcional");
  });

  it("los chips cuentan los límites reales", () => {
    montar();
    expect(screen.getByText("Rango máx. 90 días o 26.000 buckets → 422")).toBeTruthy();
    expect(screen.getByText("WSS: ≤ 5 conexiones · ≤ 10 suscripciones")).toBeTruthy();
  });
});

describe("playground", () => {
  it("abre en /health, público, y lo ejecuta de verdad: 200", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(new Response('{"status":"ok"}', { status: 200 }));
    vi.stubGlobal("fetch", fetchFalso);
    montar();
    const p = within(playground());
    expect(p.getByText("Público")).toBeTruthy();
    expect(p.getByText('curl "/api/v1/health"')).toBeTruthy();
    expect(p.getByText("sin ejecutar")).toBeTruthy();
    await userEvent.click(p.getByRole("button", { name: "Ejecutar" }));
    expect(fetchFalso).toHaveBeenCalledWith("/api/v1/health", { headers: { Accept: "application/json" } });
    expect(p.getByText(/^200 OK · \d+ ms$/)).toBeTruthy();
    expect(p.getByLabelText("Respuesta del gateway").textContent).toContain('"status": "ok"');
    expect(p.queryByText("Esta llamada se abre con el nivel Empresa.")).toBeNull();
  });

  it("un endpoint de pago: el 401 real, la forma del contrato y el camino a Empresa", async () => {
    const problema = { title: "No autenticado", status: 401, detail: "Access token ausente o inválido." };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(problema), { status: 401 })));
    montar();
    await userEvent.click(within(catalogo()).getByRole("button", { name: /rates\/p2p\/current/ }));
    const p = within(playground());
    expect(p.getByRole("heading", { name: "GET /api/v1/rates/p2p/current" })).toBeTruthy();
    expect(p.getByText("Nivel Empresa")).toBeTruthy();
    expect(p.getByText(/Authorization: Bearer \$CRITERIO_TOKEN/).textContent).toContain('"/api/v1/rates/p2p/current?side=buy"');
    expect(p.getByRole("link", { name: "OpenAPI · openapi.yaml" }).getAttribute("href")).toMatch(
      /\/blob\/main\/apps\/api-gateway\/docs\/openapi\.yaml$/,
    );
    await userEvent.click(p.getByRole("button", { name: "Ejecutar" }));
    expect(p.getByText(/^401 Unauthorized · \d+ ms$/).className).toContain("tono-coral");
    expect(p.getByLabelText("Respuesta del gateway").textContent).toContain('"status": 401');
    const forma = p.getByLabelText(/forma de la respuesta 200/).textContent ?? "";
    expect(JSON.parse(forma.slice(forma.indexOf("\n")))).toMatchObject({ side: "buy", best_price: "417.03" });
    expect(p.getByText("Esta llamada se abre con el nivel Empresa.")).toBeTruthy();
    await userEvent.click(p.getByRole("link", { name: "Habla con nosotros" }));
    expect(window.location.pathname).toBe("/precios");
  });

  it("cambiar de endpoint borra el resultado anterior", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    montar();
    await userEvent.click(within(playground()).getByRole("button", { name: "Ejecutar" }));
    expect(within(playground()).getByText(/^200 OK/)).toBeTruthy();
    await userEvent.click(within(catalogo()).getByRole("button", { name: /\/api\/v1\/signals/ }));
    expect(within(playground()).getByText("sin ejecutar")).toBeTruthy();
  });

  it("sin respuesta del gateway lo dice, sin inventar un estado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    montar();
    await userEvent.click(within(playground()).getByRole("button", { name: "Ejecutar" }));
    expect(within(playground()).getByText("sin respuesta: el gateway no contestó")).toBeTruthy();
  });

  it("el WSS: wscat con el token en la query y el cierre 4401 real", async () => {
    vi.stubGlobal("WebSocket", WebSocketFalso);
    montar();
    await userEvent.click(within(catalogo()).getByRole("button", { name: /\/ws\/v1/ }));
    const p = within(playground());
    expect(p.getByText(/wscat -c/).textContent).toContain('"action":"subscribe","topics":["p2p.snapshot"]');
    expect(p.getByRole("link", { name: "AsyncAPI · asyncapi.yaml" })).toBeTruthy();
    await userEvent.click(p.getByRole("button", { name: "Ejecutar" }));
    expect(WebSocketFalso.ultimo?.url).toBe(`ws://${window.location.host}/ws/v1`);
    expect(p.getByText(/^cerrado con 4401 · \d+ ms$/)).toBeTruthy();
    expect(p.queryByLabelText(/forma de la respuesta/)).toBeNull();
    expect(p.getByText("Esta llamada se abre con el nivel Empresa.")).toBeTruthy();
  });

  it("en una columna, elegir un endpoint lleva el playground a la vista", async () => {
    const vista = vi.fn();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("900px") }));
    Element.prototype.scrollIntoView = vista;
    montar();
    await userEvent.click(within(catalogo()).getByRole("button", { name: /market\/depth/ }));
    expect(vista).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });
});

describe("idioma y prerender", () => {
  it("en inglés, la interfaz en inglés y los textos del contrato tal cual", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("The dashboard's data, in your code");
    expect(within(screen.getByRole("navigation", { name: "Endpoint catalog" })).getByText("Salud del servicio")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
    expect(document.title).toBe("APIs · Criterio");
  });

  it("el prerender trae el catálogo entero para indexarse", () => {
    const html = pintar("/apis");
    expect(html).toContain("<main");
    expect(html).toContain("/api/v1/indicators/history");
    expect(html).toContain("/ws/v1");
    expect(html).toContain("side=buy|sell");
  });
});
