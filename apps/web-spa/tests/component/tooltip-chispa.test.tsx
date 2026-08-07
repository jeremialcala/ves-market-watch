/**
 * El tooltip de los sparklines.
 *
 * Lo que se fija es lo que hacía mal el de Recharts —vivir dentro del flujo de
 * la tarjeta— y lo que la superficie flotante tiene que garantizar: que no
 * capture el puntero, que se ancle sobre el punto que la línea dibuja, que
 * vuelva a esconderse y que en táctil no aparezca.
 */

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ChispaConTooltip, MARGEN_VOLTEO_PX } from "../../src/components/ChispaConTooltip";
import type { PuntoIntradia } from "../../src/lib/intradia";
import { coordenadasSparkline } from "../../src/lib/movimiento";
import { renderConProveedores as render } from "../render";

afterEach(cleanup);

const T0 = Date.parse("2026-08-06T04:00:00Z"); // 00:00 VET
const ANCHO = 160;
const ALTO = 44;

const PUNTOS: PuntoIntradia[] = ["100", "120", "90", "110", "105"].map(
  (valor, i) => ({ t: T0 + i * 3_600_000, valor }),
);

/** jsdom no hace layout: la caja se declara para poder mover el puntero. */
function conCaja(caja: { left: number; width: number }) {
  const elemento = document.querySelector(".vmw-chispa") as HTMLElement;
  elemento.getBoundingClientRect = () =>
    ({ left: caja.left, width: caja.width, top: 0, height: ALTO }) as DOMRect;
  return elemento;
}

function pintar(props: Partial<Parameters<typeof ChispaConTooltip>[0]> = {}) {
  return render(
    <ChispaConTooltip
      puntos={PUNTOS}
      ancho={ANCHO}
      alto={ALTO}
      color="var(--teal)"
      unidad="VES"
      decimales={2}
      {...props}
    >
      <svg />
    </ChispaConTooltip>,
  );
}

function tooltip() {
  return document.querySelector(".vmw-chispa__tooltip") as HTMLElement | null;
}

describe("ChispaConTooltip", () => {
  it("no se pinta hasta que el puntero entra", () => {
    pintar();
    expect(tooltip()).toBeNull();
  });

  it("muestra la hora en VET y el valor con su unidad", () => {
    pintar();
    const caja = conCaja({ left: 500, width: 160 });

    // Justo sobre el tercer punto (índice 2 de 5).
    fireEvent.pointerMove(caja, { clientX: 500 + 80, pointerType: "mouse" });

    expect(screen.getByText("02:00 VET")).toBeTruthy();
    expect(screen.getByText("90 VES")).toBeTruthy();
  });

  it("se ancla sobre el punto que la línea dibuja, no en el puntero", () => {
    /*
     * Las coordenadas salen de `coordenadasSparkline`, la MISMA función que
     * genera el trazo: un tooltip que señala un punto distinto del que se ve es
     * peor que no tenerlo.
     */
    pintar();
    const caja = conCaja({ left: 0, width: 160 });
    // Entre el punto 1 y el 2, más cerca del 1: se engancha al 1.
    fireEvent.pointerMove(caja, { clientX: 44, pointerType: "mouse" });

    const coords = coordenadasSparkline(PUNTOS, ANCHO, ALTO);
    expect(tooltip()!.style.left).toBe(`${(coords[1].x / ANCHO) * 100}%`);
    expect(tooltip()!.style.top).toBe(`${(coords[1].y / ALTO) * 100}%`);
  });

  it("se esconde al salir el puntero", () => {
    pintar();
    const caja = conCaja({ left: 0, width: 160 });
    fireEvent.pointerMove(caja, { clientX: 80, pointerType: "mouse" });
    expect(tooltip()).not.toBeNull();

    fireEvent.pointerLeave(caja);
    expect(tooltip()).toBeNull();
  });

  it("en TÁCTIL no aparece", () => {
    /*
     * Sin hover no hay forma de cerrarlo salvo tocando otra cosa, y taparía la
     * tarjeta que se acaba de tocar. El dato exacto de cada bucket sale por
     * «Exportar sesión», que sí funciona sin puntero.
     */
    pintar();
    const caja = conCaja({ left: 0, width: 160 });

    fireEvent.pointerMove(caja, { clientX: 80, pointerType: "touch" });

    expect(tooltip()).toBeNull();
  });

  it("voltea cerca del borde derecho del viewport", () => {
    pintar();
    // La chispa arranca a menos de 120 px del borde: el último punto queda
    // pegado a él.
    const caja = conCaja({ left: window.innerWidth - 100, width: 160 });
    fireEvent.pointerMove(caja, {
      clientX: window.innerWidth - 100 + 160,
      pointerType: "mouse",
    });

    expect(tooltip()!.dataset.voltear).toBe("der");
  });

  it("voltea cerca del borde izquierdo", () => {
    pintar();
    const caja = conCaja({ left: 0, width: 160 });
    fireEvent.pointerMove(caja, { clientX: 0, pointerType: "mouse" });

    expect(tooltip()!.dataset.voltear).toBe("izq");
  });

  it("en el centro no voltea", () => {
    pintar();
    const centro = Math.round(window.innerWidth / 2);
    expect(centro).toBeGreaterThan(MARGEN_VOLTEO_PX);
    const caja = conCaja({ left: centro, width: 160 });
    fireEvent.pointerMove(caja, { clientX: centro + 80, pointerType: "mouse" });

    expect(tooltip()!.dataset.voltear).toBe("no");
  });

  it("sin puntos no intenta pintar nada", () => {
    pintar({ puntos: [] });
    const caja = conCaja({ left: 0, width: 160 });
    fireEvent.pointerMove(caja, { clientX: 80, pointerType: "mouse" });

    expect(tooltip()).toBeNull();
  });
});

describe("la superficie del tooltip", () => {
  const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
  const bloque = CSS.slice(
    CSS.indexOf(".vmw-chispa__tooltip {"),
    CSS.indexOf(".vmw-chispa__hora"),
  );

  it("sale del flujo y no captura el puntero", () => {
    /*
     * Las dos cosas que hacía mal el tooltip de Recharts: se pintaba dentro del
     * flujo —aparecer empujaba la tarjeta— y al capturar el puntero provocaba el
     * parpadeo clásico (entra el tooltip → sale del gráfico → se cierra).
     */
    expect(CSS).toMatch(/\.vmw-chispa \{[^}]*position:\s*relative/);
    expect(bloque).toMatch(/position:\s*absolute/);
    expect(bloque).toMatch(/pointer-events:\s*none/);
    expect(bloque).toMatch(/transform:\s*translate\(-50%,\s*-100%\)/);
  });

  it("comparte el desenfoque con la barra, que es el otro único sitio", () => {
    /*
     * `--blur-nav` y no un `blur(16px)` suelto: dos superficies flotantes con un
     * solo lenguaje, y el día que cambie el desenfoque cambian las dos.
     */
    expect(bloque).toContain("backdrop-filter: var(--blur-nav)");
    expect(bloque).toContain("background: var(--tooltip-bg)");
    expect(CSS).toMatch(/\.vmw-nav[^{]*\{[^}]*backdrop-filter:\s*var\(--blur-nav\)/);
  });

  it("el tooltip tiene superficie en los DOS temas", () => {
    /*
     * `rgba(21,24,27,.94)` es la tinta oscura: cableada, en tema claro sería una
     * caja negra sobre papel. El token se voltea como ya hace `--nav-bg`.
     */
    const oscuro = readFileSync(
      resolve(process.cwd(), "src/ds/tokens/effects.css"),
      "utf8",
    );
    const claro = readFileSync(
      resolve(process.cwd(), "src/ds/tokens/theme-light.css"),
      "utf8",
    );
    expect(oscuro).toMatch(/--tooltip-bg:\s*rgb\(21 24 27 \/ 94%\)/);
    expect(claro).toMatch(/--tooltip-bg:\s*rgb\(255 255 255 \/ 94%\)/);
  });
});
