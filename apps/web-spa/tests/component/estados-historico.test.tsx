/**
 * Estados del bloque de tasa oficial: sin datos y desfase entre series.
 */

import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TasaOficialContexto } from "../../src/components/TasaOficialContexto";
import { ES } from "../../src/i18n/dict";
import { renderConProveedores as render } from "../render";

afterEach(cleanup);

const DIA = 86_400_000;
const BASE = Date.parse("2026-09-01T04:00:00Z");
const serie = (n: number, desde = 0) =>
  Array.from({ length: n }, (_, i) => ({
    t: BASE + (desde + i) * DIA,
    valor: String(800 + i),
  }));

function pintar(
  puntos = serie(5),
  evaluada = serie(5),
  idioma: "es" | "en" = "es",
) {
  render(
    <TasaOficialContexto
      puntos={puntos}
      moneda="USD"
      dias={30}
      brechaPct="17.47"
      evaluada={evaluada}
      idioma={idioma}
    />,
    { idioma },
  );
}

describe("tasa oficial · estados", () => {
  it("sin datos sustituye el gráfico por el bloque que explica", () => {
    pintar([], serie(5));
    expect(document.querySelector(".vmw-oficial__grafico")).toBeNull();
    const vacio = document.querySelector<HTMLElement>(".vmw-vacio")!;
    expect(screen.getByText(ES["historico.vacioOficial"])).toBeTruthy();
    // Alto del gráfico que sustituye, no 280: este bloque es el de contexto.
    expect(vacio.style.minHeight).toBe("140px");
    expect(vacio.querySelector(".vmw-vacio__linea")?.textContent).toContain(
      "USD/VES",
    );
  });

  it("anota el desfase cuando las dos series terminan en días distintos", () => {
    // La oficial llega al día 2 y la evaluada al 5: el caso normal del fin de
    // semana sin publicación del BCV.
    pintar(serie(3), serie(6));
    const nota = document.querySelector(".vmw-oficial__desfase")!.textContent ?? "";
    expect(nota).toContain("La tasa oficial llega hasta");
    expect(nota).toContain("3 d de diferencia");
  });

  it("también cuando la que se queda atrás es la evaluada", () => {
    pintar(serie(6), serie(3));
    expect(
      document.querySelector(".vmw-oficial__desfase")?.textContent,
    ).toContain("La serie evaluada llega hasta");
  });

  it("sin desfase no hay nota: no se avisa de lo que no pasa", () => {
    pintar(serie(5), serie(5));
    expect(document.querySelector(".vmw-oficial__desfase")).toBeNull();
  });

  it("en inglés no se escapa ninguna clave", () => {
    pintar(serie(3), serie(6), "en");
    expect(document.body.textContent).not.toContain("historico.");
    expect(
      document.querySelector(".vmw-oficial__desfase")?.textContent,
    ).toContain("d apart");
  });
});
