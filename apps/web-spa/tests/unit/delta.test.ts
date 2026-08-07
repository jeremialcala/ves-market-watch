/**
 * Las reglas de formato de toda variación del Intradía.
 *
 * Viven en un solo sitio porque estaban repetidas en cinco componentes, y por
 * ahí se colaron dos cosas que llegaron a pantalla: un porcentaje que
 * contradecía el signo que tenía al lado y un signo duplicado. Cada caso de aquí
 * es uno de los que se vieron o uno que la regla promete evitar.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  APERTURA_MINIMA_PCT,
  formatearDelta,
  MENOS,
  valorConUnidad,
} from "../../src/lib/delta";

const SIN_CAMBIO = "— sin cambio";
const NBSP = " ";

function fmt(
  deltaAbs: string,
  apertura: string | null,
  opciones: { unidad?: string; decimales?: number; idioma?: "es" | "en" } = {},
) {
  return formatearDelta(
    { deltaAbs, apertura },
    { sinCambio: SIN_CAMBIO, decimales: 2, ...opciones },
  );
}

describe("formatearDelta", () => {
  it("el menos es U+2212, nunca el guion ASCII", () => {
    const { texto } = fmt("-3.5", "100");

    expect(texto.startsWith(MENOS)).toBe(true);
    expect(MENOS).toBe("−");
    expect(texto).not.toContain("-");
  });

  it("el «+» va explícito solo en positivos", () => {
    expect(fmt("3.5", "100").texto.startsWith("+")).toBe(true);
    expect(fmt("-3.5", "100").texto.startsWith("+")).toBe(false);
  });

  it("sin movimiento se DICE, no se imprime un «+0»", () => {
    const delta = fmt("0", "100");

    expect(delta.texto).toBe(SIN_CAMBIO);
    expect(delta.sinCambio).toBe(true);
    expect(delta.color).toBe("var(--dir-neutral)");
  });

  it("la dirección la dan el signo y el color, sin glifos", () => {
    expect(fmt("1", "100").color).toBe("var(--dir-alcista)");
    expect(fmt("-1", "100").color).toBe("var(--dir-bajista)");
    for (const glifo of ["▲", "▼", "●"]) {
      expect(fmt("1", "100").texto).not.toContain(glifo);
      expect(fmt("-1", "100").texto).not.toContain(glifo);
    }
  });

  it("la unidad va pegada a la cifra con espacio duro", () => {
    /*
     * Duro y no normal: la unidad no puede quedarse sola al final de una línea,
     * y en una tarjeta estrecha el salto cae justo ahí.
     */
    expect(fmt("10", "100", { unidad: "VES" }).texto).toBe(
      `+10${NBSP}VES (+10${NBSP}%)`,
    );
    expect(fmt("10", "100").texto).toBe(`+10 (+10${NBSP}%)`);
  });

  it("con apertura cero no hay porcentaje que dar", () => {
    expect(fmt("5", "0").texto).toBe("+5");
  });

  it("con apertura NEGATIVA tampoco: el cociente invierte el sentido", () => {
    /*
     * El caso que se vio en vivo. `p2p_momentum_bid_3h_pct` abrió en −0,24 y
     * estaba en +0,31: una SUBIDA de 0,55. El cociente daba −232,25 %, así que
     * la tarjeta escribía «+0,55 (−232,25 %)» —y con el signo antepuesto,
     * «+−232,25 %»—. El número era correcto y la frase falsa.
     */
    const delta = fmt("0.55", "-0.24");

    expect(delta.texto).toBe("+0,55");
    expect(delta.texto).not.toContain("%");
    expect(delta.direccion).toBe(1);
  });

  it("con apertura pequeña tampoco, aunque sea positiva", () => {
    // 0,4 → 0,8 es +100 % de casi nada: la cifra en puntos no engaña.
    expect(fmt("0.4", "0.4").texto).toBe("+0,4");
    // Justo en el límite sí se da: la regla es «menor que», no «menor o igual».
    expect(fmt("0.5", APERTURA_MINIMA_PCT).texto).toBe(`+0,5 (+100${NBSP}%)`);
  });

  it("el signo del porcentaje es el MISMO que el de la Δ, por construcción", () => {
    /*
     * No se copia el signo que devuelve la división: se compone a partir de la
     * dirección de la Δ y de la magnitud del porcentaje. Es lo que hace
     * imposible volver a imprimir dos signos seguidos.
     */
    for (const texto of [fmt("-20", "100").texto, fmt("20", "100").texto]) {
      expect(texto).not.toMatch(/[+−]{2}/);
      expect(texto).not.toContain("+−");
    }
    expect(fmt("-20", "100").texto).toBe(`${MENOS}20 (${MENOS}20${NBSP}%)`);
  });

  it("sin base contra la que medir no se inventa un porcentaje", () => {
    // Un salto de liquidez de la cronología: es una diferencia suelta.
    expect(fmt("490000", null, { decimales: 0, unidad: "USDT" }).texto).toBe(
      `+490.000${NBSP}USDT`,
    );
  });

  it("los separadores son los del idioma, en los dos sitios", () => {
    const es = fmt("1234.5", "10000", { unidad: "VES", decimales: 1 }).texto;
    const en = fmt("1234.5", "10000", {
      unidad: "VES",
      decimales: 1,
      idioma: "en",
    }).texto;

    expect(es).toBe(`+1.234,5${NBSP}VES (+12,34${NBSP}%)`);
    expect(en).toBe(`+1,234.5${NBSP}VES (+12.34${NBSP}%)`);
  });
});

describe("valorConUnidad", () => {
  it("pega la unidad al valor y usa el menos tipográfico", () => {
    expect(valorConUnidad("-18.31", { unidad: "%", decimales: 2 })).toBe(
      `${MENOS}18,31${NBSP}%`,
    );
    expect(valorConUnidad("853.1", { unidad: "VES", decimales: 4 })).toBe(
      `853,1${NBSP}VES`,
    );
  });

  it("sin unidad no deja un espacio colgando", () => {
    expect(valorConUnidad("0.452", { decimales: 3 })).toBe("0,452");
  });

  it("respeta el idioma", () => {
    expect(
      valorConUnidad("1234567.89", { unidad: "USDT", decimales: 2, idioma: "en" }),
    ).toBe(`1,234,567.89${NBSP}USDT`);
  });
});

/**
 * La centralización no se sostiene sola: basta con que alguien componga un
 * `${signo}${num(x)} %` a mano para tener otra vez dos formatos. Esto lo vigila.
 */
describe("centralización", () => {
  const FUENTES = [
    "src/views/IntradayView.tsx",
    "src/components/SideBySide.tsx",
    "src/components/MicroCards.tsx",
    "src/components/SessionMovers.tsx",
    "src/components/SessionTimeline.tsx",
    "src/components/SessionReading.tsx",
  ];

  const leer = (ruta: string) =>
    readFileSync(resolve(process.cwd(), ruta), "utf8");

  it("todo componente del Intradía que pinta una Δ usa la función común", () => {
    for (const ruta of FUENTES) {
      expect(leer(ruta), ruta).toMatch(/from "\.\.?\/(\.\.\/)?lib\/delta"/);
    }
  });

  it("no quedan glifos de dirección en ninguna fuente", () => {
    /*
     * Eran un tercer canal que repetía lo que ya dicen el signo escrito y el
     * color, y obligaban a traducir el triángulo mentalmente.
     */
    for (const ruta of FUENTES) {
      const fuente = leer(ruta);
      for (const glifo of ["▲", "▼"]) {
        expect(fuente.includes(glifo), `${ruta} conserva ${glifo}`).toBe(false);
      }
    }
  });

  it("nadie compone un porcentaje a mano en una plantilla", () => {
    /*
     * El patrón exacto que produjo el «+−382,85 %»: pegar un signo delante de un
     * número que YA trae el suyo.
     */
    for (const ruta of FUENTES) {
      expect(leer(ruta), ruta).not.toMatch(/\$\{signo\w*\}\$\{num/);
      expect(leer(ruta), ruta).not.toMatch(/deltaPct/);
    }
  });
});
