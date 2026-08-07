/**
 * El criterio de «Qué se movió desde la apertura».
 *
 * Es la parte con sustancia de esa sección: qué series entran no se cablea, se
 * calcula. Lo que se fija aquí es que el cálculo signifique lo que dice.
 */

import { describe, expect, it } from "vitest";

import type { PuntoIntradia } from "../../src/lib/intradia";
import {
  desviacionTipica,
  fueraDeRango,
  MUESTRAS_MINIMAS_SIGMA,
  movimientosDeSesion,
  sentidoDelMovimiento,
  trazoSparkline,
} from "../../src/lib/movimiento";

function serie(valores: string[]): PuntoIntradia[] {
  return valores.map((valor, i) => ({ t: 1_000 + i * 300_000, valor }));
}

/** Historia plana con la dispersión que se pida, ya con muestras de sobra. */
function historia(base: number, dispersion: number): PuntoIntradia[] {
  return serie(
    Array.from({ length: MUESTRAS_MINIMAS_SIGMA }, (_, i) =>
      String(base + (i % 2 === 0 ? dispersion : -dispersion)),
    ),
  );
}

describe("desviacionTipica", () => {
  it("no estima σ con una muestra que no da para tanto", () => {
    expect(desviacionTipica(["1", "2", "3"])).toBeNull();
  });

  it("una serie que no se movió tiene dispersión cero", () => {
    expect(desviacionTipica(Array(MUESTRAS_MINIMAS_SIGMA).fill("10"))).toBe(0);
  });

  it("es poblacional: describe los días que hay, no infiere otros", () => {
    // σ poblacional de ±2 alternando = 2 exacto; la muestral daría ~2,02.
    expect(desviacionTipica(historia(10, 2).map((p) => p.valor))).toBeCloseTo(
      2,
      10,
    );
  });
});

describe("movimientosDeSesion", () => {
  it("normalizar impide que gane siempre la serie de números grandes", () => {
    /*
     * Sin normalizar, la liquidez copaba las cuatro tarjetas todos los días: su
     * Δ se mide en cientos de miles y la de un ratio en centésimas. Con z, lo
     * que ordena es cuánto se salió CADA UNA de su propia normalidad.
     */
    const sesion = new Map([
      ["p2p_liquidez_sell", serie(["1000000", "1050000"])], // Δ 50 000, σ 100 000
      ["p2p_ratio_oferta_demanda", serie(["0.20", "0.60"])], // Δ 0,4, σ 0,02
    ]);
    const hist = new Map([
      ["p2p_liquidez_sell", historia(1_000_000, 100_000)],
      ["p2p_ratio_oferta_demanda", historia(0.2, 0.02)],
    ]);

    const orden = movimientosDeSesion(sesion, hist).map((m) => m.indicador);

    expect(orden).toEqual(["p2p_ratio_oferta_demanda", "p2p_liquidez_sell"]);
  });

  it("una serie que llevaba 7 días quieta y hoy se mueve va arriba del todo", () => {
    /*
     * σ = 0 con Δ ≠ 0 no es un dato inservible: es lo más inusual que le puede
     * pasar a esa serie. Descartarla escondería justo el evento del día.
     */
    const sesion = new Map([
      ["p2p_merchants_pct_buy", serie(["0", "3"])],
      ["p2p_brecha_pct_buy", serie(["12", "13"])],
    ]);
    const hist = new Map([
      ["p2p_merchants_pct_buy", historia(0, 0)], // nunca se movió
      ["p2p_brecha_pct_buy", historia(12, 0.5)],
    ]);

    const [primero] = movimientosDeSesion(sesion, hist);

    expect(primero.indicador).toBe("p2p_merchants_pct_buy");
    expect(primero.z).toBe(Infinity);
    expect(primero.sigma).toBe(0);
  });

  it("quieta ayer y quieta hoy no es un evento", () => {
    const sesion = new Map([["p2p_merchants_pct_buy", serie(["0", "0"])]]);
    const hist = new Map([["p2p_merchants_pct_buy", historia(0, 0)]]);

    expect(movimientosDeSesion(sesion, hist)[0].z).toBe(0);
  });

  it("sin historia se queda FUERA, no al fondo con un cero", () => {
    /*
     * Un cero la haría parecer tranquila, que es una afirmación; la verdad es
     * que no hay con qué compararla.
     */
    const sesion = new Map([
      ["p2p_brecha_pct_buy", serie(["12", "20"])],
      ["indicador_nuevo", serie(["1", "9"])],
    ]);
    const hist = new Map([["p2p_brecha_pct_buy", historia(12, 0.5)]]);

    const orden = movimientosDeSesion(sesion, hist).map((m) => m.indicador);

    expect(orden).toEqual(["p2p_brecha_pct_buy"]);
  });

  it("dos series empatadas se ordenan igual en cada refresco", () => {
    /*
     * La vista se recompone cada 5 minutos: sin desempate determinista las
     * tarjetas bailarían solas al ritmo de cómo iteró el Map.
     */
    const sesion = new Map([
      ["z_ultima", serie(["10", "12"])],
      ["a_primera", serie(["10", "12"])],
    ]);
    const hist = new Map([
      ["z_ultima", historia(10, 1)],
      ["a_primera", historia(10, 1)],
    ]);

    expect(movimientosDeSesion(sesion, hist).map((m) => m.indicador)).toEqual([
      "a_primera",
      "z_ultima",
    ]);
  });

  it("conserva el valor EXACTO del contrato, no el float con el que ordena", () => {
    const sesion = new Map([
      ["p2p_vwap_buy", serie(["848.21230000", "854.03160000"])],
    ]);
    const hist = new Map([["p2p_vwap_buy", historia(850, 2)]]);

    const [movimiento] = movimientosDeSesion(sesion, hist);

    expect(movimiento.apertura).toBe("848.21230000");
    expect(movimiento.ultimo).toBe("854.03160000");
  });
});

describe("fueraDeRango", () => {
  it("cuenta las que se salieron de su variación normal", () => {
    const sesion = new Map([
      ["a", serie(["10", "16"])], // z = 6
      ["b", serie(["10", "10.5"])], // z = 0,5
    ]);
    const hist = new Map([
      ["a", historia(10, 1)],
      ["b", historia(10, 1)],
    ]);

    const movimientos = movimientosDeSesion(sesion, hist);

    expect(fueraDeRango(movimientos)).toBe(1);
    // Y sobre el resto —las que no son tarjeta— es lo que permite afirmar que
    // se mantuvieron dentro de su rango en vez de suponerlo.
    expect(fueraDeRango(movimientos.slice(1))).toBe(0);
  });
});

describe("sentidoDelMovimiento", () => {
  it("usa la MISMA convención que el dashboard: la brecha que se abre es adversa", () => {
    expect(sentidoDelMovimiento("p2p_brecha_pct_buy", "1.2")).toBe(true);
    expect(sentidoDelMovimiento("p2p_brecha_pct_buy", "-1.2")).toBe(false);
  });

  it("en liquidez lo adverso es lo contrario: caer", () => {
    expect(sentidoDelMovimiento("p2p_liquidez_sell", "-50000")).toBe(true);
    expect(sentidoDelMovimiento("p2p_liquidez_sell", "50000")).toBe(false);
  });

  it("sin lectura establecida no insinúa nada", () => {
    expect(sentidoDelMovimiento("p2p_momentum_bid_3h_pct", "0.4")).toBeNull();
    expect(sentidoDelMovimiento("p2p_mediana_buy", "3")).toBeNull();
  });

  it("sin movimiento no hay sentido que dar", () => {
    expect(sentidoDelMovimiento("p2p_brecha_pct_buy", "0")).toBeNull();
  });
});

describe("trazoSparkline", () => {
  it("escala con la propia serie: es un perfil, no una escala absoluta", () => {
    const trazo = trazoSparkline(serie(["10", "20"]), 160, 44);

    // Primer punto abajo, último arriba, dentro del viewBox.
    const [p1, p2] = trazo.split(" ").map((p) => p.split(",").map(Number));
    expect(p1[0]).toBe(0);
    expect(p2[0]).toBe(160);
    expect(p1[1]).toBeGreaterThan(p2[1]);
  });

  it("una serie plana no divide por cero", () => {
    expect(trazoSparkline(serie(["5", "5"]), 160, 44)).not.toContain("NaN");
  });

  it("sin puntos no dibuja", () => {
    expect(trazoSparkline([], 160, 44)).toBe("");
  });
  it("outliers NUNCA entra en el ranking, por mucho que se mueva", () => {
    /*
     * Mide la CALIDAD del snapshot, no el mercado: pasar de 0,5 % a 0 es el
     * filtro MAD/IQR trabajando, no una noticia cambiaria. Y como su sigma de 7
     * dias es diminuta, cualquier microcambio le daba una z enorme y le compraba
     * una de las cuatro tarjetas — se vio en vivo ocupando la primera.
     */
    const sesion = new Map([
      ["p2p_outliers_pct_sell", serie(["0.5", "0"])],
      ["p2p_mediana_sell", serie(["850", "852"])],
    ]);
    const hist = new Map([
      ["p2p_outliers_pct_sell", historia(0, 0.5)],
      ["p2p_mediana_sell", historia(850, 5)],
    ]);

    const indicadores = movimientosDeSesion(sesion, hist).map((m) => m.indicador);

    expect(indicadores).toEqual(["p2p_mediana_sell"]);
  });
});
