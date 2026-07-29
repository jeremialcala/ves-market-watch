/** Contrato en compilación: los fixtures del front se declaran `satisfies`
 * contra los tipos GENERADOS del openapi.yaml — si el contrato cambia y los
 * fixtures dejan de encajar, esta suite no compila. La frescura de
 * types.gen.ts vs el YAML la verifica `npm run check:api-types` (enganchado a
 * `npm test`). */

import { describe, expect, it } from "vitest";

import type { components } from "../../src/api/types.gen";

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

describe("fixtures del contrato", () => {
  it("compilan contra los tipos generados (la aserción real es el typecheck)", () => {
    expect(FIXTURE_TASA.rate).toMatch(/^[0-9]+(\.[0-9]+)?$/);
    expect(FIXTURE_SENAL.evidence.rule).toContain("@v");
    expect(FIXTURE_INDICADORES_NULOS.gap_abs).toBeNull();
    expect(FIXTURE_PROFUNDIDAD.levels.length).toBeGreaterThan(0);
    expect(FIXTURE_P2P_LOW.confidence).toBe("low");
  });
});
