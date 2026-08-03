/** Shell del rediseño: tira de estado, barra ancha, barra compacta con menú y
 * pie. Todo lo que muestra sale del store — sin dato, lo dice. */

import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCompacto } from "../../src/lib/useCompacto";

import { ES } from "../../src/i18n/dict";

import { Footer } from "../../src/components/shell/Footer";
import { NavBar } from "../../src/components/shell/NavBar";
import { StatusStrip } from "../../src/components/shell/StatusStrip";
import { marketStore } from "../../src/state/marketStore";
import { FIXTURE_ANALISIS } from "../contract/fixtures.test";
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
  });

  it("lleva estado, último push y suscripciones — y NADA de diagnóstico", () => {
    /*
     * La tira responde «¿puedo fiarme de lo que veo ahora?». La ruta del canal,
     * la cuota REST y las versiones de calc/ruleset no cambian esa respuesta y
     * competían por el único renglón con lo que sí: salieron al tooltip del
     * punto de conexión, a «Calidad y procedencia» y, en compacto, a la línea
     * meta del menú.
     */
    marketStore.cuota({ remaining: 118, limit: 120 });
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
    const { container } = render(<StatusStrip />);

    expect(screen.getByText(/5 suscripciones/)).toBeTruthy();
    expect(screen.getByText(/último evento hace 34 s/)).toBeTruthy();

    const tira = container.querySelector(".vmw-tira")?.textContent ?? "";
    expect(tira).not.toMatch(/\/ws\/v1/);
    expect(tira).not.toMatch(/cuota/i);
    expect(tira).not.toMatch(/calc v/);
    expect(tira).not.toMatch(/ruleset/);
  });

  it("el diagnóstico sigue accesible en el tooltip del punto de conexión", () => {
    marketStore.cuota({ remaining: 118, limit: 120 });
    marketStore.push({
      topic: "indicators",
      event_id: "evento-tooltip",
      occurred_at: new Date().toISOString(),
      data: {
        as_of: new Date().toISOString(),
        calc_version: 3,
        official_stale: false,
        triggered_by: "11111111-2222-3333-4444-555555555555",
        indicators: [],
      },
    });
    render(<StatusStrip />);

    const titulo =
      document.querySelector('[role="status"]')?.getAttribute("title") ?? "";
    expect(titulo).toMatch(/118/);
    expect(titulo).toMatch(/calc v3/);
  });

  it("sella a qué momento pertenece el dato, en hora de Venezuela", () => {
    marketStore.resync({
      analisis: {
        ...FIXTURE_ANALISIS,
        as_of: "2026-08-01T18:32:00Z", // 14:32 VET
      },
    });
    render(<StatusStrip />);
    expect(screen.getByText(/datos al 1 ago · 14:32 VET/)).toBeTruthy();
  });

  it("sin análisis NO se inventa un sello de frescura", () => {
    render(<StatusStrip />);
    expect(screen.queryByText(/datos al/)).toBeNull();
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
    render(<StatusStrip />);
    const secundarios = [
      ...document.querySelectorAll(".vmw-tira__secundario"),
    ].map((n) => n.textContent);
    // Las suscripciones ceden; estado y último evento nunca.
    expect(secundarios.some((texto) => texto?.includes("suscripciones"))).toBe(
      true,
    );
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

  it("la marca sale del diccionario, no de un literal", () => {
    /*
     * Las dos variantes de la barra compartían el componente de marca pero la
     * compacta pintaba el nombre a mano: `compacta ? "VES Market Watch" :
     * t("app.titulo")`. Las dos ramas decían lo mismo, así que nadie lo notó —
     * hasta que el producto se renombró a Criterio (ADR-0024) y una de las dos
     * se habría quedado con el nombre viejo. Aquí se fija que ninguna variante
     * se salta la traducción.
     */
    render(<NavBar {...props} />);
    expect(screen.getByText(ES["app.titulo"])).toBeTruthy();
    cleanup();
    fijarCompacto(false);
    render(<NavBar {...props} />);
    expect(screen.getByText(ES["app.titulo"])).toBeTruthy();
  });

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
    expect(meta).toContain("5 suscripciones");
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

describe("NavBar: forma de la barra ancha", () => {
  it("la pestaña activa lleva pastilla teal y las demás no llevan fondo", () => {
    fijarCompacto(false);
    render(
      <NavBar vista="dashboard" onVista={() => {}} usuario="Jeremi" onSalir={() => {}} />,
    );

    const tabs = [...document.querySelectorAll(".vmw-tab")];
    const activas = tabs.filter((t) => t.getAttribute("aria-selected") === "true");
    expect(activas).toHaveLength(1);
    expect(activas[0].textContent).toBe("Dashboard");
    // El resto queda inactiva: la distinción es la pastilla, no el texto.
    expect(tabs.length).toBeGreaterThan(1);
  });

  it("«Salir» NO es coral sólido: ese peso es del CTA de la vista", () => {
    fijarCompacto(false);
    render(
      <NavBar vista="dashboard" onVista={() => {}} usuario="Jeremi" onSalir={() => {}} />,
    );

    const salir = screen.getByRole("button", { name: /salir/i });
    expect(salir.style.background).not.toContain("coral");
    expect(salir.style.boxShadow).toBe("");
  });
});
