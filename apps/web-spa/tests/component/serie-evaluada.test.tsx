/**
 * Capa de referencia de la serie evaluada del histórico.
 *
 * Lo que estos tests fijan no es «que se pinte», sino **el orden y la
 * condicionalidad**, que es donde una regresión pasaría desapercibida:
 *
 * - La serie va la ÚLTIMA. Si una capa de contexto acabara encima, taparía el
 *   dato y nadie lo notaría en una captura.
 * - El umbral aparece **solo** si el indicador participa en alguna regla. Una
 *   línea coral sin regla detrás sería un dato inventado.
 * - La escala incluye las capas de referencia. Un umbral lejano dibujado fuera
 *   del `viewBox` se leería como «no hay umbral», que es peor que no verlo.
 */

import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SerieEvaluada } from "../../src/components/SerieEvaluada";
import type { CondicionDeIndicador } from "../../src/lib/reglas";
import { renderConProveedores as render } from "../render";

afterEach(cleanup);

const PUNTOS = [
  { t: 1, valor: "10" },
  { t: 2, valor: "12" },
  { t: 3, valor: "14" },
  { t: 4, valor: "16" },
  { t: 5, valor: "18" },
];

const CONDICION: CondicionDeIndicador = {
  regla: "arranque_alcista@v1",
  op: "gt",
  umbral: "25",
  cumple: false,
  indice: 1,
  total: 3,
};

function pintar(
  props: Partial<Parameters<typeof SerieEvaluada>[0]> = {},
  idioma: "es" | "en" = "es",
) {
  return render(
    <SerieEvaluada
      puntos={PUNTOS}
      condicion={null}
      idioma={idioma}
      vacio="sin datos"
      etiqueta="serie"
      {...props}
    />,
    { idioma },
  );
}

const svg = () => document.querySelector(".vmw-serieval") as SVGElement;
const capas = () => [...svg().children];

describe("SerieEvaluada · capa de referencia", () => {
  it("pinta las capas en el orden acordado y la serie encima de todo", () => {
    pintar({ condicion: CONDICION });
    const orden = capas().map((n) => n.tagName.toLowerCase());

    // banda, 4 gridlines, mediana, umbral, hoy, serie
    expect(orden).toEqual([
      "rect",
      "line", "line", "line", "line",
      "polyline", "polyline", "polyline", "polyline",
    ]);
    expect(capas().at(-1)?.getAttribute("stroke")).toBe("var(--series-buy)");
    expect(capas().at(-1)?.getAttribute("stroke-width")).toBe("2.2");
  });

  it("la banda cubre del percentil 10 al 90, sin borde", () => {
    pintar();
    const banda = capas()[0] as SVGRectElement;
    expect(banda.tagName.toLowerCase()).toBe("rect");
    expect(banda.getAttribute("fill")).toBe("var(--overlay-soft)");
    expect(banda.getAttribute("stroke")).toBe("none");
    // Sobre 10..18, p10=10 y p90=18: la banda cubre casi todo el alto util,
    // pero NO puede ser degenerada. El `> 0` a secas no bastaba: con los
    // percentiles mal llamados los tres colapsaban al maximo, la altura se
    // clampaba a 1 y este test pasaba igual sobre codigo roto.
    expect(Number(banda.getAttribute("height"))).toBeGreaterThan(50);
    expect(Number(banda.getAttribute("height"))).toBeLessThanOrEqual(280);
  });

  it("sin regla NO hay línea de umbral", () => {
    pintar({ condicion: null });
    const corales = capas().filter(
      (n) => n.getAttribute("stroke") === "var(--coral)",
    );
    expect(corales).toHaveLength(0);
    // …y la leyenda tampoco lo menciona.
    expect(screen.queryByText(/umbral/i)).toBeNull();
  });

  it("con regla, el umbral entra en la escala aunque quede fuera del recorrido", () => {
    // La serie va de 10 a 18 y el umbral es 25: con la escala de la serie a
    // secas, la línea caería fuera del viewBox y se leería como «sin umbral».
    pintar({ condicion: CONDICION });
    const coral = capas().find(
      (n) => n.getAttribute("stroke") === "var(--coral)",
    ) as SVGPolylineElement;
    expect(coral).toBeTruthy();
    const y = Number(coral.getAttribute("points")?.split(",")[1]?.split(" ")[0]);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(280);
  });

  it("la línea de hoy usa el token de contraste, nunca un blanco literal", () => {
    // El defecto que documenta `tests/unit/tema-tokens.test.ts`: en tema claro
    // `#fff` deja la línea invisible sobre la tarjeta.
    pintar();
    const hoy = capas().find(
      (n) => n.getAttribute("stroke-dasharray") === "2 6",
    ) as SVGPolylineElement;
    expect(hoy.getAttribute("stroke")).toBe("var(--white)");
    expect(hoy.getAttribute("opacity")).toBe("0.5");
  });

  it("la leyenda nombra las cuatro referencias, con sus valores", () => {
    pintar({ condicion: CONDICION });
    expect(screen.getByText(/80 % central de la ventana/)).toBeTruthy();
    expect(screen.getByText("mediana")).toBeTruthy();
    expect(screen.getByText("14")).toBeTruthy(); // mediana: NO puede ser 18
    expect(screen.getByText("hoy")).toBeTruthy();
    expect(screen.getByText("18")).toBeTruthy(); // último punto
    expect(screen.getByText(/umbral: por encima de 25/)).toBeTruthy();
  });

  it("en inglés la leyenda también traduce", () => {
    pintar({ condicion: CONDICION }, "en");
    // El idioma del texto lo pone el proveedor; aquí basta con que las claves
    // existan y no salga el identificador crudo.
    expect(document.body.textContent).not.toContain("historico.leyenda");
  });

  it("sin puntos no dibuja nada y lo dice", () => {
    pintar({ puntos: [] });
    expect(document.querySelector(".vmw-serieval")).toBeNull();
    expect(screen.getByText("sin datos")).toBeTruthy();
  });
});
