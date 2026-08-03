/**
 * Secciones nuevas del rediseño.
 *
 * Lo que se comprueba en cada una es de qué lado cae: las que salen del
 * gateway muestran el dato real (y su vacío honesto cuando no hay), y las que
 * el diseño pide pero la plataforma no calcula llevan el sello «demo · sin
 * fuente» — la regla RF-5 aplicada al rediseño.
 */

import { cleanup, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { GapHeatmap } from "../../src/components/GapHeatmap";
import { GapPanel } from "../../src/components/GapPanel";
import {
  HeadlineStats,
  MarketRegimeCard,
} from "../../src/components/MarketRegimeCard";
import { config } from "../../src/config";
import { marketStore } from "../../src/state/marketStore";
import { AnalysisView } from "../../src/views/AnalysisView";
import {
  FIXTURE_ANALISIS,
  FIXTURE_INDICADORES,
} from "../contract/fixtures.test";
import { renderConProveedores as render } from "../render";
import { limpiarTokenDeTest, registrarTokenDeTest } from "../soporte";

const BASE = `${config.apiBaseUrl}/api/v1`;
const servidor = setupServer();

/** Una fila por hora hacia atrás desde ahora, con valores que suben. */
function serieHoraria(horas: number) {
  const ahora = Date.now();
  return Array.from({ length: horas }, (_, i) => ({
    as_of: new Date(ahora - i * 3_600_000).toISOString(),
    indicator: "p2p_brecha_pct_buy",
    currency: "VES",
    value: `${(12 + i * 0.1).toFixed(2)}`,
    calc_version: 1,
  }));
}

/** Lo que la SPA pidió de verdad: indicador e intervalo por llamada. */
const peticiones: { indicador: string | null; intervalo: string | null }[] = [];

function conHistorial(filas: ReturnType<typeof serieHoraria>) {
  peticiones.length = 0;
  servidor.use(
    http.get(`${BASE}/indicators/history`, ({ request }) => {
      const url = new URL(request.url);
      peticiones.push({
        indicador: url.searchParams.get("indicator"),
        intervalo: url.searchParams.get("interval"),
      });
      return HttpResponse.json({
        data: filas,
        pagination: {
          page: 1,
          page_size: 500,
          total_items: filas.length,
          has_more: false,
        },
        interval: "1h",
      });
    }),
  );
}

beforeAll(() => {
  servidor.listen({ onUnhandledRequest: "error" });
  registrarTokenDeTest();
});
afterEach(() => {
  cleanup();
  servidor.resetHandlers();
  marketStore.reset();
  window.localStorage.clear();
});
afterAll(() => {
  servidor.close();
  limpiarTokenDeTest();
});

// El panel de medidores tiene su propia suite: `tests/component/medidores.test.tsx`.

// La lectura del mercado tiene su propia suite: `tests/component/lectura.test.tsx`.

describe("MarketRegimeCard", () => {
  it("sin lectura lo dice; los minis viven aparte desde que es titular", () => {
    marketStore.push({
      topic: "indicators",
      event_id: "evento-regimen",
      occurred_at: "2026-07-30T12:00:00Z",
      data: {
        as_of: "2026-07-30T12:00:00Z",
        calc_version: 1,
        official_stale: false,
        triggered_by: "11111111-2222-3333-4444-555555555555",
        indicators: [
          {
            indicator: "p2p_outliers_pct_buy",
            currency: "VES",
            value: "0.50000000",
          },
        ],
      },
    });
    render(<MarketRegimeCard />);
    // El régimen dejó de ser demo: sin lectura se dice, no se sella un ejemplo.
    expect(screen.queryByText("demo · sin fuente")).toBeNull();
    expect(screen.getByText(/sin lectura del mercado/i)).toBeTruthy();
    // El titular pasó a ocupar todo el ancho, así que los indicadores de un
    // vistazo salieron a `HeadlineStats`: aquí ya no están.
    expect(screen.queryByText("0,50 %")).toBeNull();
  });

  it("los minis son los del prototipo: brecha vs. 30 d y oferta/demanda", () => {
    marketStore.resync({ analisis: FIXTURE_ANALISIS });
    render(<HeadlineStats />);

    // 13,45 − 16,22 = −2,77 pts contra su media de 30 días…
    expect(screen.getByText("-2,77 pts")).toBeTruthy();
    // …y la nota declara el TRAMO REAL, porque compra solo cubre 12 de 30.
    expect(screen.getByText(/contra su promedio de 12 d \(de 30\)/)).toBeTruthy();
  });

  it("los dos minis caben EN LA MISMA FILA de su columna", () => {
    /*
     * jsdom no resuelve layout, así que esto fija la INTENCIÓN: el ancho mínimo
     * de la rejilla. Con los 300 px de antes solo cabía un mini en la columna
     * —que mide la mitad del contenedor— y se apilaban, gastando el doble de
     * alto para dos cifras de un vistazo. Con 240 caben los dos, cada uno en
     * ~1/4 del ancho de la vista (medido: 268 de 1180).
     */
    marketStore.resync({ analisis: FIXTURE_ANALISIS });
    const { container } = render(<HeadlineStats />);

    const rejilla = container.querySelector(".vmw-grid") as HTMLElement;
    expect(rejilla.style.getPropertyValue("--min")).toBe("240px");
    expect(container.querySelectorAll(".vmw-tarjeta--sm")).toHaveLength(2);
  });

  it("la mediana del ratio sale del corte p50, no de un «backtest»", () => {
    /*
     * El prototipo rotula «p50 backtest 0,47». No hay backtest ninguno: es el
     * percentil 50 observado en la ventana, que el contrato ya publica en
     * `scale.cuts`.
     */
    marketStore.resync({
      analisis: {
        ...FIXTURE_ANALISIS,
        indicators: [
          {
            ...FIXTURE_ANALISIS.indicators[0],
            indicator: "p2p_ratio_oferta_demanda",
            value: "0.59",
          },
        ],
      },
    });
    render(<HeadlineStats />);
    expect(screen.getByText(/mediana de 90 días: 15,9/)).toBeTruthy();
  });

  it("sin escala empírica NO se cita mediana: se dice lo genérico", () => {
    // El ratio no está en el análisis del fixture, así que no hay p50 que citar.
    marketStore.resync({ analisis: FIXTURE_ANALISIS });
    render(<HeadlineStats />);
    expect(screen.queryByText(/mediana de 90 días/)).toBeNull();
    expect(screen.getByText(/insumo de las reglas de señal/)).toBeTruthy();
  });

});

/** Serie horaria con un valor fijo, para distinguir las dos líneas por su rango. */
function serieConstante(horas: number, valor: string) {
  const ahora = Date.now();
  return Array.from({ length: horas }, (_, i) => ({
    as_of: new Date(ahora - i * 3_600_000).toISOString(),
    indicator: "p2p_brecha_pct_buy",
    currency: "VES",
    value: valor,
    calc_version: 1,
  }));
}

/** Responde distinto según el indicador pedido. */
function conHistorialPorLado(compra: string, venta: string) {
  peticiones.length = 0;
  servidor.use(
    http.get(`${BASE}/indicators/history`, ({ request }) => {
      const url = new URL(request.url);
      const indicador = url.searchParams.get("indicator");
      peticiones.push({ indicador, intervalo: url.searchParams.get("interval") });
      const filas = serieConstante(30, indicador?.endsWith("_sell") ? venta : compra);
      return HttpResponse.json({
        data: filas,
        pagination: { page: 1, page_size: 500, total_items: filas.length, has_more: false },
        interval: "1h",
      });
    }),
  );
}

describe("GapPanel · sparkline", () => {
  it("pinta LAS DOS series con su leyenda", async () => {
    conHistorialPorLado("14.25", "12.75");
    marketStore.resync({ indicadores: FIXTURE_INDICADORES });
    render(<GapPanel />);

    await waitFor(() =>
      expect(document.querySelectorAll(".vmw-spark polyline").length).toBe(3),
    );
    // Área + línea de venta + línea de compra.
    // El pie rotula mín y máx CON SU HORA: un mínimo de las 03:00 y uno de hace
    // diez minutos dicen cosas distintas, y el valor solo no los distingue.
    expect(screen.getByText(/mín 14,25 % a las \d{2}:\d{2}/)).toBeTruthy();
    expect(screen.getByText(/máx 14,25 % a las \d{2}:\d{2}/)).toBeTruthy();
    expect(screen.getByText("venta 12,75 %–12,75 %")).toBeTruthy();
  });

  it("pide un lado a cada serie y NADA MÁS", async () => {
    conHistorialPorLado("14.25", "12.75");
    marketStore.resync({ indicadores: FIXTURE_INDICADORES });
    render(<GapPanel />);

    await waitFor(() => expect(peticiones.length).toBe(2));
    expect(peticiones.map((p) => p.indicador).sort()).toEqual([
      "p2p_brecha_pct_buy",
      "p2p_brecha_pct_sell",
    ]);
    expect(peticiones.every((p) => p.intervalo === "1h")).toBe(true);
  });

  it("con un solo lado disponible pinta ese y no finge el otro", async () => {
    peticiones.length = 0;
    servidor.use(
      http.get(`${BASE}/indicators/history`, ({ request }) => {
        const url = new URL(request.url);
        const indicador = url.searchParams.get("indicator");
        peticiones.push({ indicador, intervalo: url.searchParams.get("interval") });
        const filas = indicador?.endsWith("_sell") ? [] : serieConstante(30, "14.25");
        return HttpResponse.json({
          data: filas,
          pagination: { page: 1, page_size: 500, total_items: filas.length, has_more: false },
          interval: "1h",
        });
      }),
    );
    marketStore.resync({ indicadores: FIXTURE_INDICADORES });
    render(<GapPanel />);

    await waitFor(() =>
      expect(screen.getByText(/mín 14,25 % a las/)).toBeTruthy(),
    );
    expect(screen.queryByText(/venta /)).toBeNull();
  });
});

describe("GapPanel · el coral es del disparo", () => {
  it("ninguna de las dos series usa coral", async () => {
    /*
     * La venta pasó de coral a teal al 45 %: el coral queda para el disparo. Las
     * dos series se separan por LUMINOSIDAD (7,85:1 contra 2,82:1 sobre la
     * tarjeta), que es lo que el daltonismo no altera, y la de venta sigue
     * discontinua — una tercera pista que no depende del color en absoluto.
     */
    conHistorialPorLado("14.25", "12.75");
    marketStore.resync({ indicadores: FIXTURE_INDICADORES });
    render(<GapPanel />);

    await waitFor(() =>
      expect(document.querySelectorAll(".vmw-spark polyline").length).toBe(3),
    );
    const trazos = [...document.querySelectorAll(".vmw-spark polyline")];
    for (const trazo of trazos) {
      expect(trazo.getAttribute("stroke") ?? "").not.toContain("coral");
      expect(trazo.getAttribute("stroke") ?? "").not.toContain("sell");
    }
    // Y la de venta conserva su forma discontinua.
    expect(
      trazos.some((t) => t.getAttribute("stroke-dasharray") !== null),
    ).toBe(true);
  });

  it("el eje Y lleva sus tres marcas rotuladas", async () => {
    conHistorialPorLado("14.25", "12.75");
    marketStore.resync({ indicadores: FIXTURE_INDICADORES });
    render(<GapPanel />);

    await waitFor(() =>
      expect(document.querySelectorAll(".vmw-spark__eje > span").length).toBe(3),
    );
  });
});

describe("GapHeatmap", () => {
  it("pinta una celda por hora con su valor exacto en el tooltip", async () => {
    conHistorial(serieHoraria(30));
    render(<GapHeatmap />);

    await waitFor(() =>
      expect(document.querySelectorAll(".vmw-calor__fila").length).toBe(14),
    );
    const celdas = document.querySelectorAll(".vmw-calor__celda");
    expect(celdas).toHaveLength(14 * 24);
    const conDato = [...celdas].filter(
      (celda) => celda.getAttribute("style") !== null,
    );
    expect(conDato.length).toBeGreaterThan(0);
    expect(conDato[0].getAttribute("title")).toMatch(/\d+:00 —/);
    // Las horas sin bucket quedan vacías y lo dicen en el tooltip.
    const sinDato = [...celdas].find((celda) =>
      celda.getAttribute("title")?.includes("sin dato"),
    );
    expect(sinDato).toBeTruthy();
  });

  it("sin serie lo dice en vez de dibujar una parrilla vacía", async () => {
    conHistorial([]);
    render(<GapHeatmap />);
    await waitFor(() =>
      expect(screen.getByText(/sin serie horaria/i)).toBeTruthy(),
    );
  });

  it("mira el lado VENTA, que es el que tiene historia real", async () => {
    /*
     * Con el lado compra las dos primeras filas del mapa salían vacías: esa
     * serie arranca el 2026-07-20 y la ventana son 14 días. La de venta tiene
     * 242 días derivados (ADR-0013 RF-7).
     */
    conHistorial(serieHoraria(30));
    render(<GapHeatmap />);

    await waitFor(() => expect(peticiones.length).toBeGreaterThan(0));
    expect(peticiones.map((p) => p.indicador)).toEqual(["p2p_brecha_pct_sell"]);
    expect(screen.getByText(/lado venta/)).toBeTruthy();
  });

  it("ancla la leyenda en el p10 y el p90 de la ventana que pinta", async () => {
    /*
     * `serieHoraria(30)` va de 12,00 a 14,90 en pasos de 0,10. Con el percentil
     * discreto (ADR-0017) el p10 es la 3.ª muestra y el p90 la 27.ª: valores
     * que EXISTEN en la serie, no interpolados — se están rotulando.
     */
    conHistorial(serieHoraria(30));
    render(<GapHeatmap />);

    await waitFor(() => expect(screen.getByText(/p10 12,20/)).toBeTruthy());
    expect(screen.getByText(/p90 14,60/)).toBeTruthy();
    // Y dice de dónde salen esos percentiles: de los 14 días pintados, no de
    // una escala publicada — el lado venta no es medidor del panel.
    expect(screen.getByText(/percentiles de estos 14 días/)).toBeTruthy();
  });

  it("el coral marca SOLO lo que supera el p90", async () => {
    conHistorial(serieHoraria(30));
    render(<GapHeatmap />);

    await waitFor(() =>
      expect(document.querySelectorAll(".vmw-calor__celda").length).toBe(14 * 24),
    );
    const pintadas = [...document.querySelectorAll(".vmw-calor__celda")]
      .map((c) => c.getAttribute("style"))
      .filter((s): s is string => s !== null);

    // Por encima de 14,60 solo quedan 14,70 · 14,80 · 14,90.
    const exceso = pintadas.filter((s) => s.includes("--calor-alto-"));
    expect(exceso).toHaveLength(3);
    // El resto usa la rampa secuencial, y ninguna celda se queda sin color.
    expect(pintadas.filter((s) => /var\(--calor-\d\)/.test(s))).toHaveLength(
      pintadas.length - 3,
    );
  });

  it("el exceso se DICE, no solo se pinta", async () => {
    /*
     * La categoría no puede vivir solo en el tono: quien no distinga el coral
     * del teal se quedaría sin el dato. Va también en el tooltip.
     */
    conHistorial(serieHoraria(30));
    render(<GapHeatmap />);

    await waitFor(() =>
      expect(document.querySelectorAll(".vmw-calor__celda").length).toBe(14 * 24),
    );
    const titulos = [...document.querySelectorAll(".vmw-calor__celda")].map((c) =>
      c.getAttribute("title"),
    );
    expect(titulos.filter((t) => t?.includes("por encima del p90"))).toHaveLength(3);
  });

  it("pide UNA sola serie: la diaria de 90 días ya no la usa nadie", async () => {
    /*
     * La consumía la descomposición, que pasó a `gap_history` del contrato. Se
     * disparaba una vez por componente que usara el hook —una paginación de 90
     * días cada una— sin que nadie leyera el resultado.
     */
    conHistorial(serieHoraria(30));
    render(<GapHeatmap />);

    await waitFor(() => expect(peticiones.length).toBeGreaterThan(0));
    expect(peticiones.map((p) => p.intervalo)).toEqual(["1h"]);
  });
});

// La descomposición de la brecha tiene su propia suite:
// `tests/component/descomposicion.test.tsx`.

describe("AnalysisView", () => {
  it("sella escenarios y riesgos, y calcula la presión de liquidez real", () => {
    marketStore.resync({
      indicadores: {
        ...FIXTURE_INDICADORES,
        volumes: { buy: "1201837", sell: "2025806" },
      },
    });
    render(<AnalysisView />);

    // Dos sellos: el de la cabecera (escenarios) y el de riesgos.
    expect(screen.getAllByText("demo · sin fuente")).toHaveLength(2);
    expect(screen.getByText("asks 1.201.837 USDT")).toBeTruthy();
    expect(screen.getByText("bids 2.025.806 USDT")).toBeTruthy();
  });

  it("sin liquidez servida lo dice en vez de dibujar una barra vacía", () => {
    marketStore.resync({
      indicadores: { ...FIXTURE_INDICADORES, volumes: null },
    });
    render(<AnalysisView />);
    expect(screen.getByText(/sin liquidez servida/i)).toBeTruthy();
  });
});

describe("Una sola superficie con tinte", () => {
  it("el brillo teal vive SOLO en «Lectura de hoy»", () => {
    /*
     * El tinte separa la lectura del resto, y eso solo funciona mientras sea el
     * único: dos superficies teñidas compiten y ninguna destaca. `GapPanel`
     * conserva su degradado NEUTRO, que es superficie y no acento.
     */
    marketStore.resync({ analisis: FIXTURE_ANALISIS, indicadores: FIXTURE_INDICADORES });
    render(
      <>
        <MarketRegimeCard />
        <GapPanel />
      </>,
    );

    const brillos = [...document.querySelectorAll(".vmw-hero__brillo")];
    expect(brillos).toHaveLength(1);
    expect(brillos[0].closest(".vmw-veredicto")).not.toBeNull();
  });
});
