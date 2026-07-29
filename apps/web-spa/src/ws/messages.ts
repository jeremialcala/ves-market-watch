/**
 * Mensajes del canal WSS `/ws/v1` (contrato: apps/api-gateway/docs/asyncapi.yaml)
 * y payloads canónicos de los eventos del bus (schemas/ raíz) que viajan en
 * `data` del push.
 */

export type Topico = "rates.official" | "p2p.snapshot" | "indicators" | "signals";

export const TOPICOS: readonly Topico[] = [
  "rates.official",
  "p2p.snapshot",
  "indicators",
  "signals",
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

// Cierres del contrato.
export const CIERRE_NO_AUTENTICADO = 4401;
export const CIERRE_SIN_PERMISO = 4403;
export const CIERRE_LIMITE = 1008;
