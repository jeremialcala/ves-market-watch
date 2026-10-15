/**
 * Un snapshot con la forma del contrato y valores de la base real de midgard
 * (2026-10-15 00:08 UTC), recortado a lo que pintan los paneles.
 */

import type { Series, Snapshot } from "../src/api/cliente";

export const AHORA = Date.parse("2026-10-15T00:10:00Z");
const hace = (s: number) => new Date(AHORA - s * 1000).toISOString();

function escala(p10: string, p50: string, p90: string) {
  return {
    source: "percentiles" as const,
    window_days: 90,
    domain: { min: "-2", max: "4" },
    cuts: [
      { key: "p10", value: p10, position: "0.1000" },
      { key: "p50", value: p50, position: "0.5000" },
      { key: "p90", value: p90, position: "0.9000" },
    ],
  };
}

export function snapshot(): Snapshot {
  return {
    as_of: hace(20),
    generated_at: hace(1),
    calc_version: 1,
    ruleset_version: 1,
    official_stale: false,
    gap: { side: "buy", pct: "15.34228734", abs: "134.95000000", spread_pct: "0.49554013", as_of: hace(20) },
    official_rates: [
      { currency: "USD", rate: "879.25310000", value_date: "2026-10-15", captured_at: hace(3 * 3600), stale: false },
      { currency: "EUR", rate: "1021.88000000", value_date: "2026-10-15", captured_at: hace(3 * 3600), stale: false },
    ],
    p2p: {
      buy: {
        best_price: "1010.00000000",
        best_price_filtered: "1010.00000000",
        median: "1013.00000000",
        vwap: "1014.20480201",
        volume: "90000.00000000",
        as_of: hace(20),
        confidence: "normal",
        outliers_pct: "0.00000000",
        merchants_pct: "34.00000000",
      },
      // El caso del 2026-10-15: un outlier a 1.055 encabeza SELL.
      sell: {
        best_price: "1055.00000000",
        best_price_filtered: "1012.00000000",
        median: "1004.26000000",
        vwap: "1005.57000000",
        volume: "2124644.00000000",
        as_of: hace(20),
        confidence: "normal",
        outliers_pct: "0.50000000",
        merchants_pct: "41.00000000",
      },
    },
    analysis: {
      as_of: hace(80),
      confidence: "normal",
      official_stale: false,
      reading: {
        regime: "lateral_estable",
        axis_movement: "lateral",
        axis_gap: "estable",
        window_hours: 6,
        gauges_near_threshold: 1,
        claims: [
          { code: "brecha", data: { direccion: "estable", delta_pp: "0.05687490", horas: "6" } },
          { code: "atribucion", data: { responsable: "oficial", paralelo: "0.02", oficial: "1.22" } },
          {
            code: "brecha_vs_historia",
            data: { lado: "buy", dias: "30", referencia: "media", posicion: "por_encima", delta_pp: "1.82238517" },
          },
          { code: "regla_cerca", data: { regla: "arranque_alcista@v1", cumplidas: "2", totales: "3" } },
          { code: "codigo_del_futuro", data: {} },
        ],
      },
      summary: {
        rules_total: 3,
        rules_evaluable: 3,
        closest_rule: "arranque_alcista@v1",
        conditions_met: 2,
        conditions_total: 3,
        blocked_by: "p2p_momentum_bid_3h_pct",
      },
      indicators: [
        {
          indicator: "p2p_spread_pct",
          value: "0.4955401387512388503468780971",
          as_of: hace(80),
          band: "very_low",
          position: "0.0986",
          scale: escala("0.50166193", "0.68108461", "1.59410031"),
          rules: [
            {
              rule: "techo_inminente@v1",
              type: "techo_inminente",
              direction: "bajista",
              op: "lt",
              threshold: "0.5",
              met: true,
              distance: "-0.0044598612487611496531219029",
              threshold_position: "0.0996",
            },
          ],
        },
        {
          indicator: "p2p_ratio_oferta_demanda",
          value: "0.1689796910079802841408715630",
          as_of: hace(80),
          band: "very_low",
          position: "0.0747",
          scale: escala("0.21934255", "0.63728885", "1.83457014"),
          rules: [
            {
              rule: "correccion_inminente@v1",
              type: "correccion_inminente",
              direction: "bajista",
              op: "gt",
              threshold: "2",
              met: false,
              distance: "1.831020308992019715859128437",
              threshold_position: "0.9010",
            },
            {
              rule: "arranque_alcista@v1",
              type: "arranque_alcista",
              direction: "alcista",
              op: "lt",
              threshold: "0.3",
              met: true,
              distance: "-0.1310203089920197158591284370",
              threshold_position: "0.1772",
            },
          ],
        },
        {
          indicator: "p2p_momentum_bid_3h_pct",
          value: "-0.03566616469842276293889197115",
          as_of: hace(80),
          band: "low",
          position: "0.4686",
          scale: escala("-0.45677255", "0.00015567", "0.56051419"),
          rules: [
            {
              rule: "techo_inminente@v1",
              type: "techo_inminente",
              direction: "bajista",
              op: "gt",
              threshold: "1.5",
              met: false,
              distance: "1.535666164698422762938891971",
              threshold_position: "0.9713",
            },
            {
              rule: "arranque_alcista@v1",
              type: "arranque_alcista",
              direction: "alcista",
              op: "gt",
              threshold: "0.5",
              met: false,
              distance: "0.5356661646984227629388919712",
              threshold_position: "0.8568",
            },
          ],
        },
        {
          indicator: "p2p_brecha_pct_buy",
          value: "15.34228734",
          as_of: hace(80),
          band: "high",
          position: "0.5553",
          scale: escala("12.25086495", "14.77707706", "18.86302657"),
          rules: [],
        },
        {
          indicator: "p2p_drenaje_oferta_6h_pct",
          value: "-47.80790166",
          as_of: hace(80),
          band: "very_low",
          position: "0.0612",
          scale: escala("-68.90194594", "6.60789920", "201.10198704"),
          rules: [
            {
              rule: "arranque_alcista@v1",
              type: "arranque_alcista",
              direction: "alcista",
              op: "lt",
              threshold: "-40",
              met: true,
              distance: "-7.80790166",
              threshold_position: "0.2531",
            },
          ],
        },
        {
          indicator: "p2p_outliers_pct_buy",
          value: "0.00000000",
          as_of: hace(80),
          band: "unscaled",
          position: "0.0000",
          scale: {
            source: "ruleset" as const,
            window_days: 90,
            domain: { min: "0", max: "100" },
            cuts: [{ key: "confianza_baja", value: "30", position: "0.3000" }],
          },
          rules: [],
        },
      ],
      rule_proximity: [
        {
          rule: "arranque_alcista@v1",
          type: "arranque_alcista",
          direction: "alcista",
          conditions_total: 3,
          conditions_met: 2,
          evaluable: true,
          blocked_by: "p2p_momentum_bid_3h_pct",
          conditions: [
            {
              indicator: "p2p_momentum_bid_3h_pct",
              op: "gt",
              threshold: "0.5",
              value: "-0.03566616469842276293889197115",
              met: false,
              distance: "0.5356661646984227629388919712",
            },
            {
              indicator: "p2p_drenaje_oferta_6h_pct",
              op: "lt",
              threshold: "-40",
              value: "-47.80790166",
              met: true,
              distance: "-7.80790166",
            },
            {
              indicator: "p2p_ratio_oferta_demanda",
              op: "lt",
              threshold: "0.3",
              value: "0.1689796910079802841408715630",
              met: true,
              distance: "-0.1310203089920197158591284370",
            },
          ],
        },
      ],
      gap_history: {
        sides: [
          {
            side: "buy",
            current: "15.34228734",
            references: [
              { days_configured: 7, days_covered: 7, mean: "15.87388454", max: "17.17873392", min: "14.31501495" },
              { days_configured: 30, days_covered: 30, mean: "13.51990217", max: "17.17873392", min: "11.01350949" },
              { days_configured: 90, days_covered: 87, mean: "15.43992720", max: "22.63737979", min: "11.01350949" },
            ],
          },
          {
            side: "sell",
            current: "14.10429150",
            references: [
              { days_configured: 7, days_covered: 7, mean: "14.94778211", max: "16.24707725", min: "13.71134945" },
            ],
          },
        ],
      },
      gap_legs: {
        hours: 6,
        official: "1.22020000",
        parallel: "0.02000000",
        responsible: "oficial",
        official_share: "0.9838735687792291565876471537",
      },
    },
    depth: {
      buy: {
        as_of: hace(20),
        levels: [
          { price_band: "1014.0450", cum_volume: "383902.84" },
          { price_band: "1019.0900", cum_volume: "626730.61" },
        ],
      },
      sell: {
        as_of: hace(20),
        levels: [
          { price_band: "1004.9500", cum_volume: "1203471.65" },
          { price_band: "999.9000", cum_volume: "2499304.83" },
        ],
      },
    },
    signals: {
      window_days: 30,
      items: [
        {
          type: "arranque_alcista",
          direction: "alcista",
          as_of: hace(40 * 3600),
          emitted_at: hace(40 * 3600),
          outcome: { hours: 12, gap_delta_pp: "-0.14541067" },
        },
        {
          type: "techo_inminente",
          direction: "bajista",
          as_of: hace(3 * 3600),
          emitted_at: hace(3 * 3600),
          outcome: null,
        },
        {
          type: "arranque_alcista",
          direction: "alcista",
          as_of: hace(10 * 3600),
          emitted_at: hace(10 * 3600),
          outcome: { hours: 12, gap_delta_pp: "0.48000000" },
        },
      ],
    },
  };
}

export function series(): Series {
  const punto = (h: number, v: string) => ({ t: hace(h * 3600), value: v });
  const serie = (puntos: { t: string; value: string }[]) => ({
    indicator: "p2p_brecha_pct_buy",
    interval: "1h" as const,
    days: 1,
    points: puntos,
  });
  return {
    generated_at: hace(1),
    series: {
      gap_buy_24h: serie([punto(3, "15.10"), punto(2, "15.60"), punto(1, "15.34")]),
      gap_sell_14d: {
        indicator: "p2p_brecha_pct_sell",
        interval: "1h" as const,
        days: 14,
        // Tres horas de dos días VET: 13-oct 22:00, 14-oct 19:00 y 20:00.
        points: [
          { t: "2026-10-14T02:00:00Z", value: "12.00" },
          { t: "2026-10-14T23:00:00Z", value: "14.00" },
          { t: "2026-10-15T00:00:00Z", value: "18.00" },
        ],
      },
      gap_buy_30d: serie([]),
    },
  };
}
