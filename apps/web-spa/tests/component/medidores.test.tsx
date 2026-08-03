/**
 * Panel de instrumentos (RF-11): el panel dejó de ser un bloque demo.
 *
 * Lo que se comprueba aquí es que TODO lo pintado sale del contrato —el pie de
 * escala, el relleno, cada marca de umbral y la frase de banda— y que cuando el
 * contrato no trae algo, el panel lo dice en vez de dibujarlo a ojo.
 */

import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { GaugePanel } from "../../src/components/GaugePanel";
import { marketStore } from "../../src/state/marketStore";
import {
  FIXTURE_ANALISIS,
  FIXTURE_ANALISIS_RESPALDO,
} from "../contract/fixtures.test";
import { renderConProveedores as render } from "../render";

/**
 * El desplegable del medidor que se NOMBRA.
 *
 * El panel se ordena por cercanía al umbral desde el prototipo `Criterio`, así
 * que el índice de un medidor cambia con los datos. Seleccionar por posición
 * ataba estos tests a un orden que ya no es constante.
 */
function desplegableDe(medidor: string, etiqueta = /Ver explicación/): HTMLElement {
  const tarjeta = screen.getByText(medidor).closest(".vmw-tarjeta");
  if (tarjeta === null) {
    throw new Error(`no encuentro la tarjeta del medidor «${medidor}»`);
  }
  return within(tarjeta as HTMLElement).getByRole("button", { name: etiqueta });
}

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

    // Los cortes REALES publicados, cada uno BAJO su posición en la barra.
    // Antes iban como una cadena en la cabecera: el número estaba, pero no
    // dónde caía, que es justo lo que una escala tiene que enseñar.
    const cortes = [...document.querySelectorAll(".vmw-medidor__cortes > span")];
    const brechaCortes = cortes.filter((c) =>
      ["10,55", "15,90", "24,18"].includes(c.textContent ?? ""),
    );
    expect(brechaCortes.map((c) => (c as HTMLElement).style.left)).toEqual([
      "10%",
      "50%",
      "90%",
    ]);
    // La palabra sigue estando: el proyecto rotula bajo/normal/alto, no p10.
    expect(brechaCortes.map((c) => c.getAttribute("title"))).toEqual([
      "bajo",
      "normal",
      "alto",
    ]);
    expect(screen.getAllByText("90 d").length).toBeGreaterThan(0);
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
    await userEvent.click(desplegableDe("Ratio oferta/demanda"));
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

    const boton = desplegableDe("Brecha buy");
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
    expect(screen.getAllByText(/cuya fecha-valor ya pasó/)).toHaveLength(1);
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

describe("Distintivo y pie de la tarjeta", () => {
  it("el distintivo dice la BANDA, nunca un percentil", () => {
    /*
     * ADR-0019: la interfaz rotula bajo/normal/alto y ninguna cadena dice
     * «percentil X». El prototipo pedía «p3 · 90 d» y se descartó a propósito.
     */
    marketStore.resync({ analisis: FIXTURE_ANALISIS });
    render(<GaugePanel />);

    const badges = [...document.querySelectorAll(".vmw-medidor__badge")].map(
      (b) => b.textContent ?? "",
    );
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(badge).not.toMatch(/^p\d/);
      expect(badge).not.toMatch(/percentil/i);
    }
  });

  it("el distintivo coral lo decide el MOTOR, no el panel", () => {
    // `summary.blocked_by` nombra el medidor que frena el aviso más cercano.
    const bloqueado = FIXTURE_ANALISIS.indicators[0].indicator;
    marketStore.resync({
      analisis: {
        ...FIXTURE_ANALISIS,
        summary: { ...FIXTURE_ANALISIS.summary, blocked_by: bloqueado },
      },
    });
    render(<GaugePanel />);

    const coral = [...document.querySelectorAll('[data-tono="coral"]')];
    expect(coral).toHaveLength(1);
    expect(coral[0].textContent).toBe("Falta por moverse");
  });

  it("sin lectura del medidor que bloquea, no se pinta distintivo alguno", () => {
    /*
     * El fixture bloquea con `p2p_momentum_bid_3h_pct`, que NO tiene lectura en
     * esa revisión: sin lectura no hay banda que rotular, y una tarjeta vacía no
     * puede llevar distintivo. Se dice callando, no inventando.
     */
    marketStore.resync({ analisis: FIXTURE_ANALISIS });
    render(<GaugePanel />);

    expect(document.querySelectorAll('[data-tono="coral"]')).toHaveLength(0);
  });

  it("dice a qué aviso alimenta cada medidor, y cuándo a ninguno", () => {
    marketStore.resync({ analisis: FIXTURE_ANALISIS });
    render(<GaugePanel />);

    const pies = [...document.querySelectorAll(".vmw-medidor__reglas-pie")].map(
      (n) => n.textContent ?? "",
    );
    expect(pies.length).toBe(FIXTURE_ANALISIS.indicators.length);
    // «Ninguna» también informa: ese número no puede disparar nada por sí solo.
    expect(
      pies.some((p) => /@v1/.test(p) || /ninguna regla la usa/.test(p)),
    ).toBe(true);
  });
});

describe("GaugePanel en inglés", () => {
  it("redacta la misma lectura sin dejar cadenas en español", async () => {
    marketStore.resync({ analisis: FIXTURE_ANALISIS });
    render(<GaugePanel />, { idioma: "en" });

    const cortesEn = [...document.querySelectorAll(".vmw-medidor__cortes > span")]
      .filter((c) => ["10.55", "15.90", "24.18"].includes(c.textContent ?? ""));
    expect(cortesEn.map((c) => c.getAttribute("title"))).toEqual([
      "low",
      "normal",
      "high",
    ]);
    expect(screen.getByText(/The gap is narrower than usual/)).toBeTruthy();
    expect(
      screen.getByText(
        /The alert closest to firing is techo inminente@v1: 1 of 3 conditions met\./,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/It is not a prediction of what will happen\./),
    ).toBeTruthy();

    await userEvent.click(desplegableDe("Gap buy", /Show explanation/));
    expect(
      screen.getByText(/How much more expensive the dollar is on the P2P market/),
    ).toBeTruthy();
  });
});
