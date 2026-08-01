/**
 * Mensajes del canal WSS `/ws/v1` (contrato: apps/api-gateway/docs/asyncapi.yaml)
 * y payloads canónicos de los eventos del bus (schemas/ raíz) que viajan en
 * `data` del push.
 */

export type Topico =
  | "rates.official"
  | "p2p.snapshot"
  | "indicators"
  | "signals"
  | "analysis";

export const TOPICOS: readonly Topico[] = [
  "rates.official",
  "p2p.snapshot",
  "indicators",
  "signals",
  "analysis",
];

// -- cliente → servidor ------------------------------------------------------

export interface MensajeSuscripcion {
  action: "subscribe" | "unsubscribe";
  topics: Topico[];
}

// -- servidor → cliente ------------------------------------------------------

export interface Confirmacion {
  type: "subscribed" | "unsubscribed";
  topics: Topico[];
}

export interface ErrorProtocolo {
  type: "error";
  detail: string;
}

export interface Ping {
  type: "ping";
}

export interface PushEvento {
  topic: Topico;
  event_id: string;
  occurred_at: string;
  data: unknown;
}

export type MensajeServidor = Confirmacion | ErrorProtocolo | Ping | PushEvento;

export function esPush(mensaje: MensajeServidor): mensaje is PushEvento {
  return "topic" in mensaje;
}

// -- payloads canónicos (schemas/ raíz) --------------------------------------

/** `official-rate.v1.json#/properties/payload` */
export interface PayloadTasaOficial {
  source: string;
  currency: string;
  rate: string;
  value_date: string;
  captured_at: string;
  status: "valid";
}

/** `indicators.v1.json#/properties/payload` (formato largo) */
export interface PayloadIndicadores {
  as_of: string;
  calc_version: number;
  official_stale: boolean;
  triggered_by: string;
  indicators: { indicator: string; currency: string; value: string }[];
}

/** `signal.v1.json#/properties/payload` */
export interface PayloadSenal {
  type: string;
  direction: "alcista" | "bajista" | "neutral";
  currency: string;
  as_of: string;
  calc_version: number;
  triggered_by: string;
  evidence: { rule: string; inputs: Record<string, string> };
}

/**
 * `analysis.v1.json#/properties/payload` — la lectura de los medidores en una
 * revisión (RF-6). Escrito a mano como sus hermanos, con canario en
 * `tests/contract/fixtures.test.ts`: el fixture lleva `satisfies
 * Schemas["IndicatorAnalysis"]` **y** `satisfies PayloadAnalisis`, así que si
 * los dos divergen el test no compila.
 */
export interface PayloadAnalisis {
  as_of: string;
  currency: string;
  calc_version: number;
  analysis_version: number;
  ruleset_version: number;
  confidence: "normal" | "low";
  official_stale: boolean;
  triggered_by: string;
  indicators: {
    indicator: string;
    value: string;
    as_of: string;
    band: "very_low" | "low" | "high" | "very_high" | "unscaled";
    /** Coordenada de dibujo en [0,1], no un percentil. `null` = nada que pintar. */
    position: string | null;
    scale: {
      source: "percentiles" | "ruleset";
      window_days: number;
      samples: number;
      min_samples: number;
      computed_at: string | null;
      domain: { min: string; max: string };
      cuts: { key: string; value: string; position: string }[];
    };
    rules: {
      rule: string;
      type: string;
      direction: "alcista" | "bajista" | "neutral";
      op: "gt" | "gte" | "lt" | "lte";
      threshold: string;
      met: boolean;
      distance: string;
      threshold_position: string;
    }[];
  }[];
  rule_proximity: {
    rule: string;
    type: string;
    direction: "alcista" | "bajista" | "neutral";
    conditions_total: number;
    conditions_met: number;
    evaluable: boolean;
    blocked_by: string | null;
    conditions: {
      indicator: string;
      op: "gt" | "gte" | "lt" | "lte";
      threshold: string;
      value: string | null;
      met: boolean;
      distance: string | null;
    }[];
  }[];
  summary: {
    rules_total: number;
    rules_evaluable: number;
    closest_rule: string | null;
    conditions_met: number;
    conditions_total: number;
    blocked_by: string | null;
    rules_met: string[];
  };
}

// Cierres del contrato.
export const CIERRE_NO_AUTENTICADO = 4401;
export const CIERRE_SIN_PERMISO = 4403;
export const CIERRE_LIMITE = 1008;
