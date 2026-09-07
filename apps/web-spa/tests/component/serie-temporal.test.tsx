/**
 * `SerieTemporal`: EL gráfico de líneas del sistema.
 *
 * Lo que se defiende es **el contrato**: que las diferencias entre gráficos
 * sean flags y no implementaciones. Antes había dos SVG escritos a mano que
 * fueron divergiendo, y cada capacidad nueva costaba dos veces.
 *
 * Y la capacidad que el refactor añade: **la serie se recorre con teclado**.
 * Hasta ahora el tooltip solo existía con ratón o dedo.
 */

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SerieTemporal } from "../../src/components/SerieTemporal";
import { renderConProveedores as render } from "../render";

afterEach(cleanup);

const DIA = 86_400_000;
const BASE = Date.parse("2026-09-01T04:00:00Z");
const PUNTOS = ["10", "12", "14", "16", "18"].map((valor, i) => ({
  t: BASE + i * DIA,
  valor,
}));

function pintar(over: Record<string, unknown> = {}) {
  render(
    <SerieTemporal
      puntos={PUNTOS}
      color="var(--series-buy)"
      alto={280}
      formato={(v) => v}
      dias={30}
      idioma="es"
      etiqueta="serie de prueba"
      {...over}
    />,
  );
  const lienzo = document.querySelector(".vmw-serie__lienzo")!;
  lienzo.getBoundingClientRect = () =>
    ({ left: 0, width: 1000, top: 0, height: 280 }) as DOMRect;
  return lienzo;
}

const capas = () => [...document.querySelector(".vmw-serie__svg")!.children];

describe("SerieTemporal · contrato", () => {
  it("con todo apagado dibuja solo gridlines y trazo", () => {
    pintar();
    const tags = capas().map((n) => n.tagName.toLowerCase());
    expect(tags).toEqual(["line", "line", "line", "line", "polyline"]);
    const trazo = capas().at(-1)!;
    expect(trazo.getAttribute("stroke-width")).toBe("2.2");
    expect(trazo.getAttribute("stroke-linejoin")).toBe("round");
    expect(trazo.getAttribute("stroke-linecap")).toBe("round");
  });

  it("cada flag añade SU capa, en el orden del sistema", () => {
    pintar({ banda: true, mediana: true, umbral: "25", hoy: true });
    const tags = capas().map((n) => n.tagName.toLowerCase());
    expect(tags).toEqual([
      "rect", // banda
      "line", "line", "line", "line", // gridlines
      "polyline", // mediana
      "polyline", // umbral
      "polyline", // hoy
      "polyline", // la serie, encima
    ]);
    expect(capas().at(-1)?.getAttribute("stroke")).toBe("var(--series-buy)");
  });

  it("el área es lo que distingue contexto de protagonista", () => {
    pintar({ area: true, alto: 140 });
    const poligono = capas().find((n) => n.tagName.toLowerCase() === "polygon");
    expect(poligono?.getAttribute("fill")).toBe("var(--teal-tint)");
    // Y sin área no hay polígono: la tasa oficial lo enciende, la serie no.
    cleanup();
    pintar();
    expect(capas().some((n) => n.tagName.toLowerCase() === "polygon")).toBe(false);
  });

  it("el eje de valores es opcional y ocupa su columna", () => {
    pintar();
    expect(document.querySelector(".vmw-serie__valores")).toBeNull();
    cleanup();
    pintar({ ejeY: true });
    expect(document.querySelector(".vmw-serie__valores")).toBeTruthy();
    expect(
      document.querySelector(".vmw-serie__marco--eje"),
    ).toBeTruthy();
  });

  it("el alto llega del contrato, no está cableado", () => {
    pintar({ alto: 140 });
    expect(
      document.querySelector(".vmw-serie__svg")?.getAttribute("viewBox"),
    ).toBe("0 0 1060 140");
  });

  it("sin tooltip el lienzo no es enfocable ni reacciona", () => {
    const lienzo = pintar();
    expect(lienzo.getAttribute("tabindex")).toBeNull();
    fireEvent.pointerMove(lienzo, { clientX: 500, pointerType: "mouse" });
    expect(document.querySelector(".vmw-tip")).toBeNull();
  });
});

describe("SerieTemporal · teclado", () => {
  it("el lienzo es enfocable y se anuncia cómo recorrerlo", () => {
    const lienzo = pintar({ tooltip: true });
    expect(lienzo.getAttribute("tabindex")).toBe("0");
    expect(screen.getByLabelText(/flechas para recorrer/i)).toBeTruthy();
  });

  it("las flechas recorren la serie y Home/End van a los extremos", () => {
    const lienzo = pintar({ tooltip: true });
    fireEvent.keyDown(lienzo, { key: "ArrowLeft" });
    // Arranca en el último y retrocede uno: el 4.º punto, valor 16.
    expect(document.querySelector(".vmw-tip__valor")?.textContent).toContain("16");
    fireEvent.keyDown(lienzo, { key: "Home" });
    expect(document.querySelector(".vmw-tip__valor")?.textContent).toContain("10");
    fireEvent.keyDown(lienzo, { key: "End" });
    expect(document.querySelector(".vmw-tip__valor")?.textContent).toContain("18");
  });

  it("no se sale de la serie por los extremos", () => {
    const lienzo = pintar({ tooltip: true });
    fireEvent.keyDown(lienzo, { key: "Home" });
    fireEvent.keyDown(lienzo, { key: "ArrowLeft" });
    expect(document.querySelector(".vmw-tip__valor")?.textContent).toContain("10");
  });

  it("Escape suelta el punto", () => {
    const lienzo = pintar({ tooltip: true });
    fireEvent.keyDown(lienzo, { key: "End" });
    expect(document.querySelector(".vmw-tip")).toBeTruthy();
    fireEvent.keyDown(lienzo, { key: "Escape" });
    expect(document.querySelector(".vmw-tip")).toBeNull();
  });

  it("el punto activo por teclado lleva foco visible", () => {
    const lienzo = pintar({ tooltip: true });
    fireEvent.keyDown(lienzo, { key: "ArrowLeft" });
    expect(document.querySelector(".vmw-serie__punto--foco")).toBeTruthy();
    // Con raton no: ahi el cursor ya dice donde se esta.
    cleanup();
    const otro = pintar({ tooltip: true });
    fireEvent.pointerMove(otro, { clientX: 500, pointerType: "mouse" });
    expect(document.querySelector(".vmw-serie__punto--foco")).toBeNull();
  });
});

describe("SerieTemporal · estilo del sistema", () => {
  const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
  const bloque = (sel: string) => {
    const i = CSS.indexOf(sel);
    const abre = CSS.indexOf("{", i);
    return CSS.slice(abre, CSS.indexOf("}", abre));
  };

  it("el foco es visible y obligatorio", () => {
    for (const sel of [".vmw-serie__lienzo:focus-visible", ".vmw-serie__punto--foco"]) {
      const b = bloque(sel);
      expect(b).toContain("outline: 2px solid var(--teal)");
      expect(b).toContain("outline-offset: 3px");
    }
  });

  it("el revelado usa los tokens del sistema, no valores cableados", () => {
    const b = bloque(".vmw-serie__trazo");
    expect(b).toContain("var(--dur-reveal)");
    expect(b).toContain("var(--ease-out-expo)");
  });

  it("se detiene con prefers-reduced-motion", () => {
    // La ULTIMA aparicion de la regla es la de dentro del media query; la
    // primera es la definicion del revelado. Buscar desde el primer
    // `prefers-reduced-motion` del fichero encontraba la definicion, porque hay
    // otros bloques de movimiento reducido mas arriba.
    const i = CSS.lastIndexOf(".vmw-serie__trazo {");
    expect(CSS.slice(i, i + 120)).toContain("animation: none");
    // Y esa regla vive DENTRO de un media query de movimiento reducido.
    expect(CSS.lastIndexOf("prefers-reduced-motion: reduce")).toBeLessThan(i);
  });

  it("sin sombra ni degradado de trazo", () => {
    const seccion = CSS.slice(CSS.indexOf("/* -- Serie temporal"));
    expect(seccion).not.toContain("box-shadow");
    expect(seccion).not.toContain("linearGradient");
  });
});
