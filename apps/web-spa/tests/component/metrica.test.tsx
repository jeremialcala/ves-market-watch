/**
 * El contrato de la tarjeta de métrica, la única del Intradía.
 *
 * Lo que se fija aquí es que el estilo NO se pueda personalizar por bloque —era
 * la deriva la que dejó dos tarjetas casi iguales y, en la misma vista, dos
 * títulos que divergieron hasta quedar en blanco sobre blanco— y que lo opcional
 * sea de verdad opcional.
 */

import { cleanup, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { MetricCard } from "../../src/components/MetricCard";
import { formatearDelta } from "../../src/lib/delta";
import type { PuntoIntradia } from "../../src/lib/intradia";
import { renderConProveedores as render } from "../render";

afterEach(cleanup);

const T0 = Date.parse("2026-08-06T04:00:00Z");
const PUNTOS: PuntoIntradia[] = ["100", "120", "110"].map((valor, i) => ({
  t: T0 + i * 3_600_000,
  valor,
}));

function pintar(extra: Record<string, unknown> = {}) {
  return render(
    <MetricCard
      indicador="p2p_mediana_sell"
      valor="110 VES"
      delta={formatearDelta(
        { deltaAbs: "10", apertura: "100" },
        { unidad: "VES", decimales: 2, sinCambio: "— sin cambio" },
      )}
      colorSerie="var(--teal)"
      apertura="100 VES"
      puntos={PUNTOS}
      descripcionSerie="de 100 a 110"
      {...extra}
    />,
  );
}

const tarjeta = () => document.querySelector(".vmw-metrica") as HTMLElement;

describe("MetricCard", () => {
  it("nombra la serie con el par del catálogo, no con lo que le pasen", () => {
    /*
     * La identidad entra como `indicador`: aceptar label y clave por props
     * reabriría la puerta a que dos bloques nombren la misma serie distinto,
     * que es justo lo que se cerró al separarlos.
     */
    pintar();

    expect(screen.getByText("Mediana VES")).toBeTruthy();
    expect(screen.getByText("p2p_mediana_sell")).toBeTruthy();
  });

  it("lo opcional es opcional: sin pastilla, nota ni pie derecho", () => {
    pintar();

    expect(document.querySelector(".vmw-metrica__pastilla")).toBeNull();
    expect(document.querySelector(".vmw-metrica__nota")).toBeNull();
    expect(document.querySelector("polyline[stroke-dasharray]")).toBeNull();
    // El pie conserva la apertura, que no es opcional.
    expect(document.querySelector(".vmw-metrica__pie")?.textContent).toBe(
      "apertura 100 VES",
    );
  });

  it("con umbral, la línea de disparo entra en el dominio de la chispa", () => {
    pintar({ umbral: "200" });

    const umbral = document.querySelector("polyline[stroke-dasharray]")!;
    expect(umbral.getAttribute("stroke-dasharray")).toBe("4 4");
    // Y la serie queda por debajo: el umbral de 200 está por encima de todo.
    const y = Number(umbral.getAttribute("points")!.split(",")[1].split(" ")[0]);
    const polilineas = [...document.querySelectorAll(".vmw-metrica polyline")];
    const traza = polilineas[polilineas.length - 1];
    const yes = traza
      .getAttribute("points")!
      .split(" ")
      .map((p) => Number(p.split(",")[1]));
    expect(Math.min(...yes)).toBeGreaterThan(y);
  });

  it("el tono alerta es lo ÚNICO que cambia el borde", () => {
    pintar({ tono: "alerta" });
    expect(tarjeta().getAttribute("data-tono")).toBe("alerta");

    cleanup();
    pintar();
    expect(tarjeta().getAttribute("data-tono")).toBe("neutro");
  });

  it("la pastilla dice su texto y lleva su tono", () => {
    pintar({ pastilla: { texto: "Cumple", tono: "alerta" } });

    const pastilla = document.querySelector(".vmw-metrica__pastilla")!;
    expect(pastilla.textContent).toBe("Cumple");
    expect(pastilla.getAttribute("data-tono")).toBe("alerta");
  });
});

describe("el estilo de la tarjeta es FIJO", () => {
  const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
  const bloque = (selector: string) => {
    const i = CSS.indexOf(`${selector} {`);
    expect(i, selector).toBeGreaterThan(-1);
    return CSS.slice(i, CSS.indexOf("}", i));
  };

  it("los valores salen de tokens, no de literales", () => {
    /*
     * `--border` YA valía 8 % y `--border-2` 14 %, `--lift` −4 px y `--dur-card`
     * 0,25 s. Escribirlos a mano habría creado una segunda fuente para los
     * mismos números.
     */
    const base = bloque(".vmw-metrica");
    expect(base).toContain("background: var(--dark-3)");
    expect(base).toContain("border-radius: 22px");
    expect(base).toContain("padding: 22px 24px");
    expect(base).toContain("gap: 12px");
    expect(base).toContain("solid var(--border)");

    const hover = bloque(".vmw-metrica:hover");
    expect(hover).toContain("border-color: var(--border-2)");
    expect(hover).toContain("transform: var(--lift)");
  });

  it("sin sombra en reposo, sin scale y sin estado de pulsado", () => {
    /*
     * El sistema no define ninguno de los tres. Inventarlos aquí sería crear
     * vocabulario nuevo por la puerta de atrás.
     */
    const base = bloque(".vmw-metrica");
    expect(base).not.toContain("box-shadow");
    expect(base).not.toContain("scale");
    expect(CSS).not.toContain(".vmw-metrica:active");
  });

  it("sin degradado y sin borde lateral de color", () => {
    const base = bloque(".vmw-metrica");
    expect(base).not.toContain("gradient");
    expect(base).not.toMatch(/border-left(?!-)/);
    expect(bloque('.vmw-metrica[data-tono="alerta"]')).not.toMatch(
      /border-left(?!-)/,
    );
  });

  it("el foco es visible y separado del borde", () => {
    const foco = bloque(".vmw-metrica:focus-visible,\n.vmw-metrica:focus-within");
    expect(foco).toContain("outline: 2px solid var(--focus-ring)");
    expect(foco).toContain("outline-offset: 3px");
  });
});
