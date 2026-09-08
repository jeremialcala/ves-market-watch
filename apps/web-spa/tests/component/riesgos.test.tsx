/**
 * «Riesgos que vigilar» con niveles servidos por el motor.
 *
 * Lo que se defiende aquí, por orden:
 *
 * 1. **`sin medir` NO se pinta como `bajo`.** Un riesgo cuyo indicador no está
 *    vigente llega con `level: null`. Es el único fallo de este panel que hace
 *    daño de verdad: tranquilizar sobre algo que nadie ha podido mirar.
 * 2. **Se pintan TODOS los riesgos servidos**, también los no evaluables. Uno
 *    que desaparece de la lista se lee como un riesgo que no existe.
 * 3. **El orden es el del motor**, que ya llega por gravedad. Reordenar aquí
 *    duplicaría la regla y las dos copias se irían separando.
 * 4. **La cifra y el corte son los servidos**, no una copia en el cliente: era
 *    exactamente lo que fallaba, un `alto` cableado con el valor real muy por
 *    debajo de su propio umbral.
 */

import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PanelRiesgos } from "../../src/components/PanelRiesgos";
import { marketStore } from "../../src/state/marketStore";
import { FIXTURE_ANALISIS } from "../contract/fixtures.test";
import { renderConProveedores as render } from "../render";

afterEach(cleanup);

const RIESGOS = {
  version: 1,
  items: [
    {
      code: "oficial_rancia" as const,
      level: "alto" as const,
      value: null,
      threshold: null,
      source: "official_stale",
    },
    {
      code: "umbrales_sin_recalibrar" as const,
      level: "medio" as const,
      value: "1",
      threshold: "0",
      source: null,
    },
    {
      code: "calidad_snapshot" as const,
      level: "bajo" as const,
      value: "0.00",
      threshold: "30",
      source: "p2p_outliers_pct_buy",
    },
    {
      code: "libro_concentrado" as const,
      level: null,
      value: null,
      threshold: "80",
      source: null,
    },
  ],
};

function pintar(riesgos: unknown = RIESGOS, idioma: "es" | "en" = "es") {
  marketStore.resync({
    analisis: { ...FIXTURE_ANALISIS, ...(riesgos ? { risks: riesgos } : {}) } as never,
  });
  render(<PanelRiesgos />, { idioma });
}

describe("sin datos", () => {
  it("un análisis SIN el bloque lo dice, en vez de dibujar tarjetas vacías", () => {
    // Un motor sin config de riesgos publica el mismo análisis sin el campo:
    // `risks` es aditivo, así que el cliente tiene que aguantar su ausencia.
    const { risks: _sin, ...sinRiesgos } = FIXTURE_ANALISIS;
    marketStore.resync({ analisis: sinRiesgos as never });
    render(<PanelRiesgos />);
    expect(screen.getByText(/todavía no ha servido un análisis/i)).toBeTruthy();
    expect(document.querySelectorAll(".vmw-tarjeta--panel")).toHaveLength(0);
  });
});

describe("niveles servidos", () => {
  it("pinta una tarjeta por riesgo, también el no evaluable", () => {
    pintar();
    expect(document.querySelectorAll(".vmw-tarjeta--panel")).toHaveLength(4);
  });

  it("conserva el orden del motor: no reordena por su cuenta", () => {
    pintar();
    const titulos = [...document.querySelectorAll(".vmw-tarjeta--panel .vmw-cifra")].map(
      (n) => n.textContent,
    );
    expect(titulos).toEqual([
      "Rancidez de la oficial",
      "Umbrales sin recalibrar",
      "Calidad del snapshot",
      "Libro concentrado",
    ]);
  });

  it("cada nivel lleva su etiqueta", () => {
    pintar();
    expect(screen.getByText("alto")).toBeTruthy();
    expect(screen.getByText("medio")).toBeTruthy();
    expect(screen.getByText("bajo")).toBeTruthy();
  });
});

describe("«sin medir» no es «bajo»", () => {
  it("el riesgo no evaluable se rotula aparte y NUNCA como bajo", () => {
    pintar();
    const libro = [...document.querySelectorAll<HTMLElement>(".vmw-tarjeta--panel")].find(
      (n) => n.textContent?.includes("Libro concentrado"),
    )!;
    const etiqueta = libro.querySelector(".vmw-eyebrow")!.textContent;
    expect(etiqueta).toBe("sin medir");
    expect(etiqueta).not.toBe("bajo");
  });

  it("y explica por qué, diciendo expresamente que no es un «bajo»", () => {
    pintar();
    expect(screen.getByText(/no se ha podido medir. No es un «bajo»/i)).toBeTruthy();
  });

  it("un solo riesgo sin nivel no arrastra a los demás", () => {
    pintar();
    // Los otros tres siguen con su nivel: `null` es por riesgo, no global.
    expect(screen.getByText("alto")).toBeTruthy();
    expect(screen.getByText("bajo")).toBeTruthy();
  });
});

describe("la cifra y el corte son los SERVIDOS", () => {
  it("el snapshot muestra su valor y su umbral, no un 80 cableado", () => {
    pintar();
    expect(screen.getByText(/^0 % de outliers · alto desde 30 %$/)).toBeTruthy();
  });

  it("el ruleset muestra su versión contra la calibrada", () => {
    pintar();
    expect(screen.getByText(/Ruleset v1 · recalibrado hasta v0/)).toBeTruthy();
  });

  it("el libro nombra el LADO peor cuando hay valor", () => {
    pintar({
      version: 1,
      items: [
        {
          code: "libro_concentrado",
          level: "medio",
          value: "74.50",
          threshold: "80",
          source: "p2p_merchants_pct_sell",
        },
      ],
    });
    expect(screen.getByText(/74,50 % en venta · alto desde 80 %/)).toBeTruthy();
  });

  it("el riesgo binario redacta según su nivel, sin cifras que no tiene", () => {
    pintar();
    expect(screen.getByText(/La fecha-valor del BCV ya pasó/)).toBeTruthy();

    cleanup();
    pintar({
      version: 1,
      items: [
        {
          code: "oficial_rancia",
          level: "bajo",
          value: null,
          threshold: null,
          source: "official_stale",
        },
      ],
    });
    expect(screen.getByText(/El BCV publicó la tasa vigente para hoy/)).toBeTruthy();
  });

  it("declara de dónde salen los cortes, con su versión", () => {
    pintar();
    expect(screen.getByText(/riesgos\.v1\.yaml/)).toBeTruthy();
  });
});

describe("robustez del contrato", () => {
  it("un código que el diccionario no cubre NO desaparece", () => {
    // El motor puede desplegarse por delante del cliente. Esconder el riesgo
    // sería el peor fallo posible; se pinta con su código crudo.
    pintar({
      version: 2,
      items: [
        {
          code: "riesgo_del_futuro",
          level: "alto",
          value: null,
          threshold: null,
          source: null,
        },
      ],
    });
    expect(document.querySelectorAll(".vmw-tarjeta--panel")).toHaveLength(1);
    expect(screen.getByText("riesgo_del_futuro")).toBeTruthy();
    expect(screen.getByText("alto")).toBeTruthy();
  });
});

describe("i18n", () => {
  it("la traducción inglesa existe de verdad", () => {
    pintar(RIESGOS, "en");
    expect(screen.getByText("not measured")).toBeTruthy();
    expect(screen.getByText(/^0 % outliers · high from 30 %$/)).toBeTruthy();
  });
});
