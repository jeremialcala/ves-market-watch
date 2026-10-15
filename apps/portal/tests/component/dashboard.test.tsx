/** El Dashboard público (RF-2) montado con el snapshot inyectado por contexto. */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Series, Snapshot } from "../../src/api/cliente";
import { App } from "../../src/App";
import { DatosContext } from "../../src/datos/contexto";
import { pintar } from "../../src/entry-server";
import { AHORA, series, snapshot } from "../fixtura";

function montar(datos: { snapshot?: Snapshot | null; series?: Series | null } = {}) {
  const valor = {
    snapshot: { datos: datos.snapshot === undefined ? snapshot() : datos.snapshot, estado: "en-vivo" as const },
    series: { datos: datos.series === undefined ? series() : datos.series, estado: "en-vivo" as const },
  };
  window.history.replaceState(null, "", "/dashboard");
  return render(
    <App
      rutaInicial="/dashboard"
      datos={(hijos) => <DatosContext.Provider value={valor}>{hijos}</DatosContext.Provider>}
    />,
  );
}

/** El bloque que encabeza un título de sección (`h2`) o de panel. */
function seccion(titulo: string | RegExp): HTMLElement {
  const encabezado = screen.getByRole("heading", { name: titulo });
  return encabezado.closest("section") as HTMLElement;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("lectura de hoy", () => {
  it("el régimen, la prosa del motor y los cuatro chips", () => {
    montar();
    const lectura = within(seccion("Lateral y sin cambios"));
    expect(lectura.getByText("al 14 oct · 20:08 VET")).toBeTruthy();
    const prosa = lectura.getByText(/apenas se movió/).textContent;
    expect(prosa).toBe(
      [
        "La brecha entre la calle y el oficial apenas se movió en las últimas 6 horas.",
        "El movimiento vino de la tasa oficial, no del precio de la calle.",
        "La brecha buy está 1,82 puntos por encima de su promedio de 30 días.",
        "La regla más cerca de disparar es arranque_alcista@v1: cumple 2 de 3 condiciones.",
      ].join(" "),
    );
    expect(lectura.getByText("Datos frescos · hace 20 s")).toBeTruthy();
    expect(lectura.getByText("0 reglas disparadas")).toBeTruthy();
    expect(lectura.getByText("1 medidor cerca de su umbral")).toBeTruthy();
    expect(lectura.getByText("Confianza normal · 0 % outliers")).toBeTruthy();
  });

  it("los chips cambian de tono y de texto con el dato", () => {
    const s = snapshot();
    s.p2p.buy!.as_of = new Date(AHORA - 30 * 60_000).toISOString();
    s.analysis!.confidence = "low";
    s.analysis!.reading!.gauges_near_threshold = 2;
    const regla = s.analysis!.rule_proximity[0];
    regla.conditions_met = regla.conditions_total;
    montar({ snapshot: s });
    expect(screen.getByText("Datos de hace 30 min").className).toContain("chip-coral");
    expect(screen.getByText("1 regla disparada")).toBeTruthy();
    expect(screen.getByText("2 medidores cerca de su umbral")).toBeTruthy();
    expect(screen.getByText("Confianza baja · 0 % outliers").className).toContain("chip-coral");
  });

  it("los fragmentos de API se abren de uno en uno y se cierran", async () => {
    vi.useRealTimers();
    montar();
    const exportar = screen.getByRole("button", { name: "Exportar por API" });
    await userEvent.click(exportar);
    expect(exportar.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/\/api\/v1\/indicators\/history\?indicator=p2p_brecha_pct_buy/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Alertas por API" }));
    expect(screen.getByText(/"topics": \["signals"\]/)).toBeTruthy();
    expect(screen.queryByText(/indicators\/history/)).toBeNull();
    expect(screen.getByRole("link", { name: "Nivel Empresa" }).getAttribute("href")).toBe("/precios");
    await userEvent.click(screen.getByRole("button", { name: "Alertas por API" }));
    expect(screen.queryByText(/"topics"/)).toBeNull();
  });

  it("sin análisis lo dice, sin inventar régimen ni chips", () => {
    montar({ snapshot: { ...snapshot(), analysis: null } });
    expect(screen.getByText("El motor todavía no ha publicado su lectura.")).toBeTruthy();
    expect(screen.queryByText(/reglas disparadas/)).toBeNull();
  });
});

describe("brecha y distancia al disparo", () => {
  it("la tarjeta de la brecha con su sparkline de 24 h", () => {
    montar();
    const tarjeta = within(screen.getByText("Brecha BCV ↔ P2P (lado buy)").closest(".tarjeta-brecha") as HTMLElement);
    expect(tarjeta.getByText("15,34 %")).toBeTruthy();
    expect(tarjeta.getByText("hace 20 s")).toBeTruthy();
    expect(tarjeta.getByText("134,95 VES sobre la oficial")).toBeTruthy();
    expect(tarjeta.getByText("−0,53 pts vs. media de 7 días")).toBeTruthy();
    expect(tarjeta.getByRole("img", { name: "Brecha buy de las últimas 24 horas" })).toBeTruthy();
    expect(tarjeta.getByText("mín 15,10 % · máx 15,60 %")).toBeTruthy();
    expect(tarjeta.getByText("Spread BUY↔SELL: 0,49 %")).toBeTruthy();
    expect(tarjeta.getByText("oficial USD/VES 879,2531")).toBeTruthy();
    expect(tarjeta.getByText("P2P VWAP 1.014,20")).toBeTruthy();
  });

  it("la regla más cercana y las dos cifras de contexto", () => {
    montar();
    expect(screen.getByText("En vivo · distancia al disparo")).toBeTruthy();
    expect(screen.getByText("2 de 3 condiciones")).toBeTruthy();
    expect(screen.getByText("+1,82 pts")).toBeTruthy();
    expect(screen.getByText("promedio de 30 días: 13,51 %")).toBeTruthy();
    expect(screen.getByText("mediana de 90 días: 0,63")).toBeTruthy();
  });
});

describe("panel de instrumentos", () => {
  it("seis medidores, primero los que cumplen, y los outliers con su guarda", () => {
    montar();
    const panel = seccion("Panel de instrumentos");
    const etiquetas = [...panel.querySelectorAll(".medidor-etiqueta")].map((e) => e.textContent);
    expect(etiquetas).toEqual([
      "Spread BUY↔SELL",
      "Ratio oferta/demanda",
      "Drenaje oferta 6 h",
      "Momentum bid 3 h",
      "Brecha buy",
      "Outliers (buy)",
    ]);
    expect(within(panel).getByText("6 medidores sobre su escala de 90 días · primero el más cerca de su umbral")).toBeTruthy();
    expect(
      within(panel).getByText("Por encima de 30 % la lectura deja de ser confiable y las señales se suprimen."),
    ).toBeTruthy();
    expect(within(panel).getByText("Escala fija")).toBeTruthy();
    expect(within(panel).getByText("Ninguna regla lo usa ahora mismo.")).toBeTruthy();
  });
});

describe("descomposición e historia", () => {
  it("la brecha de hoy contra sus medias y su máximo, con la cobertura real", () => {
    montar();
    const panel = within(screen.getByText("Brecha hoy vs. historia").closest(".panel") as HTMLElement);
    expect(panel.getByText("Promedio 7 días")).toBeTruthy();
    expect(panel.getByText("15,87 %")).toBeTruthy();
    expect(panel.getByText("Máximo 90 días (87 días con dato)")).toBeTruthy();
    expect(panel.getByText("22,63 %")).toBeTruthy();
    expect(panel.getByText("El 15,34 % de hoy es el p56 de los últimos 90 días.")).toBeTruthy();
  });
});

describe("mapa de calor", () => {
  it("14 días × 24 horas VET del lado sell, con los cortes de la ventana", () => {
    montar();
    const mapa = seccion("Mapa de calor de la brecha");
    expect(within(mapa).getByText("últimos 14 días · bucket 1 h · VET · lado sell")).toBeTruthy();
    expect(within(mapa).getByRole("img", { name: "Brecha lado sell por hora en los últimos 14 días" })).toBeTruthy();
    expect(mapa.querySelectorAll(".calor-fila")).toHaveLength(14);
    expect(mapa.querySelectorAll(".calor-celda")).toHaveLength(14 * 24);
    expect(within(mapa).getByTitle("2026-10-14 · 20:00 VET · 18 %").className).toContain("calor-teal");
    expect(within(mapa).getByTitle("2026-10-13 · 22:00 VET · 12 %").className).toContain("calor-sage");
    expect(within(mapa).getByTitle("2026-10-01 · 00:00 VET · sin dato")).toBeTruthy();
    expect(within(mapa).getByText("p10 12 %")).toBeTruthy();
    expect(within(mapa).getByText("p90 18 %")).toBeTruthy();
  });

  it("sin series lo dice", () => {
    montar({ series: null });
    expect(within(seccion("Mapa de calor de la brecha")).getByText("Sin datos todavía")).toBeTruthy();
  });
});

describe("referencia P2P, procedencia y tasa oficial", () => {
  it("los dos lados del P2P; un lado sin dato lleva un guion", () => {
    montar();
    const panel = within(screen.getByText("Referencia P2P USDT/VES").closest(".panel") as HTMLElement);
    expect(panel.getByText("1.013,00")).toBeTruthy();
    expect(panel.getByText(/VWAP 1\.014,20 · mejor 1\.010,00/)).toBeTruthy();
    expect(panel.getByText(/liquidez 90\.000 USDT/)).toBeTruthy();
    expect(panel.getByText("—")).toBeTruthy();
  });

  it("la procedencia sin fila de cuota, y la nota sobre official_stale", () => {
    const { container } = montar();
    expect(screen.getByText("En vivo · calidad del dato")).toBeTruthy();
    expect(screen.getByText(/pasadas 6 h sin captura se sirve official_stale/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/cuota|X-RateLimit/i);
  });

  it("las tasas oficiales en el orden del ingestor, con fecha-valor y vigencia", () => {
    const s = snapshot();
    s.official_rates = [
      { ...s.official_rates[1] },
      { currency: "RUB", rate: "10.99670000", value_date: "2026-10-15", captured_at: s.official_rates[0].captured_at, stale: true },
      { ...s.official_rates[0] },
    ];
    montar({ snapshot: s });
    const tasas = seccion("Tasa oficial BCV");
    expect(within(tasas).getByText("fecha-valor 2026-10-15 · capturada hace 3 h")).toBeTruthy();
    expect([...tasas.querySelectorAll(".cifra-tarjeta-etiqueta")].map((e) => e.textContent)).toEqual([
      "USD/VES",
      "EUR/VES",
      "RUB/VES",
    ]);
    expect(within(tasas).getByText("879,2531")).toBeTruthy();
    expect(within(tasas).getByText("1.021,8800")).toBeTruthy();
    expect(within(tasas).getByText("no vigente")).toBeTruthy();
  });
});

describe("cronología de señales", () => {
  it("agrupada por regla: disparos, la última y qué hizo la brecha después", () => {
    montar();
    const cronologia = within(seccion("Cronología de señales"));
    expect(cronologia.getByText("ruleset v1 · agrupadas por regla · ventana de 30 días")).toBeTruthy();
    expect(cronologia.getByText("techo inminente")).toBeTruthy();
    expect(cronologia.getByText("1 disparo")).toBeTruthy();
    expect(cronologia.getByText("después de la última: efecto aún sin medir")).toBeTruthy();
    expect(cronologia.getByText("arranque alcista")).toBeTruthy();
    expect(cronologia.getByText("2 disparos")).toBeTruthy();
    expect(cronologia.getByText("última: hace 10 h")).toBeTruthy();
    expect(cronologia.getByText("después de la última: la brecha +0,48 pts a 12 h")).toBeTruthy();
  });

  it("cada grupo se abre con sus disparos", async () => {
    vi.useRealTimers();
    montar();
    const boton = screen.getByRole("button", { name: "Ver los disparos de arranque_alcista@v1" });
    expect(boton.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(boton);
    expect(boton.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("la brecha +0,48 pts a 12 h")).toBeTruthy();
    expect(screen.getByText("la brecha −0,14 pts a 12 h")).toBeTruthy();
    await userEvent.click(boton);
    expect(screen.queryByText("la brecha −0,14 pts a 12 h")).toBeNull();
  });

  it("ningún texto presenta un recuento de aciertos (RF-2)", () => {
    const { container } = montar();
    const cronologia = seccion("Cronología de señales");
    expect(cronologia.textContent).not.toMatch(/\d+\s+(de|of)\s+\d+/);
    expect(container.textContent).not.toMatch(/acert|acierto|\d+ de \d+ señales/i);
  });

  it("sin señales en la ventana lo dice", () => {
    montar({ snapshot: { ...snapshot(), signals: { window_days: 30, items: [] } } });
    expect(screen.getByText("Ninguna señal en los últimos 30 días.")).toBeTruthy();
  });
});

describe("profundidad", () => {
  it("volumen acumulado por banda, a cada lado", () => {
    montar();
    const profundidad = within(seccion("Profundidad P2P"));
    expect(profundidad.getByText("Compra (buy) — asks")).toBeTruthy();
    expect(profundidad.getByText("626.730 USDT")).toBeTruthy();
    expect(profundidad.getByText("1.014,0")).toBeTruthy();
    expect(profundidad.getByText("384 k")).toBeTruthy();
    expect(profundidad.getByText("Venta (sell) — bids")).toBeTruthy();
    expect(profundidad.getByText("2,50 M")).toBeTruthy();
  });
});

describe("sin datos e idioma", () => {
  it("cada panel dice que no hay datos; el texto fijo está", () => {
    montar({ snapshot: null, series: null });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Dashboard público");
    expect(screen.getAllByText("Sin datos todavía").length).toBeGreaterThanOrEqual(10);
    expect(screen.getByText("Público, en vivo y sin registro. Los mismos números llegan a tu sistema por REST y WSS.")).toBeTruthy();
  });

  it("en inglés, todo en inglés", async () => {
    vi.useRealTimers();
    montar();
    await userEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByText("Today's reading")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sideways and unchanged" })).toBeTruthy();
    expect(screen.getByText("Signal timeline")).toBeTruthy();
    expect(screen.getByText("2 firings")).toBeTruthy();
  });

  it("el prerender pinta la página con contenido, sin datos en vivo", () => {
    const html = pintar("/dashboard");
    expect(html).toContain("<main");
    expect(html).toContain("Lectura de hoy");
    expect(html).toContain("Cronología de señales");
  });
});
