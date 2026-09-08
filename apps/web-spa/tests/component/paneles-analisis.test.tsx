/**
 * Los dos paneles que el prototipo `Criterio` añade al dashboard.
 *
 * Ninguno inventa dato: «Distancia al disparo» sale de `rule_proximity` y
 * «Calidad y procedencia» reúne lo que el análisis ya publica. Lo que se vigila
 * aquí es justamente eso — que no aparezca ninguna cifra que el contrato no
 * traiga, y que los silencios del motor se respeten.
 */

import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DataProvenance } from "../../src/components/DataProvenance";
import { RuleDistance } from "../../src/components/RuleDistance";
import { marketStore } from "../../src/state/marketStore";
import { FIXTURE_ANALISIS } from "../contract/fixtures.test";
import { renderConProveedores as render } from "../render";

afterEach(() => {
  cleanup();
  marketStore.reset();
  window.localStorage.clear();
});

function conAnalisis(cambios: Record<string, unknown> = {}) {
  marketStore.resync({ analisis: { ...FIXTURE_ANALISIS, ...cambios } });
}

describe("Distancia al disparo", () => {
  it("nombra la regla más cercana y desglosa sus condiciones", () => {
    conAnalisis();
    render(<RuleDistance />);

    expect(screen.getByText("techo inminente")).toBeTruthy();
    expect(screen.getByText("cumple 1 de 3")).toBeTruthy();
    // Una fila por condición, con su umbral en palabras.
    expect(screen.getByText("p2p momentum bid 3h pct")).toBeTruthy();
    expect(screen.getByText("necesita > 1,5")).toBeTruthy();
    expect(screen.getByText("necesita < 0,5")).toBeTruthy();
  });

  it("dice a cuánto está cada condición, y cuál ya está cumplida", () => {
    conAnalisis();
    render(<RuleDistance />);
    expect(screen.getByText("falta 1,20")).toBeTruthy();
    expect(screen.getByText("cumplida")).toBeTruthy();
  });

  it("nombra el indicador que bloquea", () => {
    conAnalisis();
    render(<RuleDistance />);
    expect(
      screen.getByText(/El que falta por moverse es p2p momentum bid 3h pct/),
    ).toBeTruthy();
  });

  it("un indicador sin valor vigente sale como «—», no rellenado", () => {
    conAnalisis({
      rule_proximity: [
        {
          ...FIXTURE_ANALISIS.rule_proximity[0],
          conditions: [
            {
              ...FIXTURE_ANALISIS.rule_proximity[0].conditions[0],
              value: null,
              distance: null,
            },
          ],
        },
      ],
    });
    render(<RuleDistance />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("COHERENCIA: nombra la MISMA regla que la síntesis del panel", () => {
    /*
     * El defecto que motivó este test: este panel recalculaba «la más cercana»
     * por su cuenta y, con dos reglas empatadas a cero condiciones cumplidas,
     * nombraba una mientras la síntesis del panel de instrumentos nombraba otra
     * — las dos en la misma pantalla. La decide el motor.
     */
    conAnalisis({
      summary: { ...FIXTURE_ANALISIS.summary, closest_rule: "otra_regla@v1" },
      rule_proximity: [
        FIXTURE_ANALISIS.rule_proximity[0],
        {
          ...FIXTURE_ANALISIS.rule_proximity[0],
          rule: "otra_regla@v1",
          type: "otra_regla",
          conditions_met: 0,
        },
      ],
    });
    render(<RuleDistance />);
    expect(screen.getByText("otra regla")).toBeTruthy();
    expect(screen.queryByText("techo inminente")).toBeNull();
  });

  it("sin regla más cercana declarada, no se elige una por cuenta propia", () => {
    conAnalisis({
      summary: { ...FIXTURE_ANALISIS.summary, closest_rule: null },
    });
    render(<RuleDistance />);
    expect(screen.getByText(/Ninguna regla es evaluable/)).toBeTruthy();
  });

  it("con ninguna regla evaluable lo dice en vez de medir distancias", () => {
    /*
     * Es el caso de confianza baja: el motor no calculó la microestructura, así
     * que hablar de proximidad citaría cifras que nadie computó.
     */
    conAnalisis({
      rule_proximity: [
        { ...FIXTURE_ANALISIS.rule_proximity[0], evaluable: false },
      ],
    });
    render(<RuleDistance />);
    expect(screen.getByText(/Ninguna regla es evaluable/)).toBeTruthy();
  });

  it("no predice — y ya no necesita decirlo", () => {
    /*
     * El pie que explicaba el panel salió (2026-08-02): la tarjeta describe el
     * mercado, no se describe a sí misma. El control no era esa frase sino ESTO:
     * que en el texto renderizado no aparezca nada predictivo. Al quitar el pie,
     * además, la comprobación deja de necesitar el apaño de recortarlo antes de
     * buscar «va a dispararse» dentro de él.
     */
    conAnalisis();
    render(<RuleDistance />);
    const texto = document.body.textContent ?? "";

    expect(texto).not.toMatch(/No es una predicción/);
    for (const prohibido of [
      /va a dispararse/i,
      /se espera/i,
      /probabilidad/i,
      /deber[íi]as/i,
    ]) {
      expect(texto).not.toMatch(prohibido);
    }
  });

  it("en inglés", () => {
    conAnalisis();
    render(<RuleDistance />, { idioma: "en" });
    expect(screen.getByText("Distance to trigger")).toBeTruthy();
    expect(screen.getByText("1 of 3 met")).toBeTruthy();
  });
});

describe("Calidad y procedencia del dato", () => {
  it("cuenta cuántos medidores van sobre percentiles reales", () => {
    conAnalisis();
    render(<DataProvenance />);
    expect(screen.getByText("2 sobre percentiles reales")).toBeTruthy();
  });

  it("declara el respaldo cuando algún medidor no tiene escala empírica", () => {
    conAnalisis({
      indicators: [
        FIXTURE_ANALISIS.indicators[0],
        {
          ...FIXTURE_ANALISIS.indicators[1],
          scale: { ...FIXTURE_ANALISIS.indicators[1].scale, source: "ruleset" },
        },
      ],
    });
    render(<DataProvenance />);
    expect(
      screen.getByText("1 sobre percentiles reales · 1 en respaldo del ruleset"),
    ).toBeTruthy();
  });

  it("declara el ALCANCE REAL de la historia de cada lado", () => {
    /*
     * La misma honestidad que rotula la descomposición en sus ventanas, dicha
     * una vez: compra tiene 12 días de los 90 pedidos, venta los 90.
     */
    conAnalisis();
    render(<DataProvenance />);
    expect(screen.getByText("12 días de los 90 pedidos")).toBeTruthy();
    expect(screen.getByText("90 días completos")).toBeTruthy();
  });

  it("marca la confianza baja y la oficial rancia", () => {
    conAnalisis({ confidence: "low", official_stale: true });
    render(<DataProvenance />);
    expect(screen.getByText(/baja · demasiados precios raros/)).toBeTruthy();
    expect(screen.getByText("sin tasa para hoy")).toBeTruthy();
  });

  it("con todo en orden no alarma", () => {
    conAnalisis();
    render(<DataProvenance />);
    expect(screen.getByText("normal")).toBeTruthy();
    expect(screen.getByText("vigente")).toBeTruthy();
  });

  it("sin análisis lo dice en vez de una lista vacía", () => {
    render(<DataProvenance />);
    expect(screen.getByText(/Sin análisis de la revisión todavía/)).toBeTruthy();
  });

  it("sin gap_history omite las filas de historia, no las inventa", () => {
    conAnalisis({ gap_history: undefined });
    render(<DataProvenance />);
    expect(screen.queryByText(/días de los/)).toBeNull();
    expect(screen.queryByText(/días completos/)).toBeNull();
    // El resto del panel sigue en pie.
    expect(screen.getByText("normal")).toBeTruthy();
  });

  it("NO introduce sello demo: todo lo que pinta es dato servido", () => {
    conAnalisis();
    render(<DataProvenance />);
    expect(screen.queryByText("demo · sin fuente")).toBeNull();
  });

  it("en inglés", () => {
    conAnalisis();
    render(<DataProvenance />, { idioma: "en" });
    expect(screen.getByText("Data quality and provenance")).toBeTruthy();
    expect(screen.getByText("12 days of the 90 requested")).toBeTruthy();
  });
});
