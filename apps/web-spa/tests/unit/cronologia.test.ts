/**
 * Los eventos de la «Cronología de la sesión».
 *
 * La sección solo vale si cada línea se puede señalar en una serie. Lo que se
 * fija aquí es que ninguna se invente y que las ausencias quiten SUS eventos, no
 * la cronología entera.
 */

import { describe, expect, it } from "vitest";

import {
  CRUCES_PARA_RESUMIR,
  eventosDeSesion,
  SIGMAS_SALTO,
} from "../../src/lib/cronologia";
import type { PuntoIntradia } from "../../src/lib/intradia";
import { MUESTRAS_MINIMAS_SIGMA } from "../../src/lib/movimiento";

const T0 = Date.parse("2026-08-06T04:00:00Z"); // 00:00 VET
const PASO = 3_600_000; // 1 h
const PASO_FINO = 300_000; // 5 min

function serie(valores: string[], desde = T0): PuntoIntradia[] {
  return valores.map((valor, i) => ({ t: desde + i * PASO, valor }));
}

/** La misma serie con el bucket de 5 min de la vista. */
function serieFina(valores: string[], desde = T0): PuntoIntradia[] {
  return valores.map((valor, i) => ({ t: desde + i * PASO_FINO, valor }));
}

/** Referencia con saltos de ±`salto`: σ de los saltos sale `salto`. */
function referenciaConSaltos(base: number, salto: number): PuntoIntradia[] {
  const valores: string[] = [];
  for (let i = 0; i < MUESTRAS_MINIMAS_SIGMA + 1; i += 1) {
    valores.push(String(base + (i % 2 === 0 ? 0 : salto)));
  }
  return serie(valores);
}

const ANALISIS = {
  as_of: new Date(T0 + 3 * PASO).toISOString(),
  rule_proximity: [
    {
      rule: 'arranque_alcista@v1',
      conditions: [
        { indicator: "p2p_momentum_bid_3h_pct", op: "gt" as const, threshold: "0.5" },
      ],
    },
  ],
};

describe("eventosDeSesion", () => {
  it("la apertura es el primer bucket del día, sea de la serie que sea", () => {
    const sesion = new Map([
      ["a", serie(["1", "2"], T0 + PASO)],
      ["b", serie(["1", "2"], T0)], // esta empieza antes
    ]);

    const [primero] = eventosDeSesion(sesion, new Map(), null);

    expect(primero.clase).toBe("apertura");
    expect(primero.t).toBe(T0);
  });

  it("sin ninguna serie no hay cronología que contar", () => {
    expect(eventosDeSesion(new Map(), new Map(), ANALISIS)).toEqual([]);
  });

  it("marca el cruce de umbral en el bucket en que cambia de estado", () => {
    const sesion = new Map([
      ["p2p_momentum_bid_3h_pct", serie(["0.2", "0.4", "0.7", "0.9"])],
    ]);

    const cruces = eventosDeSesion(sesion, new Map(), ANALISIS).filter(
      (e) => e.clase === "umbral",
    );

    // Cruza entre 0,4 y 0,7 — un solo evento, en el bucket del 0,7.
    expect(cruces).toHaveLength(1);
    expect(cruces[0].t).toBe(T0 + 2 * PASO);
    expect(cruces[0].cumple).toBe(true);
    expect(cruces[0].valor).toBe("0.7");
    expect(cruces[0].umbral).toBe("0.5");
  });

  it("dejar de cumplir también es un cruce", () => {
    const sesion = new Map([
      // El estado nuevo tiene que AGUANTAR: con el cruce en el último punto no
      // se puede afirmar todavía (ver la prueba de la cola).
      ["p2p_momentum_bid_3h_pct", serie(["0.9", "0.7", "0.2", "0.1", "0.1"])],
    ]);

    const cruces = eventosDeSesion(sesion, new Map(), ANALISIS).filter(
      (e) => e.clase === "umbral",
    );

    expect(cruces).toHaveLength(1);
    expect(cruces[0].cumple).toBe(false);
  });

  it("una serie que nunca cruza no genera eventos", () => {
    const sesion = new Map([
      ["p2p_momentum_bid_3h_pct", serie(["0.1", "0.2", "0.3"])],
    ]);

    expect(
      eventosDeSesion(sesion, new Map(), ANALISIS).filter(
        (e) => e.clase === "umbral",
      ),
    ).toEqual([]);
  });

  it("la misma condición en dos reglas se evalúa UNA vez", () => {
    /*
     * `rule_proximity` trae una entrada por regla y varias comparten condición:
     * sin deduplicar, un solo cruce aparecía tres veces en la cronología.
     */
    const analisis = {
      ...ANALISIS,
      rule_proximity: [ANALISIS.rule_proximity[0], ANALISIS.rule_proximity[0]],
    };
    const sesion = new Map([
      ["p2p_momentum_bid_3h_pct", serie(["0.2", "0.7", "0.8", "0.9"])],
    ]);

    expect(
      eventosDeSesion(sesion, new Map(), analisis).filter(
        (e) => e.clase === "umbral",
      ),
    ).toHaveLength(1);
  });

  it("un salto de liquidez entra solo si supera 2σ de los saltos habituales", () => {
    /*
     * σ se mide sobre los SALTOS, no sobre los valores: lo que se afirma es que
     * este movimiento es grande para lo que esa serie se mueve normalmente, no
     * que el nivel sea alto.
     */
    const sesion = new Map([
      ["p2p_liquidez_sell", serie(["1000000", "1010000", "1500000"])],
    ]);
    const referencia = new Map([
      ["p2p_liquidez_sell", referenciaConSaltos(1_000_000, 100_000)],
    ]);

    const saltos = eventosDeSesion(sesion, referencia, null).filter(
      (e) => e.clase === "liquidez",
    );

    // +10 000 no llega a 2σ; +490 000 sí.
    expect(saltos).toHaveLength(1);
    expect(saltos[0].delta).toBe("490000");
    expect(saltos[0].sigmas).toBeGreaterThan(SIGMAS_SALTO);
  });

  it("sin ventana de referencia no se afirma que un salto sea grande", () => {
    const sesion = new Map([
      ["p2p_liquidez_sell", serie(["1000000", "9000000"])],
    ]);

    expect(
      eventosDeSesion(sesion, new Map(), null).filter(
        (e) => e.clase === "liquidez",
      ),
    ).toEqual([]);
  });

  it("el recálculo es el as_of del análisis, y solo si cae en la sesión", () => {
    const sesion = new Map([["a", serie(["1", "2", "3", "4"])]]);

    const dentro = eventosDeSesion(sesion, new Map(), ANALISIS).filter(
      (e) => e.clase === "recalculo",
    );
    expect(dentro).toHaveLength(1);
    expect(dentro[0].t).toBe(Date.parse(ANALISIS.as_of));

    // Un análisis anterior a la apertura es de la sesión de ayer.
    const viejo = { ...ANALISIS, as_of: new Date(T0 - PASO).toISOString() };
    expect(
      eventosDeSesion(sesion, new Map(), viejo).filter(
        (e) => e.clase === "recalculo",
      ),
    ).toEqual([]);
  });

  it("sin análisis quedan los eventos que no dependen de él", () => {
    /*
     * Una ausencia quita SUS eventos, no la cronología: sin análisis no hay
     * umbrales ni recálculo, pero la apertura y los saltos siguen siendo hechos.
     */
    const sesion = new Map([
      ["p2p_liquidez_sell", serie(["1000000", "1500000"])],
    ]);
    const referencia = new Map([
      ["p2p_liquidez_sell", referenciaConSaltos(1_000_000, 100_000)],
    ]);

    const clases = eventosDeSesion(sesion, referencia, null).map((e) => e.clase);

    expect(clases).toEqual(["apertura", "liquidez"]);
  });

  it("dos eventos en el mismo bucket no cambian de orden entre refrescos", () => {
    const sesion = new Map([
      ["p2p_liquidez_buy", serie(["1000000", "1500000"])],
      ["p2p_liquidez_sell", serie(["1000000", "1500000"])],
    ]);
    const referencia = new Map([
      ["p2p_liquidez_buy", referenciaConSaltos(1_000_000, 100_000)],
      ["p2p_liquidez_sell", referenciaConSaltos(1_000_000, 100_000)],
    ]);

    const orden = () =>
      eventosDeSesion(sesion, referencia, null)
        .filter((e) => e.clase === "liquidez")
        .map((e) => e.indicador);

    expect(orden()).toEqual(["p2p_liquidez_buy", "p2p_liquidez_sell"]);
    expect(orden()).toEqual(orden());
  });

  it("un temblor junto al umbral NO es un evento", () => {
    /*
     * El defecto que motivó la histéresis: `p2p_ratio_oferta_demanda` oscilando
     * alrededor de 0,3 generaba 23 líneas en una sola sesión, y la cronología
     * llegaba a 50 entradas de las que 48 eran cuatro indicadores temblando.
     * Aquí el valor cruza cuatro veces y ninguna se sostiene.
     */
    const sesion = new Map([
      [
        "p2p_momentum_bid_3h_pct",
        serieFina(["0.4", "0.6", "0.4", "0.6", "0.4", "0.4", "0.4", "0.4"]),
      ],
    ]);

    expect(
      eventosDeSesion(sesion, new Map(), ANALISIS).filter(
        (e) => e.clase === "umbral",
      ),
    ).toEqual([]);
  });

  it("un cruce que se sostiene SÍ es un evento, con la hora del cruce", () => {
    /*
     * El instante es el del cruce, no el de su confirmación: lo que se señala es
     * cuándo pasó, no cuándo se pudo asegurar.
     */
    const sesion = new Map([
      [
        "p2p_momentum_bid_3h_pct",
        serieFina(["0.4", "0.4", "0.7", "0.8", "0.9", "0.9", "0.9"]),
      ],
    ]);

    const cruces = eventosDeSesion(sesion, new Map(), ANALISIS).filter(
      (e) => e.clase === "umbral",
    );

    expect(cruces).toHaveLength(1);
    expect(cruces[0].t).toBe(T0 + 2 * PASO_FINO);
    expect(cruces[0].valor).toBe("0.7");
  });

  it("un cruce recién ocurrido espera al refresco siguiente", () => {
    /*
     * Sin plazo cumplido no se puede decir que aguantó. Un evento que se pinta y
     * desaparece en el refresco siguiente es peor que uno que llega tarde.
     */
    const sesion = new Map([
      ["p2p_momentum_bid_3h_pct", serieFina(["0.4", "0.4", "0.7"])],
    ]);

    expect(
      eventosDeSesion(sesion, new Map(), ANALISIS).filter(
        (e) => e.clase === "umbral",
      ),
    ).toEqual([]);
  });

  it("la permanencia se mide en TIEMPO, no en número de buckets", () => {
    /*
     * Los mismos tres valores: a 5 min no llegan a los 15 que hacen falta; a 1 h
     * los superan de sobra. Contar buckets habría dado la misma respuesta a dos
     * situaciones distintas.
     */
    const valores = ["0.4", "0.4", "0.7", "0.7"];
    const fina = new Map([["p2p_momentum_bid_3h_pct", serieFina(valores)]]);
    const gruesa = new Map([["p2p_momentum_bid_3h_pct", serie(valores)]]);

    const cruces = (m: Map<string, PuntoIntradia[]>) =>
      eventosDeSesion(m, new Map(), ANALISIS).filter((e) => e.clase === "umbral");

    expect(cruces(fina)).toEqual([]);
    expect(cruces(gruesa)).toHaveLength(1);
  });

  it("los eventos salen en orden cronológico", () => {
    const sesion = new Map([
      ["p2p_momentum_bid_3h_pct", serie(["0.2", "0.7", "0.7", "0.2", "0.2", "0.9", "0.9"])],
    ]);

    const tiempos = eventosDeSesion(sesion, new Map(), ANALISIS).map((e) => e.t);

    expect(tiempos).toEqual([...tiempos].sort((a, b) => a - b));
  });
  it("una condicion que oscila mucho se RESUME en una linea", () => {
    /*
     * Medido sobre tres sesiones reales: con la histeresis quedaban 37/30/29
     * cruces, repartidos en cinco condiciones que entraban y salian. Ninguno era
     * falso —todos aguantaron sus 15 minutos— pero una condicion que cruza once
     * veces no cuenta once historias: cuenta una, y es que hoy esta inestable.
     */
    const sesion = new Map([
      [
        "p2p_momentum_bid_3h_pct",
        // Cuatro cruces sostenidos: 0,4 -> 0,7 -> 0,4 -> 0,7 -> 0,4, con cada
        // tramo lo bastante largo para confirmarse.
        serie([
          "0.4", "0.4", "0.7", "0.7", "0.7",
          "0.4", "0.4", "0.4", "0.7", "0.7",
          "0.7", "0.4", "0.4", "0.4",
        ]),
      ],
    ]);

    const umbrales = eventosDeSesion(sesion, new Map(), ANALISIS).filter(
      (e) => e.clase === "umbral",
    );

    expect(umbrales).toHaveLength(1);
    expect(umbrales[0].repeticiones).toBeGreaterThan(CRUCES_PARA_RESUMIR);
  });

  it("el resumen NO esconde: dice cuantas veces y desde cuando", () => {
    const sesion = new Map([
      [
        "p2p_momentum_bid_3h_pct",
        serie([
          "0.4", "0.4", "0.7", "0.7", "0.7",
          "0.4", "0.4", "0.4", "0.7", "0.7",
          "0.7", "0.4", "0.4", "0.4",
        ]),
      ],
    ]);

    const [resumen] = eventosDeSesion(sesion, new Map(), ANALISIS).filter(
      (e) => e.clase === "umbral",
    );

    // La cuenta va escrita y el tramo tambien: se puede reconstruir que paso.
    expect(resumen.repeticiones).toBe(4);
    expect(resumen.desde).toBeLessThan(resumen.t);
    // Y el estado que reporta es el ULTIMO, no el primero.
    expect(resumen.cumple).toBe(false);
  });

  it("el resumen se coloca en el ULTIMO cruce, no en el primero", () => {
    /*
     * La cronologia sigue siendo cronologica: el instante del evento es cuando
     * empezo el estado actual. El primero va en `desde`.
     */
    const sesion = new Map([
      [
        "p2p_momentum_bid_3h_pct",
        serie([
          "0.4", "0.4", "0.7", "0.7", "0.7",
          "0.4", "0.4", "0.4", "0.7", "0.7",
          "0.7", "0.4", "0.4", "0.4",
        ]),
      ],
    ]);

    const [resumen] = eventosDeSesion(sesion, new Map(), ANALISIS).filter(
      (e) => e.clase === "umbral",
    );

    expect(resumen.t).toBe(T0 + 11 * PASO);
    expect(resumen.desde).toBe(T0 + 2 * PASO);
  });

  it("pocos cruces siguen contandose uno a uno", () => {
    /*
     * Dos cruces son entrar y salir: todavia una historia, y merecen su linea.
     * Resumir a partir de uno habria escondido el caso mas comun.
     */
    const sesion = new Map([
      [
        "p2p_momentum_bid_3h_pct",
        serie(["0.4", "0.4", "0.7", "0.7", "0.7", "0.4", "0.4", "0.4"]),
      ],
    ]);

    const umbrales = eventosDeSesion(sesion, new Map(), ANALISIS).filter(
      (e) => e.clase === "umbral",
    );

    expect(umbrales).toHaveLength(2);
    expect(umbrales.every((e) => e.repeticiones === undefined)).toBe(true);
  });
});
