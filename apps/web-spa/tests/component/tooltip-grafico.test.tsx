/**
 * Tooltip de los gráficos.
 *
 * Lo que se defiende es **el contenido**, que es donde estaba el problema: el
 * volcado crudo decía `USD/VES : 736,9339`, con la etiqueta técnica delante,
 * ocho decimales y un espacio antes de los dos puntos. Ahora son tres líneas —
 * cuándo, cuánto, y si eso es mucho.
 */

import { cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SerieEvaluada } from "../../src/components/SerieEvaluada";
import { renderConProveedores as render } from "../render";

afterEach(cleanup);

const DIA = 86_400_000;
const BASE = Date.parse("2026-09-01T04:00:00Z");
const PUNTOS = ["730.1234", "733.5", "736.9339", "740.2", "742.8"].map(
  (valor, i) => ({ t: BASE + i * DIA, valor }),
);

function pintar(idioma: "es" | "en" = "es") {
  render(
    <SerieEvaluada
      puntos={PUNTOS}
      condicion={null}
      indicador="p2p_brecha_pct_buy"
      dias={30}
      idioma={idioma}
      etiqueta="serie"
    />,
    { idioma },
  );
  const marco = document.querySelector(".vmw-serie__lienzo")!;
  // jsdom no mide: el rect sale en ceros y la fracción quedaría en 0. Se fija
  // un ancho para poder señalar un punto concreto.
  marco.getBoundingClientRect = () =>
    ({ left: 0, width: 1000, top: 0, height: 280 }) as DOMRect;
  return marco;
}

describe("tooltip del gráfico", () => {
  it("no existe hasta que se señala", () => {
    pintar();
    expect(document.querySelector(".vmw-tip")).toBeNull();
  });

  it("con el ratón encima aparece crosshair, punto y tooltip", () => {
    const marco = pintar();
    fireEvent.pointerMove(marco, { clientX: 1000, pointerType: "mouse" });
    // El crosshair ya no es una capa aparte: es una linea DENTRO del SVG de la
    // serie, que es lo que permite que se dibuje a su misma escala.
    expect(document.querySelectorAll(".vmw-serie__svg line").length).toBeGreaterThan(4);
    expect(document.querySelector(".vmw-serie__punto")).toBeTruthy();
    expect(document.querySelector(".vmw-tip")).toBeTruthy();
  });

  it("el valor lleva 2 decimales y la unidad DETRÁS, sin etiqueta técnica", () => {
    const marco = pintar();
    fireEvent.pointerMove(marco, { clientX: 500, pointerType: "mouse" });
    const valor = document.querySelector(".vmw-tip__valor")!.textContent ?? "";
    expect(valor).toContain("736,93"); // dos decimales, no 736,9339
    expect(valor).toContain("%"); // la unidad de esta serie
    expect(valor).not.toContain("736,9339");
    // Ni etiqueta técnica delante ni espacio antes de los dos puntos.
    expect(valor).not.toContain(":");
    expect(valor).not.toContain("USD/VES");
    expect(valor).not.toContain("p2p_");
  });

  it("la tercera línea dice si eso es mucho", () => {
    const marco = pintar();
    fireEvent.pointerMove(marco, { clientX: 1000, pointerType: "mouse" });
    const ctx = document.querySelector(".vmw-tip__contexto")!.textContent ?? "";
    expect(ctx).toMatch(/percentil \d+/);
    expect(ctx).toContain("mediana");
    expect(ctx).toMatch(/[+\u2212-]/); // la distancia va con signo
  });

  it("se voltea cerca del borde en vez de recortarse", () => {
    const marco = pintar();
    fireEvent.pointerMove(marco, { clientX: 995, pointerType: "mouse" });
    const tip = document.querySelector<HTMLElement>(".vmw-tip")!;
    expect(tip.style.transform).toContain("-100%");
    fireEvent.pointerMove(marco, { clientX: 5, pointerType: "mouse" });
    expect(
      document.querySelector<HTMLElement>(".vmw-tip")!.style.transform,
    ).toContain("translate(0");
  });

  it("el ratón lo cierra al salir; el táctil NO usa ese gesto", () => {
    const marco = pintar();
    fireEvent.pointerMove(marco, { clientX: 500, pointerType: "mouse" });
    fireEvent.pointerLeave(marco, { pointerType: "mouse" });
    expect(document.querySelector(".vmw-tip")).toBeNull();

    // En táctil se abre con un toque…
    fireEvent.pointerDown(marco, { clientX: 500, pointerType: "touch" });
    expect(document.querySelector(".vmw-tip")).toBeTruthy();
    // …y un `pointerleave` de dedo no lo cierra: no existe «salir» al tocar.
    fireEvent.pointerLeave(marco, { pointerType: "touch" });
    expect(document.querySelector(".vmw-tip")).toBeTruthy();
  });

  it("en táctil se cierra al tocar fuera", () => {
    const marco = pintar();
    fireEvent.pointerDown(marco, { clientX: 500, pointerType: "touch" });
    expect(document.querySelector(".vmw-tip")).toBeTruthy();
    fireEvent.pointerDown(document.body, { pointerType: "touch" });
    expect(document.querySelector(".vmw-tip")).toBeNull();
  });

  it("el tooltip no captura el puntero", () => {
    // Si lo capturara, moverse sobre el cerraria el crosshair que lo abrio.
    //
    // Se comprueba sobre la HOJA y no con `getComputedStyle`: jsdom no carga
    // `index.css`, asi que ahi el valor calculado seria el de por defecto y el
    // test pasaria aunque la regla no existiera. Mismo enfoque que el canario
    // de `tests/unit/tema-tokens.test.ts`.
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    const bloque = css.slice(css.indexOf(".vmw-tip {"));
    expect(bloque.slice(0, bloque.indexOf("}"))).toContain(
      "pointer-events: none",
    );
  });
});
