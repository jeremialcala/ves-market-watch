/**
 * Panel de instrumentos (RF-11): el panel dejó de ser un bloque demo.
 *
 * Lo que se comprueba aquí es que TODO lo pintado sale del contrato —el pie de
 * escala, el relleno, cada marca de umbral y la frase de banda— y que cuando el
 * contrato no trae algo, el panel lo dice en vez de dibujarlo a ojo.
 */

import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { GaugePanel } from "../../src/components/GaugePanel";
import { marketStore } from "../../src/state/marketStore";
import {
  FIXTURE_ANALISIS,
  FIXTURE_ANALISIS_RESPALDO,
} from "../contract/fixtures.test";
import { renderConProveedores as render } from "../render";

afterEach(() => {
  cleanup();
  marketStore.reset();
  window.localStorage.clear();
});

/** Los indicadores vigentes que el store tendría tras el push del lote. */
function sembrarVigentes() {
  marketStore.push({
    topic: "indicators",
    event_id: "evento-medidores",
    occurred_at: "2026-07-27T12:00:00Z",
    data: {
      as_of: "2026-07-27T12:00:00Z",
      calc_version: 1,
      official_stale: false,
      triggered_by: "11111111-2222-3333-4444-555555555555",
      indicators: [
        { indicator: "p2p_brecha_pct_buy", currency: "VES", value: "13.22" },
        { indicator: "p2p_spread_pct", currency: "VES", value: "0.56" },
        {
          indicator: "p2p_ratio_oferta_demanda",
          currency: "VES",
          value: "0.59",
        },
      ],
    },
  });
}

describe("GaugePanel con análisis", () => {
  it("pinta el pie con los percentiles reales y el relleno del contrato", () => {
    marketStore.resync({ analisis: FIXTURE_ANALISIS });
    render(<GaugePanel />);

    // Pie de escala: los cortes REALES publicados, no una cadena fija.
    expect(screen.getByText(/bajo 10,55 · normal 15,90 · alto 24,18 · 90 d/)).toBeTruthy();
    // Relleno = position del contrato (0.2996 → 29.96 %), no un ancho inventado.
    const barra = screen.getByLabelText(/Brecha buy: 13,22 %/);
    const relleno = barra.querySelector(".vmw-barra__relleno") as HTMLElement;
    expect(relleno.style.width).toBe("29.96%");
    // La frase de banda es la del indicador y su banda, no una nota genérica.
    expect(
      screen.getByText(/La brecha está más estrecha que de costumbre/),
    ).toBeTruthy();
  });

  it("NO lleva sello demo: el dato es real", () => {
    marketStore.resync({ analisis: FIXTURE_ANALISIS });
    render(<GaugePanel />);
    expect(screen.queryByText("demo · sin fuente")).toBeNull();
  });

  it("dibuja una marca por regla y dice en palabras cuánto falta", async () => {
    marketStore.resync({ analisis: FIXTURE_ANALISIS_RESPALDO });
    render(<GaugePanel />);

    // El ratio alimenta dos condiciones en el fixture ⇒ dos marcas.
    const barra = screen.getByLabelText(/Ratio oferta\/demanda: 0,59/);
    expect(barra.querySelectorAll(".vmw-barra__umbral")).toHaveLength(2);

    // …y el desplegable lo repite en texto: el color nunca codifica solo.
    const botones = screen.getAllByRole("button", { name: /Ver explicación/ });
    await userEvent.click(botones[1]);
    expect(
      screen.getByText(
        /techo inminente: el sistema avisa cuando baja de 0,2\. Ahora faltan 0,39\./,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /correccion inminente: el sistema avisa cuando pasa de 2\. Ahora faltan 1,41\./,
      ),
    ).toBeTruthy();
  });

  it("en respaldo del ruleset no inventa banda ni relleno sin cortes", () => {
    marketStore.resync({ analisis: FIXTURE_ANALISIS_RESPALDO });
    render(<GaugePanel />);

    // Pie con el contador de muestras, no con percentiles que no existen.
    expect(
      screen.getAllByText(
        /comparando con los umbrales de aviso · 137\/200 lecturas en 90 d/,
      ).length,
    ).toBeGreaterThan(0);
    // La brecha no alimenta reglas ⇒ sin cortes ⇒ sin relleno.
    expect(document.querySelectorAll(".vmw-barra--sin-escala").length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        /Todavía no hay suficiente historia para decir si esta brecha/,
      ),
    ).toBeTruthy();
  });

  it("el desplegable se abre con teclado y expone aria-expanded", async () => {
    marketStore.resync({ analisis: FIXTURE_ANALISIS });
    render(<GaugePanel />);

    const boton = screen.getAllByRole("button", { name: /Ver explicación/ })[0];
    expect(boton.getAttribute("aria-expanded")).toBe("false");
    boton.focus();
    await userEvent.keyboard("{Enter}");
    expect(boton.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("region", { name: "Brecha buy" })).toBeTruthy();
    // La glosa de la escala aparece UNA vez, solo en el desplegable.
    expect(screen.getByText(/solo se queda por debajo 1 de cada 10 veces/)).toBeTruthy();
  });

  it("la síntesis nombra la regla más cercana, la bloqueante y la aclaración", () => {
    marketStore.resync({ analisis: FIXTURE_ANALISIS });
    render(<GaugePanel />);

    expect(
      screen.getByText(
        /El aviso más cerca de activarse es techo inminente@v1: cumple 1 de 3 condiciones\. Falta que se mueva p2p momentum bid 3h pct\./,
      ),
    ).toBeTruthy();
    // La frontera con el pronóstico va SIEMPRE.
    expect(
      screen.getByText(/No es una predicción de lo que va a pasar\./),
    ).toBeTruthy();
  });

  it("sin reglas evaluables lo dice en vez de callarlo", () => {
    marketStore.resync({ analisis: FIXTURE_ANALISIS_RESPALDO });
    render(<GaugePanel />);
    expect(
      screen.getByText(
        /Solo 0 de 3 avisos se pueden evaluar: a los demás les falta algún dato actualizado\./,
      ),
    ).toBeTruthy();
  });

  it("con confianza baja los avisos se declaran desactivados", () => {
    marketStore.resync({
      analisis: {
        ...FIXTURE_ANALISIS,
        confidence: "low",
        indicators: [
          ...FIXTURE_ANALISIS.indicators,
          {
            ...FIXTURE_ANALISIS.indicators[0],
            indicator: "p2p_outliers_pct_buy",
            value: "42.00",
          },
        ],
      },
    });
    render(<GaugePanel />);
    expect(
      screen.getByText(
        /Datos poco confiables \(42 % de anuncios con precio raro\): los avisos están desactivados/,
      ),
    ).toBeTruthy();
  });

  it("marca el aviso de tasa oficial rancia SOLO bajo la brecha", () => {
    marketStore.resync({ analisis: FIXTURE_ANALISIS_RESPALDO });
    render(<GaugePanel />);
    expect(screen.getAllByText(/lleva más de 6 horas sin actualizarse/)).toHaveLength(1);
  });
});

describe("GaugePanel sin análisis", () => {
  it("muestra los valores vigentes sin explicación ni barras", () => {
    sembrarVigentes();
    render(<GaugePanel />);

    // El valor real sigue ahí…
    expect(screen.getByText("0,59")).toBeTruthy();
    expect(screen.getByText("0,56 %")).toBeTruthy();
    // …pero ninguna barra con relleno, y se dice por qué.
    expect(document.querySelectorAll(".vmw-barra__relleno")).toHaveLength(0);
    expect(
      screen.getAllByText(/Sin lectura disponible/).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/sin valor vigente/i).length).toBeGreaterThan(0);
  });

  it("un indicador sin lectura en la revisión lo declara", () => {
    sembrarVigentes();
    marketStore.resync({ analisis: FIXTURE_ANALISIS });
    render(<GaugePanel />);
    // El ratio tiene valor vigente pero no entró en `indicators` del análisis.
    expect(
      screen.getByText(/el motor no recalculó este medidor/),
    ).toBeTruthy();
  });
});

describe("GaugePanel en inglés", () => {
  it("redacta la misma lectura sin dejar cadenas en español", async () => {
    marketStore.resync({ analisis: FIXTURE_ANALISIS });
    render(<GaugePanel />, { idioma: "en" });

    expect(screen.getByText(/low 10.55 · normal 15.90 · high 24.18 · 90 d/)).toBeTruthy();
    expect(screen.getByText(/The gap is narrower than usual/)).toBeTruthy();
    expect(
      screen.getByText(
        /The alert closest to firing is techo inminente@v1: 1 of 3 conditions met\./,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/It is not a prediction of what will happen\./),
    ).toBeTruthy();

    const boton = screen.getAllByRole("button", { name: /Show explanation/ })[0];
    await userEvent.click(boton);
    expect(
      screen.getByText(/How much more expensive the dollar is on the P2P market/),
    ).toBeTruthy();
  });
});
