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
    // La escala se rotula con PALABRAS —bajo/normal/alto—, nunca «percentil X»
    // (ADR-0019); el valor exacto de cada corte va en el `title`.
    const cortes = [...document.querySelectorAll(".vmw-medidor__cortes > span")];
    const brechaCortes = cortes.filter((c) =>
      ["10,55", "15,90", "24,18"].includes(c.getAttribute("title") ?? ""),
    );
    expect(brechaCortes.map((c) => c.textContent)).toEqual([
      "bajo",
      "normal",
      "alto",
    ]);
    expect(brechaCortes.map((c) => (c as HTMLElement).style.left)).toEqual([
      "10%",
      "50%",
      "90%",
    ]);
    // La marca de HOY va en la position del contrato (0.2996 → 29.96 %), no en
    // un ancho inventado. Y es una PASTILLA, distinta del umbral (línea coral):
    // si las dos se dibujaran igual no se sabría cuál es cuál.
    const barra = screen.getByLabelText(/Brecha buy: 13,22 %/);
    const hoy = barra.querySelector(".vmw-medidor__hoy") as HTMLElement;
    expect(hoy.style.left).toBe("29.96%");
    expect(barra.querySelector(".vmw-medidor__banda")).not.toBeNull();
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

  it("sin historia suficiente NO se pinta cifra, y la barra va vacía", () => {
    /*
     * La tarjeta es COMPARATIVA: el valor medido es real, pero sin escala
     * empírica solo invitaría a compararlo con una referencia que no existe. El
     * motor lo declara degradando `scale.source` a `ruleset`.
     */
    marketStore.resync({ analisis: FIXTURE_ANALISIS_RESPALDO });
    render(<GaugePanel />);

    expect(screen.getAllByText("sin historia suficiente").length).toBeGreaterThan(0);
    expect(
      document.querySelectorAll(".vmw-medidor__escala-barra--vacia").length,
    ).toBeGreaterThan(0);
    // Ni marca de hoy ni banda: no hay escala sobre la que situarlas.
    expect(document.querySelectorAll(".vmw-medidor__hoy")).toHaveLength(0);
    expect(document.querySelectorAll(".vmw-medidor__banda")).toHaveLength(0);
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
    // …pero ninguna marca de hoy, porque no hay escala donde situarla.
    expect(document.querySelectorAll(".vmw-medidor__hoy")).toHaveLength(0);
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
      .filter((c) => ["10.55", "15.90", "24.18"].includes(c.getAttribute("title") ?? ""));
    expect(cortesEn.map((c) => c.textContent)).toEqual(["low", "normal", "high"]);
    expect(screen.getByText(/The gap is narrower than usual/)).toBeTruthy();
    // El pie de aclaración salió; el registro acotado se sigue vigilando.
    const texto = document.body.textContent ?? "";
    expect(texto).not.toMatch(/It is not a prediction/);
    for (const prohibido of [/should/i, /will rise/i, /expected to/i]) {
      expect(texto).not.toMatch(prohibido);
    }

    await userEvent.click(desplegableDe("Gap buy", /Show explanation/));
    expect(
      screen.getByText(/How much more expensive the dollar is on the P2P market/),
    ).toBeTruthy();
  });
});
