/**
 * Cliente del canal WSS `/ws/v1` (contrato: asyncapi.yaml). SINGLETON por
 * pestaña: el gateway limita a 5 conexiones por usuario y el HMR de Vite
 * abriría una por recarga sin el guard de `useStream`.
 *
 * Ciclo: token fresco → conectar → subscribe(4 tópicos) → push al store; en
 * cada (re)conexión exitosa dispara el resync REST (ADR-0016: push
 * best-effort). Renovación proactiva a exp−60 s; watchdog de 75 s sin
 * mensajes; política por código de cierre en `politicas.ts`.
 */

import { expDelToken, obtenerToken } from "../auth/tokenProvider";
import { wsUrl } from "../config";
import {
  esPush,
  TOPICOS,
  type MensajeServidor,
  type PushEvento,
} from "./messages";
import {
  decidirTrasCierre,
  MARGEN_RENOVACION_S,
  WATCHDOG_MS,
} from "./politicas";

export interface CallbacksStream {
  alRecibir: (push: PushEvento) => void;
  alResync: () => void;
  alCambiarEstado: (
    estado: "conectando" | "conectado" | "reconectando" | "detenido",
    detalle?: string,
  ) => void;
}

type Temporizador = ReturnType<typeof setTimeout>;

export class StreamClient {
  private ws: WebSocket | null = null;
  private callbacks: CallbacksStream | null = null;
  private intento = 0;
  private activo = false;
  private forzarRefresh = false;
  private timerReintento: Temporizador | null = null;
  private timerRenovacion: Temporizador | null = null;
  private timerWatchdog: Temporizador | null = null;

  start(callbacks: CallbacksStream): void {
    if (this.activo) {
      return;
    }
    this.activo = true;
    this.callbacks = callbacks;
    void this.conectar();
  }

  close(): void {
    this.activo = false;
    this.limpiarTemporizadores();
    this.cerrarSocketSinPolitica(1000, "cierre del cliente");
  }

  get conectado(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // -- ciclo de conexión -------------------------------------------------------

  private async conectar(): Promise<void> {
    if (!this.activo) {
      return;
    }
    this.callbacks?.alCambiarEstado(
      this.intento === 0 ? "conectando" : "reconectando",
    );
    let token: string;
    try {
      token = await obtenerToken(
        this.forzarRefresh ? { forceRefresh: true } : undefined,
      );
      this.forzarRefresh = false;
    } catch {
      // Sin sesión todavía (o refresh fallido): reintento suave.
      this.timerReintento = setTimeout(() => void this.conectar(), 2_000);
      return;
    }

    const ws = new WebSocket(wsUrl(token));
    this.ws = ws;

    ws.onopen = () => {
      this.intento = 0;
      ws.send(JSON.stringify({ action: "subscribe", topics: [...TOPICOS] }));
      this.callbacks?.alCambiarEstado("conectado");
      // El estado consultable vive en REST: reponer en cada (re)conexión.
      this.callbacks?.alResync();
      this.programarRenovacion(token);
      this.rearmarWatchdog();
    };

    ws.onmessage = (evento: MessageEvent<string>) => {
      this.rearmarWatchdog();
      let mensaje: MensajeServidor;
      try {
        mensaje = JSON.parse(evento.data) as MensajeServidor;
      } catch {
        return; // frame ilegible: se ignora
      }
      if (esPush(mensaje)) {
        this.callbacks?.alRecibir(mensaje);
      }
      // subscribed/unsubscribed/ping: alimentan el watchdog; los errores de
      // protocolo ({"type":"error"}) no cierran la conexión (contrato).
    };

    ws.onclose = (evento: CloseEvent) => {
      this.ws = null;
      this.limpiarTemporizadores();
      if (!this.activo) {
        return;
      }
      const decision = decidirTrasCierre(
        evento.code,
        this.intento,
        Math.random(),
      );
      this.intento += 1;
      switch (decision.accion) {
        case "refrescar-y-reconectar":
          this.forzarRefresh = true;
          void this.conectar();
          return;
        case "detener":
          this.activo = false;
          this.callbacks?.alCambiarEstado("detenido", decision.motivo);
          return;
        case "esperar":
          this.callbacks?.alCambiarEstado("reconectando", decision.motivo);
          this.timerReintento = setTimeout(
            () => void this.conectar(),
            decision.delayMs,
          );
      }
    };
  }

  // -- temporizadores ----------------------------------------------------------

  private programarRenovacion(token: string): void {
    const exp = expDelToken(token);
    if (exp === null) {
      return;
    }
    const ms = Math.max(1_000, (exp - MARGEN_RENOVACION_S) * 1000 - Date.now());
    this.timerRenovacion = setTimeout(() => {
      // Token por vencer: cerrar sin política y reconectar con uno nuevo.
      this.cerrarSocketSinPolitica(1000, "renovación de token");
      this.forzarRefresh = true;
      void this.conectar();
    }, ms);
  }

  private rearmarWatchdog(): void {
    if (this.timerWatchdog !== null) {
      clearTimeout(this.timerWatchdog);
    }
    this.timerWatchdog = setTimeout(() => {
      // 75 s sin ningún mensaje (ni ping): socket zombi — forzar el ciclo de
      // reconexión cerrando; el onclose aplica la política de backoff.
      this.ws?.close(4000, "watchdog sin actividad");
    }, WATCHDOG_MS);
  }

  private cerrarSocketSinPolitica(codigo: number, razon: string): void {
    if (this.ws !== null) {
      this.ws.onclose = null;
      this.ws.close(codigo, razon);
      this.ws = null;
    }
  }

  private limpiarTemporizadores(): void {
    for (const timer of [
      this.timerReintento,
      this.timerRenovacion,
      this.timerWatchdog,
    ]) {
      if (timer !== null) {
        clearTimeout(timer);
      }
    }
    this.timerReintento = null;
    this.timerRenovacion = null;
    this.timerWatchdog = null;
  }
}

export const streamClient = new StreamClient();
