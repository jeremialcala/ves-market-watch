/** Contrato en compilación: los fixtures del front se declaran `satisfies`
 * contra los tipos GENERADOS del openapi.yaml — si el contrato cambia y los
 * fixtures dejan de encajar, esta suite no compila. La frescura de
 * types.gen.ts vs el YAML la verifica `npm run check:api-types` (enganchado a
 * `npm test`). */

import { describe, expect, it } from "vitest";

import type { components } from "../../src/api/types.gen";
import type { PayloadAnalisis } from "../../src/ws/messages";

type Schemas = components["schemas"];

export const FIXTURE_TASA = {
  currency: "USD",
  rate: "417.03000000",
  value_date: "2026-07-27",
  captured_at: "2026-07-27T11:30:00Z",
  stale: false,
} satisfies Schemas["OfficialRateCurrent"];

export const FIXTURE_P2P_LOW = {
  side: "buy",
  best_price: "850.00000000",
  median: "853.10000000",
  vwap: "852.40000000",
  volume: "125000.00000000",
  as_of: "2026-07-27T12:00:00Z",
  confidence: "low",
} satisfies Schemas["P2PQuote"];

export const FIXTURE_INDICADORES = {
  currency: "USD",
  as_of: "2026-07-27T12:00:00Z",
  calc_version: 1,
  official_stale: false,
  gap_abs: "433.00000000",
  gap_pct: "103.83000000",
  spread_pct: "-0.35000000",
  volumes: { buy: "125000.00000000", sell: "98000.00000000" },
} satisfies Schemas["Indicators"];

export const FIXTURE_INDICADORES_NULOS = {
  currency: "EUR",
  as_of: "2026-07-27T12:00:00Z",
  calc_version: 1,
  official_stale: true,
  gap_abs: null,
  gap_pct: null,
  spread_pct: null,
  volumes: null,
} satisfies Schemas["Indicators"];

export const FIXTURE_SENAL = {
  type: "correccion_inminente",
  direction: "bajista",
  currency: "VES",
  as_of: "2026-07-27T11:59:00Z",
  emitted_at: "2026-07-27T12:00:00Z",
  calc_version: 1,
  triggered_by: "11111111-2222-3333-4444-555555555555",
  evidence: {
    rule: "correccion_inminente@v1",
    inputs: { p2p_ratio_oferta_demanda: "2.4", p2p_momentum_bid_3h_pct: "-1.2" },
  },
} satisfies Schemas["Signal"];

export const FIXTURE_PROFUNDIDAD = {
  side: "buy",
  as_of: "2026-07-27T12:00:00Z",
  levels: [
    { price_band: "854.2", cum_volume: "50000" },
    { price_band: "858.5", cum_volume: "120000" },
  ],
} satisfies Schemas["MarketDepth"];

/**
 * Análisis en régimen de percentiles.
 *
 * DOBLE `satisfies` a propósito: contra el tipo GENERADO del openapi (lo que
 * sirve el REST) y contra `PayloadAnalisis`, escrito a mano para el push WSS.
 * Si los dos divergen, esta suite no compila — que es justo el canario que
 * hace falta cuando un mismo documento llega por dos caminos.
 */
export const FIXTURE_ANALISIS = {
  as_of: "2026-07-27T12:00:00Z",
  currency: "VES",
  calc_version: 1,
  analysis_version: 1,
  ruleset_version: 1,
  confidence: "normal",
  official_stale: false,
  triggered_by: "11111111-2222-3333-4444-555555555555",
  indicators: [
    {
      indicator: "p2p_brecha_pct_buy",
      value: "13.22",
      as_of: "2026-07-27T12:00:00Z",
      band: "low",
      position: "0.2996",
      scale: {
        source: "percentiles",
        window_days: 90,
        samples: 4187,
        min_samples: 200,
        computed_at: "2026-07-27T11:45:00Z",
        domain: { min: "8.41", max: "31.07" },
        cuts: [
          { key: "p10", value: "10.55", position: "0.1000" },
          { key: "p50", value: "15.90", position: "0.5000" },
          { key: "p90", value: "24.18", position: "0.9000" },
        ],
      },
      rules: [],
    },
    {
      indicator: "p2p_spread_pct",
      value: "0.56",
      as_of: "2026-07-27T12:00:00Z",
      band: "low",
      position: "0.1129",
      scale: {
        source: "percentiles",
        window_days: 90,
        samples: 4102,
        min_samples: 200,
        computed_at: "2026-07-27T11:45:00Z",
        domain: { min: "-0.12", max: "4.85" },
        cuts: [
          { key: "p10", value: "0.55", position: "0.1000" },
          { key: "p50", value: "0.86", position: "0.5000" },
          { key: "p90", value: "2.13", position: "0.9000" },
        ],
      },
      rules: [
        {
          rule: "techo_inminente@v1",
          type: "techo_inminente",
          direction: "bajista",
          op: "lt",
          threshold: "0.5",
          met: false,
          distance: "0.06",
          threshold_position: "0.0925",
        },
      ],
    },
  ],
  rule_proximity: [
    {
      rule: "techo_inminente@v1",
      type: "techo_inminente",
      direction: "bajista",
      conditions_total: 3,
      conditions_met: 1,
      evaluable: true,
      blocked_by: "p2p_momentum_bid_3h_pct",
      conditions: [
        {
          indicator: "p2p_momentum_bid_3h_pct",
          op: "gt",
          threshold: "1.5",
          value: "0.30",
          met: false,
          distance: "1.20",
        },
        {
          indicator: "p2p_spread_pct",
          op: "lt",
          threshold: "0.5",
          value: "0.56",
          met: false,
          distance: "0.06",
        },
        {
          indicator: "p2p_ratio_oferta_demanda",
          op: "lt",
          threshold: "0.2",
          value: "0.15",
          met: true,
          distance: "-0.05",
        },
      ],
    },
  ],
  summary: {
    rules_total: 3,
    rules_evaluable: 1,
    closest_rule: "techo_inminente@v1",
    conditions_met: 1,
    conditions_total: 3,
    blocked_by: "p2p_momentum_bid_3h_pct",
    rules_met: [],
  },
} satisfies Schemas["IndicatorAnalysis"] satisfies PayloadAnalisis;

/**
 * Análisis en respaldo del ruleset (arranque en frío): banda `unscaled`,
 * cortes de umbral en vez de percentiles, y el contador de muestras a la vista.
 * La brecha no alimenta ninguna regla ⇒ sin cortes ⇒ `position: null`.
 */
export const FIXTURE_ANALISIS_RESPALDO = {
  as_of: "2026-07-27T12:00:00Z",
  currency: "VES",
  calc_version: 1,
  analysis_version: 1,
  ruleset_version: 1,
  confidence: "normal",
  official_stale: true,
  triggered_by: "11111111-2222-3333-4444-555555555555",
  indicators: [
    {
      indicator: "p2p_brecha_pct_buy",
      value: "13.22",
      as_of: "2026-07-27T12:00:00Z",
      band: "unscaled",
      position: null,
      scale: {
        source: "ruleset",
        window_days: 90,
        samples: 137,
        min_samples: 200,
        computed_at: "2026-07-27T11:45:00Z",
        domain: { min: "0", max: "200" },
        cuts: [],
      },
      rules: [],
    },
    {
      indicator: "p2p_ratio_oferta_demanda",
      value: "0.59",
      as_of: "2026-07-27T12:00:00Z",
      band: "unscaled",
      position: "0.1967",
      scale: {
        source: "ruleset",
        window_days: 90,
        samples: 137,
        min_samples: 200,
        computed_at: "2026-07-27T11:45:00Z",
        domain: { min: "0", max: "3" },
        cuts: [
          { key: "techo_inminente@v1", value: "0.2", position: "0.0667" },
          { key: "arranque_alcista@v1", value: "0.3", position: "0.1000" },
          { key: "correccion_inminente@v1", value: "2", position: "0.6667" },
        ],
      },
      rules: [
        {
          rule: "techo_inminente@v1",
          type: "techo_inminente",
          direction: "bajista",
          op: "lt",
          threshold: "0.2",
          met: false,
          distance: "0.39",
          threshold_position: "0.0667",
        },
        {
          rule: "correccion_inminente@v1",
          type: "correccion_inminente",
          direction: "bajista",
          op: "gt",
          threshold: "2",
          met: false,
          distance: "1.41",
          threshold_position: "0.6667",
        },
      ],
    },
  ],
  rule_proximity: [
    {
      rule: "arranque_alcista@v1",
      type: "arranque_alcista",
      direction: "alcista",
      conditions_total: 3,
      conditions_met: 0,
      evaluable: false,
      blocked_by: null,
      conditions: [
        {
          indicator: "p2p_momentum_bid_3h_pct",
          op: "gt",
          threshold: "0.5",
          value: null,
          met: false,
          distance: null,
        },
        {
          indicator: "p2p_drenaje_oferta_6h_pct",
          op: "lt",
          threshold: "-40",
          value: "29.86",
          met: false,
          distance: "69.86",
        },
        {
          indicator: "p2p_ratio_oferta_demanda",
          op: "lt",
          threshold: "0.3",
          value: "0.59",
          met: false,
          distance: "0.29",
        },
      ],
    },
  ],
  summary: {
    rules_total: 3,
    rules_evaluable: 0,
    closest_rule: null,
    conditions_met: 0,
    conditions_total: 0,
    blocked_by: null,
    rules_met: [],
  },
} satisfies Schemas["IndicatorAnalysis"] satisfies PayloadAnalisis;

describe("fixtures del contrato", () => {
  it("compilan contra los tipos generados (la aserción real es el typecheck)", () => {
    expect(FIXTURE_TASA.rate).toMatch(/^[0-9]+(\.[0-9]+)?$/);
    expect(FIXTURE_SENAL.evidence.rule).toContain("@v");
    expect(FIXTURE_INDICADORES_NULOS.gap_abs).toBeNull();
    expect(FIXTURE_PROFUNDIDAD.levels.length).toBeGreaterThan(0);
    expect(FIXTURE_P2P_LOW.confidence).toBe("low");
  });

  it("el análisis publica la escala usada y una posición dibujable o null", () => {
    // Percentiles: tres cortes reales y coordenada de dibujo.
    expect(FIXTURE_ANALISIS.indicators[0].scale.cuts).toHaveLength(3);
    expect(FIXTURE_ANALISIS.indicators[0].position).toMatch(/^[0-9.]+$/);
    // Respaldo: sin cortes no hay nada que dibujar honestamente.
    expect(FIXTURE_ANALISIS_RESPALDO.indicators[0].scale.source).toBe("ruleset");
    expect(FIXTURE_ANALISIS_RESPALDO.indicators[0].position).toBeNull();
    // Un indicador no vigente viaja como null, jamás con un valor rancio.
    expect(
      FIXTURE_ANALISIS_RESPALDO.rule_proximity[0].conditions[0].value,
    ).toBeNull();
  });
});
