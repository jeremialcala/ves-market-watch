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
        median: "1013.00000000",
        vwap: "1014.20480201",
        volume: "90000.00000000",
        as_of: hace(20),
        confidence: "normal",
        outliers_pct: "0.00000000",
        merchants_pct: "34.00000000",
      },
      sell: null,
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
        gauges_near_threshold: 0,
        claims: [],
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
    depth: { buy: null, sell: null },
    signals: { window_days: 30, items: [] },
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
      gap_sell_14d: serie([]),
      gap_buy_30d: serie([]),
    },
  };
}
