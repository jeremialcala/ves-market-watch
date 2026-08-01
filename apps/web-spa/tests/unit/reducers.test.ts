import { describe, expect, it } from "vitest";

import {
  aplicarPush,
  aplicarResync,
  ESTADO_INICIAL,
  type EstadoMercado,
} from "../../src/state/reducers";
import type {
  PayloadIndicadores,
  PayloadSenal,
  PayloadTasaOficial,
  PushEvento,
} from "../../src/ws/messages";
import {
  FIXTURE_ANALISIS,
  FIXTURE_ANALISIS_RESPALDO,
} from "../contract/fixtures.test";

let contador = 0;
function push(topic: PushEvento["topic"], data: unknown): PushEvento {
  contador += 1;
  return {
    topic,
    event_id: `evento-${contador}`,
    occurred_at: "2026-07-27T12:00:00Z",
    data,
  };
}

const TASA: PayloadTasaOficial = {
  source: "BCV",
  currency: "USD",
  rate: "417.03000000",
  value_date: "2026-07-27",
  captured_at: "2026-07-27T11:30:00Z",
  status: "valid",
};

function payloadIndicadores(
  filas: [string, string][],
  officialStale = false,
): PayloadIndicadores {
  return {
    as_of: "2026-07-27T12:00:00Z",
    calc_version: 1,
    official_stale: officialStale,
    triggered_by: "11111111-2222-3333-4444-555555555555",
    indicators: filas.map(([indicator, value]) => ({
      indicator,
      currency: "VES",
      value,
    })),
  };
}

const SENAL: PayloadSenal = {
  type: "correccion_inminente",
  direction: "bajista",
  currency: "VES",
  as_of: "2026-07-27T11:59:00Z",
  calc_version: 1,
  triggered_by: "11111111-2222-3333-4444-555555555555",
  evidence: { rule: "correccion_inminente@v1", inputs: { p2p_spread_pct: "-0.8" } },
};

describe("aplicarPush", () => {
  it("rates.official actualiza la tasa de su moneda y la marca fresca", () => {
    const estado = aplicarPush(ESTADO_INICIAL, push("rates.official", TASA));
    expect(estado.tasas.USD.rate).toBe("417.03000000");
    expect(estado.tasas.USD.stale).toBe(false);
  });

  it("es idempotente ante reentrega del mismo event_id", () => {
    const evento = push("signals", SENAL);
    const una = aplicarPush(ESTADO_INICIAL, evento);
    const dos = aplicarPush(una, evento);
    expect(dos.senales).toHaveLength(1);
    expect(dos).toBe(una); // sin cambio: misma referencia
  });

  it("indicators deriva la referencia P2P del lado con confianza", () => {
    const estado = aplicarPush(
      ESTADO_INICIAL,
      push(
        "indicators",
        payloadIndicadores([
          ["p2p_mejor_precio_buy", "850.00000000"],
          ["p2p_mediana_buy", "853.10000000"],
          ["p2p_vwap_buy", "852.40000000"],
          ["p2p_liquidez_buy", "125000.00000000"],
          ["p2p_outliers_pct_buy", "35.00000000"],
        ]),
      ),
    );
    expect(estado.p2p.buy?.median).toBe("853.10000000");
    expect(estado.p2p.buy?.confidence).toBe("low"); // > 30 % outliers
    expect(estado.p2p.sell).toBeUndefined(); // el otro lado no se inventa
  });

  it("indicators arma la vista de brecha con lo vigente acumulado", () => {
    let estado: EstadoMercado = aplicarPush(
      ESTADO_INICIAL,
      push(
        "indicators",
        payloadIndicadores([["p2p_liquidez_sell", "98000.00000000"]]),
      ),
    );
    estado = aplicarPush(
      estado,
      push(
        "indicators",
        payloadIndicadores([
          ["p2p_brecha_abs_buy", "433.00000000"],
          ["p2p_brecha_pct_buy", "103.83000000"],
          ["p2p_spread_pct", "-0.35000000"],
          ["p2p_liquidez_buy", "125000.00000000"],
        ]),
      ),
    );
    expect(estado.indicadores?.gap_abs).toBe("433.00000000");
    expect(estado.indicadores?.spread_pct).toBe("-0.35000000");
    // volumes cruza lados: usa la liquidez sell del push anterior (vigentes)
    expect(estado.indicadores?.volumes).toEqual({
      buy: "125000.00000000",
      sell: "98000.00000000",
    });
  });

  it("signals antepone la señal con emitted_at del sobre y respeta el tope", () => {
    let estado: EstadoMercado = ESTADO_INICIAL;
    for (let i = 0; i < 55; i += 1) {
      estado = aplicarPush(estado, push("signals", SENAL));
    }
    expect(estado.senales).toHaveLength(50);
    expect(estado.senales[0].emitted_at).toBe("2026-07-27T12:00:00Z");
  });

  it("p2p.snapshot solo registra el evento (la profundidad va por REST)", () => {
    const estado = aplicarPush(ESTADO_INICIAL, push("p2p.snapshot", {}));
    expect(estado.profundidad).toEqual({});
    expect(estado.eventosVistos).toHaveLength(1);
  });
});

describe("aplicarPush · analysis", () => {
  it("REEMPLAZA el análisis completo, no lo mezcla con el anterior", () => {
    const primero = aplicarPush(
      ESTADO_INICIAL,
      push("analysis", FIXTURE_ANALISIS),
    );
    expect(primero.analisis?.indicators).toHaveLength(2);

    // La revisión siguiente reevalúa TODO: un indicador que desaparece del
    // array es uno que dejó de estar vigente, y su barra debe irse con él.
    const segundo = aplicarPush(
      primero,
      push("analysis", FIXTURE_ANALISIS_RESPALDO),
    );
    expect(segundo.analisis?.indicators.map((i) => i.indicator)).toEqual([
      "p2p_brecha_pct_buy",
      "p2p_ratio_oferta_demanda",
    ]);
    expect(segundo.analisis?.summary.closest_rule).toBeNull();
  });

  it("la reentrega del mismo evento no cambia el estado (idempotencia)", () => {
    const evento = push("analysis", FIXTURE_ANALISIS);
    const uno = aplicarPush(ESTADO_INICIAL, evento);
    expect(aplicarPush(uno, evento)).toBe(uno);
  });
});

describe("aplicarResync", () => {
  it("el resync REST es autoritativo también para el análisis", () => {
    const conPush = aplicarPush(
      ESTADO_INICIAL,
      push("analysis", FIXTURE_ANALISIS),
    );
    // 404 del gateway (sin análisis vigente) borra el que quedó del push: el
    // panel prefiere decir «sin lectura» antes que enseñar una rancia.
    expect(aplicarResync(conPush, { analisis: null }).analisis).toBeNull();
  });

  it("sobrescribe solo las vistas presentes en el snapshot", () => {
    const conSenal = aplicarPush(ESTADO_INICIAL, push("signals", SENAL));
    const resync = aplicarResync(conSenal, {
      tasas: {
        USD: {
          currency: "USD",
          rate: "418.00000000",
          value_date: "2026-07-27",
          captured_at: "2026-07-27T12:00:00Z",
          stale: false,
        },
      },
      indicadores: null,
    });
    expect(resync.tasas.USD.rate).toBe("418.00000000");
    expect(resync.indicadores).toBeNull();
    expect(resync.senales).toHaveLength(1); // no vino en el snapshot: intacta
  });
});
