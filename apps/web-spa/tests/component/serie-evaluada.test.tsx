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
import { ES } from "../../src/i18n/dict";
import type { CondicionDeIndicador } from "../../src/lib/reglas";
import { renderConProveedores as render } from "../render";

afterEach(cleanup);

// Un punto por dia. Antes iban separados por MILISEGUNDOS, que no es una
// ventana de histórico de nada: con el eje temporal, una ventana de 4 ms tiene
// una sola fecha que rotular y el test de las marcas fallaba con razón.
const DIA = 86_400_000;
const BASE = Date.parse("2026-09-01T04:00:00Z"); // 2026-09-01T00:00 VET
const PUNTOS = ["10", "12", "14", "16", "18"].map((valor, i) => ({
  t: BASE + i * DIA,
  valor,
}));

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
  dias = 30,
) {
  return render(
    <SerieEvaluada
      puntos={PUNTOS}
      condicion={null}
      indicador="p2p_brecha_pct_buy"
      dias={dias}
      idioma={idioma}
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
    // Acotado a la LEYENDA: la mediana aparece tambien en la rejilla de
    // estadisticas, y un `getByText` global fallaria por duplicado.
    const leyenda = document.querySelector(".vmw-serieval__leyenda")!;
    const texto = leyenda.textContent ?? "";
    expect(texto).toContain("80 % central de la ventana");
    expect(texto).toContain("mediana");
    expect(texto).toContain("14"); // mediana: NO puede ser 18
    expect(texto).toContain("hoy");
    expect(texto).toContain("18"); // último punto
    expect(texto).toContain("umbral: por encima de 25");
  });

  it("en inglés la leyenda también traduce", () => {
    pintar({ condicion: CONDICION }, "en");
    // El idioma del texto lo pone el proveedor; aquí basta con que las claves
    // existan y no salga el identificador crudo.
    expect(document.body.textContent).not.toContain("historico.leyenda");
  });

  it("la cabecera identifica la serie y dice en qué punto está hoy", () => {
    pintar();
    expect(screen.getByText("p2p brecha pct buy")).toBeTruthy(); // legible
    expect(screen.getByText("p2p_brecha_pct_buy")).toBeTruthy(); // la clave
    expect(
      document.querySelector(".vmw-serieval__valor")?.textContent,
    ).toBe("18"); // el ultimo punto
    // La pastilla del percentil, coloreada por zona: hoy es el maximo.
    const pastilla = document.querySelector<HTMLElement>(
      ".vmw-serieval__percentil",
    )!;
    expect(pastilla.textContent).toBe("percentil 90 de 30 d");
    expect(pastilla.style.color).toBe("var(--coral)");
  });

  it("las cuatro estadísticas traen valor y cuándo ocurrió", () => {
    pintar();
    const stats = [...document.querySelectorAll(".vmw-serieval__stat")];
    expect(stats).toHaveLength(4);
    const valores = stats.map(
      (n) => n.querySelector(".vmw-serieval__stat-valor")?.textContent,
    );
    expect(valores).toEqual(["10", "18", "14", "2,83"]); // min, max, mediana, desv

    // La desviacion NO lleva fecha: no ocurre en un punto.
    const detalles = stats.map(
      (n) => n.querySelector(".vmw-serieval__stat-detalle")?.textContent ?? "",
    );
    expect(detalles[3]).toBe("sobre 5 puntos");
    expect(detalles[0]).not.toBe(detalles[3]);
  });

  it("hay eje de fechas bajo el gráfico", () => {
    pintar();
    const fechas = document.querySelector(".vmw-serieval__fechas")!;
    const etiquetas = [...fechas.children].map((n) => n.textContent);
    // Ventana de 4 días con `dias=30`: paso de 3 días, extremos incluidos.
    expect(etiquetas.length).toBeGreaterThanOrEqual(2);
    expect(etiquetas[0]).toBe("1/9");
    expect(etiquetas.at(-1)).toBe("5/9");
    // Ninguna cadena repetida.
    expect(new Set(etiquetas).size).toBe(etiquetas.length);
    // Y cada una en su sitio temporal, no repartidas a partes iguales.
    const izquierdas = [...fechas.children].map(
      (n) => (n as HTMLElement).style.left,
    );
    // Por valor, no por serializacion: el navegador normaliza «0.00%» a «0%».
    expect(parseFloat(izquierdas[0]!)).toBe(0);
    expect(parseFloat(izquierdas.at(-1)!)).toBe(100);
  });

  it("las cifras usan coma en ES y punto en EN", () => {
    pintar();
    expect(
      document.querySelector(".vmw-serieval__stats")?.textContent,
    ).toContain("2,83");
    cleanup();

    pintar({}, "en");
    const enIngles =
      document.querySelector(".vmw-serieval__stats")?.textContent ?? "";
    expect(enIngles).toContain("2.83");
    expect(enIngles).not.toContain("2,83");
  });

  it("sin puntos sustituye el gráfico por un bloque que EXPLICA qué falta", () => {
    // Ni grafico vacio ni spinner: los dos esconden si el problema es que no
    // hay dato, que no ha cargado, o que se pidio algo que no existe.
    pintar({ puntos: [] });
    expect(document.querySelector(".vmw-serieval")).toBeNull();
    const vacio = document.querySelector(".vmw-vacio")!;
    expect(vacio).toBeTruthy();
    expect(vacio.getAttribute("role")).toBe("status");
    expect(screen.getByText(ES["historico.vacioTitulo"])).toBeTruthy();
    // Dice QUE falta y DESDE CUANDO.
    const linea = vacio.querySelector(".vmw-vacio__linea")!.textContent ?? "";
    expect(linea).toContain("p2p brecha pct buy");
    expect(linea).toMatch(/desde el \d+ de \w+/);
    // Y ocupa el alto del grafico: la tarjeta no se encoge.
    expect((vacio as HTMLElement).style.minHeight).toBe("280px");
  });

  it("una ventana más corta que la pedida se ANUNCIA sobre la leyenda", () => {
    // 5 puntos = 4 dias cubiertos contra 30 pedidos. El percentil es legitimo
    // —se calcula sobre lo que hay— pero leerlo como «de 30 dias» seria falso.
    pintar();
    const pastilla = document.querySelector(".vmw-corta")!;
    expect(pastilla).toBeTruthy();
    const texto = pastilla.textContent ?? "";
    expect(texto).toContain("30 d pedidos");
    expect(texto).toContain("4 d disponibles");
    // La base real del calculo, dicha explicitamente.
    expect(texto).toContain("percentil calculado sobre 4 d");

    // Y va ANTES que la leyenda en el DOM: se lee antes que las cifras que
    // matiza, no despues de haberlas creido.
    const leyenda = document.querySelector(".vmw-serieval__leyenda")!;
    expect(
      pastilla.compareDocumentPosition(leyenda) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("con la ventana completa NO hay pastilla", () => {
    // 5 puntos diarios cubren 4 dias: pidiendo 4, la ventana llega.
    pintar({}, "es", 4);
    expect(document.querySelector(".vmw-corta")).toBeNull();
  });
});
