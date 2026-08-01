/** Shell del rediseño: tira de estado, barra ancha, barra compacta con menú y
 * pie. Todo lo que muestra sale del store — sin dato, lo dice. */

import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCompacto } from "../../src/lib/useCompacto";

import { Footer } from "../../src/components/shell/Footer";
import { NavBar } from "../../src/components/shell/NavBar";
import { StatusStrip } from "../../src/components/shell/StatusStrip";
import { marketStore } from "../../src/state/marketStore";
import { renderConProveedores as render } from "../render";

/** `matchMedia` no existe en jsdom: se simula para poder fijar el ancho. */
function fijarCompacto(compacto: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((consulta: string) => ({
    matches: compacto,
    media: consulta,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => fijarCompacto(false));

afterEach(() => {
  cleanup();
  marketStore.reset();
  window.localStorage.clear();
});

describe("StatusStrip", () => {
  it("sin eventos todavía lo dice, en vez de inventar una antigüedad", () => {
    render(<StatusStrip />);
    expect(screen.getByText(/sin eventos todavía/i)).toBeTruthy();
    expect(screen.getByText(/calc — · ruleset v1/)).toBeTruthy();
  });

  it("muestra suscripciones, antigüedad del último push y versión de cálculo", () => {
    marketStore.push({
      topic: "indicators",
      event_id: "evento-tira",
      occurred_at: new Date(Date.now() - 34_000).toISOString(),
      data: {
        as_of: new Date().toISOString(),
        calc_version: 3,
        official_stale: false,
        triggered_by: "11111111-2222-3333-4444-555555555555",
        indicators: [],
      },
    });
    render(<StatusStrip />);
    expect(screen.getByText(/flujo \/ws\/v1 · 4 suscripciones/)).toBeTruthy();
    expect(screen.getByText(/último evento hace 34 s/)).toBeTruthy();
    expect(screen.getByText(/calc v3 · ruleset v1/)).toBeTruthy();
  });

  it("muestra la cuota REST cuando el gateway la envía", () => {
    marketStore.cuota({ remaining: 118, limit: 120 });
    render(<StatusStrip />);
    expect(screen.getByText("cuota 118/120")).toBeTruthy();
  });

  // El diseño declara la tira dentro de `isWide`: en compacto no existe, y su
  // información vive en la barra y en el menú (ver más abajo).
  it("no se pinta en compacto", () => {
    fijarCompacto(true);
    const { container } = render(<StatusStrip />);
    expect(container.querySelector(".vmw-tira")).toBeNull();
  });

  // El ancho se mide en el estado inicial, no en el efecto: con `useState(false)`
  // el PRIMER render decía «ancha» y en un móvil la tira se pintaba un
  // fotograma antes de desaparecer — salto de layout gratis.
  it("mide el ancho ya en el primer render, sin esperar al efecto", () => {
    fijarCompacto(true);
    const vistos: boolean[] = [];
    function Sonda() {
      vistos.push(useCompacto());
      return null;
    }
    render(<Sonda />);
    expect(vistos[0]).toBe(true);
  });

  it("marca como secundarios los datos que se repliegan antes de envolver", () => {
    marketStore.cuota({ remaining: 118, limit: 120 });
    render(<StatusStrip />);
    const secundarios = [
      ...document.querySelectorAll(".vmw-tira__secundario"),
    ].map((n) => n.textContent);
    // Suscripciones y cuota ceden; estado y último evento nunca.
    expect(secundarios.some((texto) => texto?.includes("suscripciones"))).toBe(
      true,
    );
    expect(secundarios.some((texto) => texto?.includes("cuota"))).toBe(true);
    expect(secundarios.some((texto) => texto?.includes("último evento"))).toBe(
      false,
    );
  });

  it("el estado del stream es región viva: se anuncia si cae", () => {
    render(<StatusStrip />);
    const estado = screen.getByRole("status");
    expect(estado.getAttribute("aria-live")).toBe("polite");
    expect(estado.textContent).toContain("WSS");
  });
});

describe("NavBar (ancha)", () => {
  const props = {
    vista: "dashboard" as const,
    onVista: vi.fn(),
    usuario: "Jeremi Alcalá",
    onSalir: vi.fn(),
  };

  it("marca la pestaña activa y notifica el cambio", async () => {
    const usuario = userEvent.setup();
    const onVista = vi.fn();
    render(<NavBar {...props} onVista={onVista} />);

    const dashboard = screen.getByRole("tab", { name: "Dashboard" });
    expect(dashboard.getAttribute("aria-selected")).toBe("true");

    await usuario.click(screen.getByRole("tab", { name: "Análisis" }));
    expect(onVista).toHaveBeenCalledWith("analisis");
  });

  it("cambia el idioma de toda la barra", async () => {
    const usuario = userEvent.setup();
    render(<NavBar {...props} />);
    await usuario.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByRole("tab", { name: "History" })).toBeTruthy();
  });

  it("alterna el tema y lo aplica al documento", async () => {
    const usuario = userEvent.setup();
    render(<NavBar {...props} />);
    expect(document.documentElement.dataset.theme).toBe("dark");
    await usuario.click(screen.getByRole("button", { name: "Claro" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: "Oscuro" })).toBeTruthy();
  });

  it("cierra sesión desde el botón de la barra", async () => {
    const usuario = userEvent.setup();
    const onSalir = vi.fn();
    render(<NavBar {...props} onSalir={onSalir} />);
    await usuario.click(screen.getByRole("button", { name: "Salir" }));
    expect(onSalir).toHaveBeenCalled();
  });
});

describe("NavBar (compacta)", () => {
  const props = {
    vista: "dashboard" as const,
    onVista: vi.fn(),
    usuario: "Jeremi Alcalá",
    onSalir: vi.fn(),
  };

  beforeEach(() => fijarCompacto(true));

  it("esconde las pestañas tras el menú y las abre al pulsarlo", async () => {
    const usuario = userEvent.setup();
    render(<NavBar {...props} />);
    expect(screen.queryByRole("tab", { name: "Histórico" })).toBeNull();

    const menu = screen.getByRole("button", { name: "Menú" });
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    await usuario.click(menu);
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("tab", { name: "Histórico" })).toBeTruthy();
  });

  it("muestra la vista actual mientras el menú está plegado", () => {
    render(<NavBar {...props} vista="historico" />);
    expect(screen.getByText("Histórico")).toBeTruthy();
    // …y no como pestaña: las pestañas viven dentro del menú.
    expect(screen.queryByRole("tab", { name: "Histórico" })).toBeNull();
  });

  it("el pulso del stream no depende solo del color", () => {
    marketStore.conexion("reconectando");
    marketStore.push({
      topic: "indicators",
      event_id: "evento-compacto",
      occurred_at: new Date(Date.now() - 34_000).toISOString(),
      data: {
        as_of: new Date().toISOString(),
        calc_version: 1,
        official_stale: false,
        triggered_by: "11111111-2222-3333-4444-555555555555",
        indicators: [],
      },
    });
    render(<NavBar {...props} />);
    const pulso = screen.getByRole("status");
    expect(pulso.getAttribute("aria-label")).toBe("WSS reconectando · hace 34 s");
    expect(pulso.getAttribute("aria-live")).toBe("polite");
  });

  it("el menú recoge el detalle que la tira no puede mostrar aquí", async () => {
    const usuario = userEvent.setup();
    marketStore.conexion("conectado");
    marketStore.push({
      topic: "indicators",
      event_id: "evento-meta",
      occurred_at: new Date().toISOString(),
      data: {
        as_of: new Date().toISOString(),
        calc_version: 7,
        official_stale: false,
        triggered_by: "11111111-2222-3333-4444-555555555555",
        indicators: [],
      },
    });
    render(<NavBar {...props} />);
    await usuario.click(screen.getByRole("button", { name: "Menú" }));

    const meta = document.querySelector(".vmw-menu__meta")?.textContent ?? "";
    expect(meta).toContain("Jeremi Alcalá");
    expect(meta).toContain("WSS conectado");
    expect(meta).toContain("4 suscripciones");
    expect(meta).toContain("calc v7");
  });

  it("elegir una vista cierra el menú", async () => {
    const usuario = userEvent.setup();
    const onVista = vi.fn();
    render(<NavBar {...props} onVista={onVista} />);
    await usuario.click(screen.getByRole("button", { name: "Menú" }));
    await usuario.click(screen.getByRole("tab", { name: "Intradía" }));
    expect(onVista).toHaveBeenCalledWith("intradia");
    expect(screen.queryByRole("tab", { name: "Intradía" })).toBeNull();
  });
});

describe("Footer", () => {
  it("firma con el año en curso", () => {
    render(<Footer />);
    expect(
      screen.getByText(
        new RegExp(`© ${new Date().getFullYear()} Higerotech`),
      ),
    ).toBeTruthy();
  });
});
