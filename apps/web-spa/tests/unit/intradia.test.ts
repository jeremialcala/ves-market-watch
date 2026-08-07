/** Día operativo VET y variación contra la apertura. El borde que importa es
 * el cruce de medianoche: entre las 00:00 y las 04:00 UTC todavía es el día
 * ANTERIOR en Caracas, y el intradía no puede saltar de día antes de tiempo. */

import { describe, expect, it } from "vitest";

import {
  etiquetaDiaVET,
  grupoDe,
  horaVET,
  inicioDiaVET,
  ladoDe,
  ladoDeGrupo,
  presentacionDe,
  resumenIntradia,
  type PuntoIntradia,
} from "../../src/lib/intradia";

describe("inicioDiaVET", () => {
  it("ancla la apertura en las 00:00 VET = 04:00 UTC", () => {
    const ahora = new Date("2026-07-28T15:30:00Z"); // 11:30 VET
    expect(inicioDiaVET(ahora).toISOString()).toBe("2026-07-28T04:00:00.000Z");
  });

  it("antes de las 04:00 UTC sigue siendo el día VET anterior", () => {
    // 02:00 UTC del 29 = 22:00 VET del 28: el día operativo aún es el 28.
    const ahora = new Date("2026-07-29T02:00:00Z");
    expect(inicioDiaVET(ahora).toISOString()).toBe("2026-07-28T04:00:00.000Z");
  });

  it("a las 04:00 UTC exactas empieza el día nuevo", () => {
    const ahora = new Date("2026-07-29T04:00:00Z");
    expect(inicioDiaVET(ahora).toISOString()).toBe("2026-07-29T04:00:00.000Z");
  });

  it("cruza fin de mes sin desbordarse", () => {
    const ahora = new Date("2026-08-01T03:59:00Z"); // 23:59 VET del 31/07
    expect(inicioDiaVET(ahora).toISOString()).toBe("2026-07-31T04:00:00.000Z");
  });

  it("la apertura es idempotente (su propio inicio de día)", () => {
    const inicio = inicioDiaVET(new Date("2026-07-28T15:30:00Z"));
    expect(inicioDiaVET(inicio).toISOString()).toBe(inicio.toISOString());
  });
});

describe("horaVET y etiquetaDiaVET", () => {
  it("imprime la hora de Caracas, no la del navegador", () => {
    expect(horaVET(Date.parse("2026-07-28T15:30:00Z"))).toBe("11:30");
    expect(horaVET(Date.parse("2026-07-28T04:00:00Z"))).toBe("00:00");
    expect(horaVET(Date.parse("2026-07-29T02:05:00Z"))).toBe("22:05");
  });

  it("la etiqueta del día usa la fecha VET", () => {
    // 02:00 UTC del 29 todavía es el 28 en Caracas.
    expect(etiquetaDiaVET(new Date("2026-07-29T02:00:00Z"))).toContain("28");
  });

  it("la etiqueta se escribe en el idioma de la interfaz", () => {
    // Dentro de una frase en inglés, un «28 de julio» delata que la fecha se
    // formateó en otro sitio: el idioma es parámetro, no constante.
    const instante = new Date("2026-07-29T02:00:00Z");
    expect(etiquetaDiaVET(instante, "es")).toMatch(/jul/i);
    expect(etiquetaDiaVET(instante, "en")).toMatch(/jul/i);
    expect(etiquetaDiaVET(instante, "es")).not.toBe(
      etiquetaDiaVET(instante, "en"),
    );
  });
});

describe("clasificación de indicadores", () => {
  it("el lado sale del sufijo canónico", () => {
    expect(ladoDe("p2p_mediana_buy")).toBe("compra");
    expect(ladoDe("p2p_mediana_sell")).toBe("venta");
    expect(ladoDe("p2p_spread_pct")).toBe("sin-lado");
    expect(ladoDe("official_rate")).toBe("sin-lado");
  });

  it("agrupa oficial, lados y microestructura", () => {
    expect(grupoDe("official_rate_change_pct")).toBe("oficial");
    expect(grupoDe("p2p_brecha_pct_buy")).toBe("compra");
    expect(grupoDe("p2p_liquidez_sell")).toBe("venta");
    expect(grupoDe("p2p_ratio_oferta_demanda")).toBe("microestructura");
  });

  it("oficial y microestructura comparten el slot sin lado", () => {
    expect(ladoDeGrupo("oficial")).toBe("sin-lado");
    expect(ladoDeGrupo("microestructura")).toBe("sin-lado");
    expect(ladoDeGrupo("compra")).toBe("compra");
    expect(ladoDeGrupo("venta")).toBe("venta");
  });

  it("un indicador desconocido no tiene etiqueta, y su clave es su nombre", () => {
    /*
     * RF-7: aparece igual sin tocar el catálogo. Lo que NO se hace es inventarle
     * un rótulo: `etiqueta` en null y el componente pinta el nombre canónico una
     * sola vez, sin repetirlo debajo.
     */
    const presentacion = presentacionDe("p2p_metrica_futura_buy");
    expect(presentacion.etiqueta).toBeNull();
    expect(presentacion.clave).toBe("p2p_metrica_futura_buy");
    expect(presentacion.unidad).toBe("");
  });

  it("la etiqueta de un p2p_* no depende del lado, pero la CLAVE sí", () => {
    /*
     * La etiqueta nombra la familia («Mediana VES») y es la misma en los dos
     * lados; la clave identifica la SERIE, y `p2p_mediana_buy` no es
     * `p2p_mediana_sell`. Devolver la misma para las dos sería dar un
     * identificador que no distingue lo que está en pantalla.
     */
    const compra = presentacionDe("p2p_mediana_buy");
    const venta = presentacionDe("p2p_mediana_sell");

    expect(compra.etiqueta).toBe(venta.etiqueta);
    expect(compra.unidad).toBe(venta.unidad);
    expect(compra.clave).toBe("p2p_mediana_buy");
    expect(venta.clave).toBe("p2p_mediana_sell");
    expect(presentacionDe("p2p_brecha_pct_buy").unidad).toBe("%");
  });

  it("la clave que se muestra EXISTE en el contrato", () => {
    /*
     * La guarda contra el rótulo bonito. Los nombres reales de `indicators` son
     * `p2p_brecha_abs`, `p2p_liquidez`, `p2p_drenaje_oferta_6h_pct`— no
     * `p2p_brecha_ves` ni `micro_drenaje_oferta_6h`. Una clave inventada se lee
     * como un identificador y falla en cuanto alguien la copia a una consulta.
     */
    for (const canonico of [
      "p2p_brecha_abs_buy",
      "p2p_liquidez_sell",
      "p2p_drenaje_oferta_6h_pct",
      "p2p_ratio_oferta_demanda",
    ]) {
      expect(presentacionDe(canonico).clave).toBe(canonico);
      expect(presentacionDe(canonico).etiqueta).not.toBeNull();
    }
  });
});

function puntos(...valores: string[]): PuntoIntradia[] {
  return valores.map((valor, i) => ({ t: 1_000 + i * 300_000, valor }));
}

describe("resumenIntradia", () => {
  it("mide la Δ contra la apertura (primer bucket), no contra el previo", () => {
    const resumen = resumenIntradia(puntos("100", "120", "110"));
    expect(resumen?.apertura).toBe("100");
    expect(resumen?.ultimo).toBe("110");
    expect(resumen?.deltaAbs).toBe("10");
    expect(resumen?.deltaPct).toBe("10.00");
    expect(resumen?.direccion).toBe(1);
  });

  it("detecta la caída", () => {
    const resumen = resumenIntradia(puntos("417.03", "410.00"));
    expect(resumen?.deltaAbs).toBe("-7.03");
    expect(resumen?.direccion).toBe(-1);
  });

  it("día plano: dirección 0 y Δ cero, no un signo arbitrario", () => {
    const resumen = resumenIntradia(puntos("417.0300", "417.03"));
    expect(resumen?.direccion).toBe(0);
    expect(resumen?.deltaPct).toBe("0.00");
  });

  it("apertura en cero deja el % en null (se omite)", () => {
    const resumen = resumenIntradia(puntos("0", "5"));
    expect(resumen?.deltaAbs).toBe("5");
    expect(resumen?.deltaPct).toBeNull();
  });

  it("apertura negativa también: el % mentiría el sentido", () => {
    /*
     * Visto en vivo en `p2p_momentum_bid_3h_pct`: abrió en −0,24 y estaba en
     * +0,31 —una subida— y la tarjeta escribía «+0,55 (−232,25 %)». El cociente
     * es aritméticamente correcto y la frase es falsa: contra una base con
     * signo, el porcentaje no describe la dirección del movimiento.
     */
    const resumen = resumenIntradia(puntos("-0.24", "0.31"));
    expect(resumen?.deltaAbs).toBe("0.55");
    expect(resumen?.direccion).toBe(1);
    expect(resumen?.deltaPct).toBeNull();
  });

  it("un solo bucket: la apertura es también el último, Δ = 0", () => {
    const resumen = resumenIntradia(puntos("417.03"));
    expect(resumen?.deltaAbs).toBe("0.00");
    expect(resumen?.direccion).toBe(0);
  });

  it("serie vacía es null (el panel muestra «sin datos»)", () => {
    expect(resumenIntradia([])).toBeNull();
  });
});
