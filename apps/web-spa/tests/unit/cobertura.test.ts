/**
 * Cobertura de la ventana.
 *
 * La regla que estos tests protegen: **el percentil nunca se calcula en
 * silencio sobre una base distinta de la anunciada**. Si la ventana no llega,
 * hay que poder decir las tres cifras.
 */

import { describe, expect, it } from "vitest";

import {
  desfaseEntre,
  diasCubiertos,
  ventanaInsuficiente,
} from "../../src/lib/cobertura";

const DIA = 86_400_000;
const serie = (dias: number[]) => dias.map((d) => ({ t: d * DIA, valor: "1" }));

describe("diasCubiertos", () => {
  it("mide del primer punto al último", () => {
    expect(diasCubiertos(serie([0, 5, 18]))).toBe(18);
  });

  it("con menos de dos puntos no hay ventana", () => {
    expect(diasCubiertos([])).toBe(0);
    expect(diasCubiertos(serie([3]))).toBe(0);
  });
});

describe("ventanaInsuficiente", () => {
  it("avisa cuando la serie no cubre lo pedido", () => {
    expect(ventanaInsuficiente(serie([0, 18]), 30)).toEqual({
      pedidos: 30,
      disponibles: 18,
    });
  });

  it("calla cuando la ventana llega", () => {
    expect(ventanaInsuficiente(serie([0, 30]), 30)).toBeNull();
    expect(ventanaInsuficiente(serie([0, 45]), 30)).toBeNull();
  });

  it("tolera un día: un bucket de arranque no es una carencia", () => {
    // 29,2 dias de 30 es la ventana normal servida por buckets, no un hueco.
    expect(ventanaInsuficiente(serie([0, 29.2]), 30)).toBeNull();
    // 28 si lo es.
    expect(ventanaInsuficiente(serie([0, 28]), 30)).not.toBeNull();
  });

  it("los días disponibles se redondean hacia ABAJO: no se inflan", () => {
    expect(ventanaInsuficiente(serie([0, 18.9]), 30)?.disponibles).toBe(18);
  });

  it("con menos de dos puntos no es «insuficiente» sino «sin datos»", () => {
    // Ese caso tiene su propio bloque, y mezclarlos daria una pastilla sobre un
    // grafico que no existe.
    expect(ventanaInsuficiente([], 30)).toBeNull();
    expect(ventanaInsuficiente(serie([0]), 30)).toBeNull();
  });
});

describe("desfaseEntre", () => {
  it("detecta que una serie termina antes que la otra", () => {
    const d = desfaseEntre(serie([0, 10]), serie([0, 13]))!;
    expect(d.dias).toBe(3);
    expect(d.oficialAtrasada).toBe(true);
    expect(d.atrasada).toBe(10 * DIA);
    expect(d.adelantada).toBe(13 * DIA);
  });

  it("también cuando la que se queda atrás es la evaluada", () => {
    const d = desfaseEntre(serie([0, 13]), serie([0, 10]))!;
    expect(d.oficialAtrasada).toBe(false);
  });

  it("calla si van a la par", () => {
    expect(desfaseEntre(serie([0, 10]), serie([0, 10]))).toBeNull();
    // Medio dia no es un desfase: el bucket de cada serie es distinto.
    expect(desfaseEntre(serie([0, 10]), serie([0, 10.5]))).toBeNull();
  });

  it("sin una de las dos series no hay desfase que anotar", () => {
    expect(desfaseEntre([], serie([0, 10]))).toBeNull();
    expect(desfaseEntre(serie([0, 10]), [])).toBeNull();
  });
});
