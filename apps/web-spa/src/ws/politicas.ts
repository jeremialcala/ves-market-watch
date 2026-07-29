/**
 * Políticas puras del StreamClient (testeables sin WebSocket): backoff de
 * reconexión y decisión según el código de cierre del contrato.
 */

import {
  CIERRE_LIMITE,
  CIERRE_NO_AUTENTICADO,
  CIERRE_SIN_PERMISO,
} from "./messages";

export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;
export const DELAY_LIMITE_MS = 60_000;
/** Ping del servidor cada 30 s: sin NINGÚN mensaje en 75 s el socket es zombi. */
export const WATCHDOG_MS = 75_000;
/** Renovación proactiva del token del WSS antes de su exp. */
export const MARGEN_RENOVACION_S = 60;

/** Backoff exponencial con jitter: base·2^intento ± 50 %, cap 30 s. */
export function calcularBackoff(intento: number, aleatorio: number): number {
  const exponencial = Math.min(
    BACKOFF_BASE_MS * 2 ** Math.max(0, intento),
    BACKOFF_MAX_MS,
  );
  const jitter = 0.5 + aleatorio; // aleatorio ∈ [0,1) → factor [0.5, 1.5)
  return Math.min(Math.round(exponencial * jitter), BACKOFF_MAX_MS);
}

export type AccionTrasCierre =
  | { accion: "refrescar-y-reconectar" }
  | { accion: "detener"; motivo: string }
  | { accion: "esperar"; delayMs: number; motivo?: string };

export function decidirTrasCierre(
  codigo: number,
  intento: number,
  aleatorio: number,
): AccionTrasCierre {
  switch (codigo) {
    case CIERRE_NO_AUTENTICADO:
      // Token expirado/ inválido: token fresco (cacheMode off) y de una.
      return { accion: "refrescar-y-reconectar" };
    case CIERRE_SIN_PERMISO:
      // Sin stream:events: reintentar no lo va a arreglar.
      return {
        accion: "detener",
        motivo: "La cuenta no tiene el permiso stream:events.",
      };
    case CIERRE_LIMITE:
      return {
        accion: "esperar",
        delayMs: DELAY_LIMITE_MS,
        motivo:
          "Límite de conexiones del usuario alcanzado (¿múltiples pestañas?).",
      };
    default:
      return { accion: "esperar", delayMs: calcularBackoff(intento, aleatorio) };
  }
}
