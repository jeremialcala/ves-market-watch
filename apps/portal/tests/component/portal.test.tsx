/** El portal montado entero, con el snapshot inyectado por contexto. */

import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Series, Snapshot } from "../../src/api/cliente";
import { App } from "../../src/App";
import { DatosContext } from "../../src/datos/contexto";
import type { EstadoSondeo } from "../../src/datos/sondeo";
import { AHORA, series, snapshot } from "../fixtura";

function montar(
  ruta = "/",
  datos: { snapshot?: Snapshot | null; series?: Series | null; estado?: EstadoSondeo } = {},
) {
  const { estado = "en-vivo" } = datos;
  const valor = {
    snapshot: { datos: datos.snapshot === undefined ? snapshot() : datos.snapshot, estado },
    series: { datos: datos.series === undefined ? series() : datos.series, estado },
  };
  window.history.replaceState(null, "", ruta);
  return render(
    <App rutaInicial={ruta} datos={(hijos) => <DatosContext.Provider value={valor}>{hijos}</DatosContext.Provider>} />,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
  window.localStorage.clear();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("landing con datos", () => {
  it("el hero trae la brecha, lo que está sobre la oficial y la comparación con 7 días", () => {
    montar();
    const tarjeta = screen.getByText("En vivo · brecha BCV ↔ P2P (buy)").closest("a")!;
    expect(within(tarjeta).getByText("15,34 %")).toBeTruthy();
    expect(within(tarjeta).getByText("134,95 VES sobre la oficial")).toBeTruthy();
    expect(within(tarjeta).getByText("−0,53 pts vs. media de 7 días")).toBeTruthy();
    expect(within(tarjeta).getByText("Lateral y sin cambios")).toBeTruthy();
    expect(within(tarjeta).getByText("879,2531")).toBeTruthy();
    expect(within(tarjeta).getByText("1.014,20")).toBeTruthy();
    expect(within(tarjeta).getByRole("img", { name: "Brecha buy de las últimas 24 horas" })).toBeTruthy();
  });

  it("01 · la procedencia dice la edad de cada fuente y si la oficial está vigente", () => {
    montar();
    const panel = within(screen.getByText("En vivo · calidad del dato").closest(".panel") as HTMLElement);
    expect(panel.getByText("hace 20 s")).toBeTruthy();
    expect(panel.getByText("hace 3 h · vigente")).toBeTruthy();
    expect(panel.getByText("0 % buy · 0,50 % sell · MAD/IQR")).toBeTruthy();
    expect(panel.getByText("34 % del volumen")).toBeTruthy();
    expect(panel.getByText("calc v1 · ruleset v1")).toBeTruthy();
  });

  it("02 · la regla más cercana, condición por condición", () => {
    montar();
    expect(screen.getByText("arranque_alcista@v1")).toBeTruthy();
    expect(screen.getByText("2 de 3 condiciones")).toBeTruthy();
    expect(screen.getByText("necesita > 0,5 %")).toBeTruthy();
    expect(screen.getByText("falta 0,53 %")).toBeTruthy();
    expect(screen.getAllByText("cumple")).toHaveLength(2);
    expect(screen.getByText("La que más lejos está de su umbral es p2p_momentum_bid_3h_pct.")).toBeTruthy();
  });

  it("03 · los tres medidores con su percentil y su regla", () => {
    montar();
    expect(screen.getByText("Spread BUY↔SELL")).toBeTruthy();
    expect(screen.getByText("Ratio oferta/demanda")).toBeTruthy();
    expect(screen.getByText("Momentum bid 3 h")).toBeTruthy();
    expect(screen.getByText("p10 · 90 d")).toBeTruthy();
    expect(screen.getByText("Cumple una condición de techo_inminente@v1")).toBeTruthy();
    expect(screen.getByText("A 0,53 % del umbral de arranque_alcista@v1")).toBeTruthy();
  });

  it("04 · la descomposición y quién mueve la brecha", () => {
    montar();
    expect(screen.getByText("Oficial USD/VES 879,2531")).toBeTruthy();
    expect(screen.getByText("+1,22 VES")).toBeTruthy();
    expect(screen.getByText("−1,20 VES")).toBeTruthy();
    expect(
      screen.getByText(
        "En las últimas 6 h, el 98 % del movimiento viene de la oficial: la brecha se mueve porque se mueve el BCV.",
      ),
    ).toBeTruthy();
  });

  it("ningún texto presenta un recuento de aciertos (RF-2)", () => {
    const { container } = montar();
    expect(container.textContent).not.toMatch(/acert|acierto|\d+ de \d+ señales/i);
  });
});

describe("landing sin datos", () => {
  it("cada panel dice que no hay datos, y el texto fijo está", () => {
    montar("/", { snapshot: null, series: null, estado: "cargando" });
    expect(screen.getAllByText("Sin datos todavía").length).toBe(5);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("La brecha cambiaria, medida y servida por API");
    expect(screen.getByText("Conectando")).toBeTruthy();
  });

  it("un análisis no evaluable lo dice", () => {
    const s = snapshot();
    s.analysis!.rule_proximity[0].evaluable = false;
    montar("/", { snapshot: s });
    expect(screen.getByText(/no se evalúa/)).toBeTruthy();
  });

  it("todas las condiciones cumplidas", () => {
    const s = snapshot();
    const regla = s.analysis!.rule_proximity[0];
    regla.conditions_met = regla.conditions_total;
    montar("/", { snapshot: s });
    expect(screen.getByText("Se cumplen todas las condiciones: la regla dispara.")).toBeTruthy();
  });

  it.each([
    ["paralelo", /viene sobre todo del paralelo/],
    ["ambos", /se movieron las dos piernas/],
    [null, /ninguna pierna se movió/],
  ] as const)("piernas: %s", (responsable, texto) => {
    const s = snapshot();
    s.analysis!.gap_legs!.responsible = responsable;
    montar("/", { snapshot: s });
    expect(screen.getByText(texto)).toBeTruthy();
  });

  it("una tasa oficial no vigente se marca", () => {
    const s = snapshot();
    s.official_rates[0].stale = true;
    montar("/", { snapshot: s });
    expect(screen.getByText("hace 3 h · no vigente")).toBeTruthy();
  });
});

describe("barra en vivo", () => {
  it("la edad que dice es la de as_of, no la de la petición", () => {
    const s = snapshot();
    s.as_of = new Date(AHORA - 5 * 60_000).toISOString();
    montar("/", { snapshot: s });
    expect(screen.getByText("actualizado hace 5 min")).toBeTruthy();
    expect(screen.getByText(/datos al 14 oct · 20:05 VET/)).toBeTruthy();
  });

  it("sin conexión lo dice, y sigue mostrando el último dato", () => {
    montar("/", { estado: "sin-conexion" });
    expect(screen.getByText("Sin conexión")).toBeTruthy();
    expect(screen.getByText("actualizado hace 20 s")).toBeTruthy();
  });
});

describe("navegación, idioma y tema", () => {
  it("un enlace navega sin recargar, cambia la URL y marca la sección", async () => {
    vi.useRealTimers();
    montar();
    const nav = screen.getByRole("navigation", { name: "Secciones" });
    await userEvent.click(within(nav).getByRole("link", { name: "Precios" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Gratis para leer, a medida para integrar");
    expect(window.location.pathname).toBe("/precios");
    expect(within(nav).getByRole("link", { name: "Precios" }).getAttribute("aria-current")).toBe("page");
  });

  it("volver atrás con el navegador vuelve a la página anterior", async () => {
    vi.useRealTimers();
    montar("/apis");
    await userEvent.click(within(screen.getByRole("navigation")).getByRole("link", { name: "Estado" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Estado");
    act(() => {
      window.history.replaceState(null, "", "/apis");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("APIs");
  });

  it("Ctrl-clic no lo intercepta: el navegador abre otra pestaña", () => {
    montar();
    const enlace = within(screen.getByRole("navigation")).getByRole("link", { name: "APIs" });
    const evento = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
    enlace.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(false);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("La brecha cambiaria");
  });

  it("una ruta que no existe dice que no existe", () => {
    montar("/no-existe/");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Esta página no existe");
  });

  it("los botones de la landing llevan al dashboard y a las APIs", async () => {
    vi.useRealTimers();
    montar();
    await userEvent.click(screen.getByRole("link", { name: "Explorar las APIs" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("APIs");
    await userEvent.click(screen.getByRole("link", { name: "Volver a la portada" }));
    await userEvent.click(screen.getByRole("link", { name: /Ver el dashboard en vivo/ }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Dashboard público");
  });

  it("en inglés, todo en inglés, también la lectura del motor", async () => {
    vi.useRealTimers();
    montar();
    await userEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("The exchange gap, measured and served by API");
    expect(screen.getByText("Sideways and unchanged")).toBeTruthy();
    expect(screen.getByText("15.34 %")).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
  });

  it("el tema se alterna y se recuerda", async () => {
    vi.useRealTimers();
    montar();
    await userEvent.click(screen.getByRole("button", { name: "Claro" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("vmw.tema")).toBe("light");
    expect(screen.getByRole("button", { name: "Oscuro" })).toBeTruthy();
  });

  it("el menú del móvil se abre y se cierra", async () => {
    vi.useRealTimers();
    montar();
    const boton = screen.getByRole("button", { name: "Menú" });
    await userEvent.click(boton);
    expect(boton.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("navigation").getAttribute("data-abierto")).toBe("true");
    await userEvent.click(within(screen.getByRole("navigation")).getByRole("link", { name: "Histórico" }));
    expect(screen.getByRole("navigation").getAttribute("data-abierto")).toBe("false");
  });

  it("el pie lleva el contacto y WhatsApp", () => {
    montar();
    expect(screen.getAllByRole("link", { name: "contacto@higerotech.com" })[0].getAttribute("href")).toBe(
      "mailto:contacto@higerotech.com",
    );
    expect(screen.getByRole("link", { name: /WhatsApp/ }).getAttribute("href")).toBe("https://wa.me/13235543854");
  });
});
