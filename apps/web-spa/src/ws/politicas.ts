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
  | {
      accion: "esperar";
      delayMs: number;
      motivo?: string;
      /** Pedir token nuevo antes de reconectar (solo en el ciclo de 4401). */
      refrescar?: boolean;
    };

/**
 * Cuántos 4401 SEGUIDOS se toleran antes de rendirse con un motivo visible.
 *
 * Seis intentos con el backoff de abajo son unos 31 s. Un problema de
 * autenticación que dura medio minuto no se arregla en el siguiente medio: o lo
 * arregla alguien fuera —el reloj, el tenant, los permisos— o no se arregla, y
 * mientras tanto cada vuelta cuesta un token a Auth0 y un resync REST completo
 * al gateway.
 */
export const MAX_FALLOS_AUTH = 6;

/**
 * `fallosAuth` cuenta los 4401 seguidos INCLUYENDO este cierre, y se pone a
 * cero en cuanto una conexión da señales de vida (ver `StreamClient`).
 */
export function decidirTrasCierre(
  codigo: number,
  intento: number,
  aleatorio: number,
  fallosAuth: number,
): AccionTrasCierre {
  switch (codigo) {
    case CIERRE_NO_AUTENTICADO:
      /*
       * El primero, token fresco y de una: el caso corriente es un token
       * caducado, y ahí pedir otro lo arregla en el acto.
       *
       * Del segundo en adelante, NO. Esta rama era la única que se saltaba el
       * backoff, y con un 4401 que no venía de vejez —el 2026-08-22 fue el reloj
       * del host 37 s atrasado, con lo que el `iat` de Auth0 llegaba «en el
       * futuro»— el token nuevo salía tan rechazado como el viejo y el ciclo se
       * repetía SIN ESPERA: 16 000 peticiones al gateway en 18 minutos, ~1235
       * resyncs completos, y el endpoint de token de Auth0 al mismo ritmo con
       * `cacheMode: "off"`. Reintentar de inmediato solo tiene sentido si hay
       * motivos para creer que el siguiente intento será distinto; a partir del
       * segundo fallo idéntico, no los hay.
       */
      if (fallosAuth <= 1) {
        return { accion: "refrescar-y-reconectar" };
      }
      if (fallosAuth > MAX_FALLOS_AUTH) {
        return {
          accion: "detener",
          motivo:
            "No se pudo autenticar tras varios intentos. Revisa la sesión y " +
            "la hora del sistema; recarga para volver a probar.",
        };
      }
      return {
        accion: "esperar",
        // −2: el primer fallo no espera, así que el segundo estrena el backoff.
        delayMs: calcularBackoff(fallosAuth - 2, aleatorio),
        motivo: "Reintentando la autenticación.",
        refrescar: true,
      };
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
