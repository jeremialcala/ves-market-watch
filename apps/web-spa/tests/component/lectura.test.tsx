/**
 * Lectura del mercado (RF-7): la tarjeta dejó de ser maqueta.
 *
 * Lo que se vigila aquí, además de que pinte, es la FRONTERA: describe el
 * presente, no aconseja y no predice. Un test que solo comprobara que hay texto
 * dejaría pasar justo el fallo que importa.
 */

import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MarketRegimeCard } from "../../src/components/MarketRegimeCard";
import { ES } from "../../src/i18n/dict";
import { marketStore } from "../../src/state/marketStore";
import { FIXTURE_ANALISIS } from "../contract/fixtures.test";
import { renderConProveedores as render } from "../render";

afterEach(() => {
  cleanup();
  marketStore.reset();
  window.localStorage.clear();
});

/** El análisis del fixture con la lectura modificada a placer. */
function conLectura(cambios: Record<string, unknown>) {
  return {
    ...FIXTURE_ANALISIS,
    ...cambios,
    reading: { ...FIXTURE_ANALISIS.reading, ...(cambios.reading ?? {}) },
  };
}

describe("Lectura del mercado", () => {
  it("nombra el régimen y compone la prosa en el orden del motor", () => {
    marketStore.resync({ analisis: FIXTURE_ANALISIS });
    render(<MarketRegimeCard />);

    // El titular sale del código de régimen, no de una cadena de ejemplo.
    expect(screen.getByText(ES["regimen.lateral_comprimiendo"])).toBeTruthy();
    // Y la prosa es una frase por claim, en su orden.
    const prosa = screen.getByText(/La distancia entre el precio de la calle/);
    expect(prosa.textContent).toContain("se ha cerrado 0,90 puntos");
    expect(prosa.textContent).toContain("El movimiento vino del precio de la calle");
    expect(prosa.textContent).toContain("Si tienes que comprar");
    // El orden importa: la atribución va DESPUÉS del hecho que explica.
    expect(prosa.textContent!.indexOf("se ha cerrado")).toBeLessThan(
      prosa.textContent!.indexOf("El movimiento vino"),
    );
  });

  it("NO lleva sello demo: el dato es real", () => {
    marketStore.resync({ analisis: FIXTURE_ANALISIS });
    render(<MarketRegimeCard />);
    expect(screen.queryByText("demo · sin fuente")).toBeNull();
  });

  it("no aconseja ni predice, y lo dice explícitamente", () => {
    marketStore.resync({ analisis: FIXTURE_ANALISIS });
    render(<MarketRegimeCard />);
    const texto = document.body.textContent ?? "";

    // La aclaración es obligatoria y no se retira «por limpieza visual».
    expect(screen.getByText(ES["regimen.aclaracion"])).toBeTruthy();
    // Nada imperativo ni predictivo: son los dos límites que el repo declara
    // (no-objetivo del PRD y ADR-0019).
    for (const prohibido of [
      /nada que ejecutar/i,
      /deber[íi]as/i,
      /te conviene/i,
      /va a subir/i,
      /va a bajar/i,
      /se espera/i,
      /probabilidad/i,
    ]) {
      expect(texto).not.toMatch(prohibido);
    }
    // Lo que orienta va en CONDICIONAL, que informa sin ordenar.
    expect(texto).toMatch(/Si tienes que comprar/);
  });

  it("los chips salen del análisis, no de constantes", () => {
    marketStore.resync({ analisis: FIXTURE_ANALISIS });
    render(<MarketRegimeCard />);

    expect(screen.getByText(/0 reglas disparadas/)).toBeTruthy();
    expect(screen.getByText(/1 medidor cerca de su umbral/)).toBeTruthy();
    // La confianza sale del contrato (`normal|low`). La maqueta decía «media»,
    // que no existe: con 0,50 % de outliers la confianza REAL es normal.
    expect(screen.getByText(/Confianza normal/)).toBeTruthy();
    expect(screen.queryByText(/Confianza media/)).toBeNull();
  });

  it("sin régimen resoluble lo dice en vez de inventar medio titular", () => {
    marketStore.resync({
      analisis: conLectura({ reading: { regime: null, axis_gap: null } }),
    });
    render(<MarketRegimeCard />);
    expect(screen.getByText(ES["regimen.sinRegimen"])).toBeTruthy();
    expect(screen.queryByText(ES["regimen.lateral_comprimiendo"])).toBeNull();
  });

  it("con confianza baja lo encabeza y marca el chip", () => {
    marketStore.resync({
      analisis: conLectura({
        confidence: "low",
        reading: {
          claims: [
            { code: "confianza_baja", data: {} },
            { code: "brecha", data: { direccion: "estable", horas: "6" } },
          ],
        },
      }),
    });
    render(<MarketRegimeCard />);

    const prosa = screen.getByText(/Demasiados anuncios con precio raro/);
    // Encabeza: lo que invalida al resto va primero.
    expect(prosa.textContent!.indexOf("Demasiados anuncios")).toBe(0);
    expect(screen.getByText(/Confianza baja/)).toBeTruthy();
  });

  it("con la oficial rancia no afirma quién movió la brecha", () => {
    marketStore.resync({
      analisis: conLectura({
        official_stale: true,
        reading: {
          claims: [
            { code: "oficial_rancia", data: {} },
            {
              code: "brecha",
              data: { direccion: "comprimiendo", delta_pp: "1.02", horas: "6" },
            },
          ],
        },
      }),
    });
    render(<MarketRegimeCard />);

    expect(screen.getByText(/no se puede decir qué lado movió/)).toBeTruthy();
    expect(screen.queryByText(/El movimiento vino/)).toBeNull();
  });

  it("sin lectura muestra los indicadores sin interpretarlos", () => {
    marketStore.resync({ analisis: { ...FIXTURE_ANALISIS, reading: undefined } });
    render(<MarketRegimeCard />);
    expect(screen.getByText(ES["regimen.sinLectura"])).toBeTruthy();
    expect(screen.queryByText(ES["regimen.lateral_comprimiendo"])).toBeNull();
  });

  it("redacta la misma lectura en inglés", () => {
    marketStore.resync({ analisis: FIXTURE_ANALISIS });
    render(<MarketRegimeCard />, { idioma: "en" });

    expect(screen.getByText("Compressing sideways")).toBeTruthy();
    expect(screen.getByText(/If you have to buy/)).toBeTruthy();
    expect(
      screen.getByText(/It is not a prediction nor a recommendation/),
    ).toBeTruthy();
  });
});
