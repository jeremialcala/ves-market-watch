/**
 * Eje X temporal.
 *
 * Lo que se defiende, por orden:
 *
 * 1. **La X es el tiempo.** Un hueco de fin de semana tiene que ocupar sitio;
 *    si se reparte por índice, el viernes y el lunes salen pegados y el gráfico
 *    dice que el BCV publicó cuando no lo hizo.
 * 2. **Las marcas nacen del calendario, no de los puntos.** Si no, heredan la
 *    irregularidad de la serie y se apiñan donde hay datos.
 * 3. **La primera y la última siempre están**, y ninguna cadena se repite.
 */

import { describe, expect, it } from "vitest";

import {
  etiquetaFecha,
  marcasTiempo,
  MINIMO_PX,
  pasoDias,
  puntosTemporales,
} from "../../src/lib/ejeTiempo";

const DIA = 86_400_000;
/** 2026-09-01T04:00:00Z = 2026-09-01T00:00 VET (VET = UTC-4). */
const LUNES = Date.parse("2026-09-01T04:00:00Z");

const x = (par: string) => Number(par.split(",")[0]);

describe("puntosTemporales", () => {
  it("coloca cada punto según su timestamp, no según su índice", () => {
    // Tres puntos: día 0, día 1 y día 10. Por índice el del medio caería en la
    // mitad; por tiempo cae en el 10 % del ancho.
    const partes = puntosTemporales(
      [
        { t: 0, valor: "1" },
        { t: DIA, valor: "2" },
        { t: 10 * DIA, valor: "3" },
      ],
      1000,
      100,
      10,
    ).split(" ");
    expect(x(partes[0])).toBe(0);
    expect(x(partes[1])).toBe(100); // 1/10 del lapso
    expect(x(partes[2])).toBe(1000);
  });

  it("un hueco de fin de semana OCUPA sitio", () => {
    // Viernes, lunes: tres días de distancia. Entre el jueves y el viernes hay
    // uno. El tramo viernes→lunes tiene que ser el triple de ancho.
    const partes = puntosTemporales(
      [
        { t: 0, valor: "1" }, // jueves
        { t: DIA, valor: "2" }, // viernes
        { t: 4 * DIA, valor: "3" }, // lunes
      ],
      1000,
      100,
      10,
    ).split(" ");
    const jueVie = x(partes[1]) - x(partes[0]);
    const vieLun = x(partes[2]) - x(partes[1]);
    expect(vieLun).toBeCloseTo(jueVie * 3, 1);
  });

  it("sin puntos no hay polilínea", () => {
    expect(puntosTemporales([], 1000, 100, 10)).toBe("");
  });
});

describe("pasoDias", () => {
  it("día para 7 d, cada 3 para 30 d, semanal para 90 d", () => {
    expect(pasoDias(7)).toBe(1);
    expect(pasoDias(30)).toBe(3);
    expect(pasoDias(90)).toBe(7);
  });
});

describe("etiquetaFecha", () => {
  it("d/m en español y m/d en inglés", () => {
    expect(etiquetaFecha(LUNES, "es")).toBe("1/9");
    expect(etiquetaFecha(LUNES, "en")).toBe("9/1");
  });

  it("usa el día VET, no el del navegador", () => {
    // 03:00 UTC del día 2 es todavía el día 1 en VET (UTC-4).
    const t = Date.parse("2026-09-02T03:00:00Z");
    expect(etiquetaFecha(t, "es")).toBe("1/9");
  });
});

describe("marcasTiempo", () => {
  it("genera marcas del CALENDARIO, no de los puntos", () => {
    // Ventana de 7 días: una marca por día, más los extremos.
    const marcas = marcasTiempo(LUNES, LUNES + 7 * DIA, 7, "es", 1000);
    expect(marcas.length).toBeGreaterThanOrEqual(6);
    // Todas caen en inicio de día VET salvo los extremos, que son los datos.
    expect(marcas[0].t).toBe(LUNES);
    expect(marcas[marcas.length - 1].t).toBe(LUNES + 7 * DIA);
  });

  it("la primera y la última SIEMPRE se muestran", () => {
    // Eje estrechísimo: todo lo intermedio debería caer, menos los extremos.
    const marcas = marcasTiempo(LUNES, LUNES + 90 * DIA, 90, "es", 50);
    expect(marcas).toHaveLength(2);
    expect(marcas[0].fraccion).toBe(0);
    expect(marcas[1].fraccion).toBe(1);
  });

  it("nunca repite la misma cadena", () => {
    const marcas = marcasTiempo(LUNES, LUNES + 30 * DIA, 30, "es", 1200);
    const etiquetas = marcas.map((m) => m.etiqueta);
    expect(new Set(etiquetas).size).toBe(etiquetas.length);
  });

  it("respeta la separación mínima eliminando la intermedia", () => {
    const ancho = 400;
    const marcas = marcasTiempo(LUNES, LUNES + 30 * DIA, 30, "es", ancho);
    for (let i = 1; i < marcas.length; i++) {
      const px = (marcas[i].fraccion - marcas[i - 1].fraccion) * ancho;
      expect(px).toBeGreaterThanOrEqual(MINIMO_PX - 0.01);
    }
  });

  it("si la última queda pegada, cae la ANTERIOR y no ella", () => {
    // Ventana de 30 d con un ancho que deja la penúltima marca muy cerca del
    // final: la que sobra es la penúltima, porque la última es intocable.
    const ancho = 300;
    const marcas = marcasTiempo(LUNES, LUNES + 30 * DIA + DIA / 2, 30, "es", ancho);
    expect(marcas[marcas.length - 1].fraccion).toBe(1);
    const ultimoHueco =
      (1 - marcas[marcas.length - 2].fraccion) * ancho;
    expect(ultimoHueco).toBeGreaterThanOrEqual(MINIMO_PX - 0.01);
  });

  it("una ventana sin lapso da una sola marca en vez de dividir por cero", () => {
    const marcas = marcasTiempo(LUNES, LUNES, 30, "es", 800);
    expect(marcas).toHaveLength(1);
    expect(marcas[0].fraccion).toBe(0);
  });
});
