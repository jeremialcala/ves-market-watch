/** Derivaciones de las series del rediseño: extremos exactos, coordenadas de
 * la sparkline, parrilla día × hora en VET y anchos de barra. */

import { describe, expect, it } from "vitest";

import {
  areaPolilinea,
  colorCalor,
  escalaCalor,
  escalaComun,
  PASOS_CALOR,
  PASOS_CALOR_ALTO,
  extremos,
  parrillaCalor,
  percentilDisc,
  porcentajeDeMaximo,
  puntosPolilinea,
  type Punto,
} from "../../src/lib/series";

const T0 = Date.parse("2026-07-30T04:00:00Z"); // 00:00 VET del 30/7

function punto(horasDesdeT0: number, valor: string): Punto {
  return { t: T0 + horasDesdeT0 * 3_600_000, valor };
}

describe("extremos", () => {
  it("compara como decimal exacto, no como texto ni float", () => {
    // "9" > "10" si se comparasen como strings; y 0.1+0.2 rompería en float.
    const rango = extremos([
      punto(0, "9.5"),
      punto(1, "10.25"),
      punto(2, "9.50000001"),
    ]);
    expect(rango).toEqual({ min: "9.5", max: "10.25" });
  });

  it("sin puntos no hay extremos", () => {
    expect(extremos([])).toBeNull();
  });
});

describe("puntosPolilinea", () => {
  it("normaliza al rango propio de la serie", () => {
    const puntos = [punto(0, "10"), punto(1, "20"), punto(2, "30")];
    const linea = puntosPolilinea(puntos, 100, 50, 5);
    const pares = linea.split(" ").map((p) => p.split(",").map(Number));
    expect(pares).toHaveLength(3);
    expect(pares[0][0]).toBe(0); // primer x pegado al origen
    expect(pares[2][0]).toBe(100); // último x al ancho total
    expect(pares[0][1]).toBeGreaterThan(pares[2][1]); // el mayor valor, más arriba
  });

  it("una serie plana no divide por cero", () => {
    const linea = puntosPolilinea([punto(0, "5"), punto(1, "5")], 100, 50, 5);
    expect(linea).not.toContain("NaN");
  });

  it("con un solo punto no divide por cero", () => {
    expect(puntosPolilinea([punto(0, "5")], 100, 50, 5)).not.toContain("NaN");
  });

  it("sin puntos devuelve vacío y el área también", () => {
    expect(puntosPolilinea([], 100, 50, 5)).toBe("");
    expect(areaPolilinea("", 100, 50)).toBe("");
  });

  it("el área cierra la línea contra la base", () => {
    const area = areaPolilinea("0,10 100,20", 100, 50);
    expect(area.startsWith("0,50")).toBe(true);
    expect(area.endsWith("100,50")).toBe(true);
  });
});

describe("parrillaCalor", () => {
  const ahora = new Date(Date.parse("2026-07-30T14:00:00Z"));

  it("agrupa por día operativo VET y rellena las 24 horas", () => {
    const filas = parrillaCalor([punto(3, "13.5")], 2, ahora);
    expect(filas).toHaveLength(2);
    expect(filas[1].dia).toBe("2026-07-30"); // el día más reciente va al final
    expect(filas[1].celdas).toHaveLength(24);
    expect(filas[1].celdas[3].valor).toBe("13.5");
  });

  it("las horas sin bucket quedan en null, no se interpolan", () => {
    const filas = parrillaCalor([punto(3, "13.5")], 1, ahora);
    expect(filas[0].celdas[4].valor).toBeNull();
  });

  it("usa el desplazamiento VET, no la zona del navegador", () => {
    // 03:00 UTC del 30 es todavía el 29 en Venezuela (UTC−4).
    const filas = parrillaCalor(
      [{ t: Date.parse("2026-07-30T03:00:00Z"), valor: "12" }],
      2,
      ahora,
    );
    expect(filas[0].dia).toBe("2026-07-29");
    expect(filas[0].celdas[23].valor).toBe("12");
  });
});

describe("percentilDisc", () => {
  const serie = (...valores: string[]) =>
    valores.map((valor, i) => ({ t: i, valor }));

  it("devuelve un valor OBSERVADO, nunca uno interpolado", () => {
    // Entre 10 y 20 el p50 continuo daría 15, que nadie midió. ADR-0017 manda
    // el discreto, y aquí encima el valor se rotula en la leyenda.
    expect(percentilDisc(serie("10", "20"), 0.5)).toBe("10");
  });

  it("coincide con `percentile_disc` de Postgres", () => {
    const diez = serie("1", "2", "3", "4", "5", "6", "7", "8", "9", "10");
    expect(percentilDisc(diez, 0.9)).toBe("9");
    expect(percentilDisc(diez, 0.1)).toBe("1");
    expect(percentilDisc(diez, 1)).toBe("10");
  });

  it("ordena por valor decimal, no alfabéticamente", () => {
    // "9" > "10" como cadenas: sin comparación decimal el p90 saldría al revés.
    expect(percentilDisc(serie("10", "9", "2"), 0.9)).toBe("10");
  });

  it("sin puntos no hay percentil", () => {
    expect(percentilDisc([], 0.9)).toBeNull();
  });
});

describe("colorCalor", () => {
  // Las rampas viven en CSS (una por tema): aquí se comprueba el reparto en
  // escalones y el corte de categoría, no el color — los valores los fija
  // `paleta.test.ts`.
  const escala = { p10: "10", p90: "20", max: "30" };

  it("reparte del p10 al p90 en los escalones de la rampa", () => {
    expect(colorCalor("10", escala)).toBe("var(--calor-1)");
    expect(colorCalor("14", escala)).toBe("var(--calor-3)");
    expect(colorCalor("19.9", escala)).toBe(`var(--calor-${PASOS_CALOR})`);
  });

  it("el p90 EXACTO todavía es rampa: el exceso es estrictamente por encima", () => {
    expect(colorCalor("20", escala)).toBe(`var(--calor-${PASOS_CALOR})`);
    expect(colorCalor("20.01", escala)).toBe("var(--calor-alto-1)");
  });

  it("por encima del p90 usa el coral de exceso, con su propio reparto", () => {
    expect(colorCalor("22", escala)).toBe("var(--calor-alto-1)");
    expect(colorCalor("30", escala)).toBe(`var(--calor-alto-${PASOS_CALOR_ALTO})`);
  });

  it("por debajo del p10 se acota en vez de salirse de la rampa", () => {
    expect(colorCalor("-5", escala)).toBe("var(--calor-1)");
  });

  it("una serie PLANA no se pinta entera como exceso", () => {
    /*
     * El caso degenerado que importa: con todos los valores iguales el p90 es
     * ese mismo valor, y un corte con `>=` habría dejado el mapa entero en
     * coral — «la brecha se salió de su rango» dicho de una serie que no se
     * movió. Por eso el corte es estricto.
     */
    const plana = { p10: "12", p90: "12", max: "12" };
    expect(colorCalor("12", plana)).toBe("var(--calor-1)");
  });
});

describe("escalaCalor", () => {
  it("ancla la rampa en p10/p90 y el exceso en el máximo", () => {
    const puntos = Array.from({ length: 10 }, (_, i) => ({
      t: i,
      valor: String(i + 1),
    }));
    expect(escalaCalor(puntos)).toEqual({ p10: "1", p90: "9", max: "10" });
  });

  it("una hora extrema NO comprime la rampa entera", () => {
    /*
     * El defecto que motivó pasar de min/max a p10/p90: un solo pico dejaba al
     * resto del mapa repartido entre dos escalones y todo se leía plano.
     */
    const puntos = [
      ...Array.from({ length: 19 }, (_, i) => ({ t: i, valor: String(10 + i) })),
      { t: 99, valor: "500" },
    ];
    const escala = escalaCalor(puntos);
    expect(escala?.max).toBe("500");
    // El p90 se queda con la masa de la serie, lejos del pico.
    expect(Number(escala?.p90)).toBeLessThan(30);
    // Y dos valores vecinos del cuerpo siguen cayendo en escalones distintos.
    expect(colorCalor("11", escala!)).not.toBe(colorCalor("25", escala!));
  });

  it("sin puntos no hay escala", () => {
    expect(escalaCalor([])).toBeNull();
  });
});

describe("porcentajeDeMaximo", () => {
  it("da el ancho relativo acotado a [0, 100]", () => {
    expect(porcentajeDeMaximo("50", "200")).toBe("25.0%");
    expect(porcentajeDeMaximo("400", "200")).toBe("100.0%");
    expect(porcentajeDeMaximo("-5", "200")).toBe("0.0%");
  });

  it("con máximo cero no hay porcentaje", () => {
    expect(porcentajeDeMaximo("50", "0")).toBe("0%");
  });
});

// -- escala compartida entre series ------------------------------------------

describe("escala compartida", () => {
  const compra = [
    { t: 1, valor: "13.0" },
    { t: 2, valor: "14.0" },
  ];
  const venta = [
    { t: 1, valor: "12.0" },
    { t: 2, valor: "12.5" },
  ];

  it("toma los extremos de TODAS las series", () => {
    expect(escalaComun(compra, venta)).toEqual({ min: 12, max: 14 });
  });

  it("sin puntos no hay escala que imponer", () => {
    expect(escalaComun([], [])).toBeNull();
  });

  it("con escala común, la serie MÁS BAJA queda dibujada más abajo", () => {
    /*
     * El defecto que esto evita: `puntosPolilinea` escala con los extremos de
     * SUS puntos, así que dos series en el mismo SVG se normalizan cada una a
     * todo el alto. La de venta (12,0–12,5 %) acabaría dibujada al mismo nivel
     * que la de compra (13,0–14,0 %), o incluso por encima.
     */
    const escala = escalaComun(compra, venta);
    const yDe = (linea: string) =>
      linea.split(" ").map((par) => Number(par.split(",")[1]));

    const yCompra = yDe(puntosPolilinea(compra, 100, 100, 8, escala));
    const yVenta = yDe(puntosPolilinea(venta, 100, 100, 8, escala));

    // En SVG, más Y = más abajo. Toda la venta va por debajo de toda la compra.
    expect(Math.min(...yVenta)).toBeGreaterThan(Math.max(...yCompra));
  });

  it("sin escala común cada serie se normaliza sola, y por eso engaña", () => {
    const yDe = (linea: string) =>
      linea.split(" ").map((par) => Number(par.split(",")[1]));
    const yCompra = yDe(puntosPolilinea(compra, 100, 100, 8));
    const yVenta = yDe(puntosPolilinea(venta, 100, 100, 8));
    // Idénticas pese a estar más de un punto porcentual separadas.
    expect(yVenta).toEqual(yCompra);
  });

  it("sin escala explícita el comportamiento previo no cambia", () => {
    expect(puntosPolilinea(compra, 100, 100, 8)).toBe(
      puntosPolilinea(compra, 100, 100, 8, null),
    );
  });
});
