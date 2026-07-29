/**
 * Store del mercado sin dependencias externas: `useSyncExternalStore` sobre un
 * estado inmutable que solo mutan los reducers puros de `reducers.ts`.
 */

import { useSyncExternalStore } from "react";

import type { CuotaRateLimit } from "../api/client";
import type { Profundidad, Salud } from "../api/endpoints";
import type { PushEvento } from "../ws/messages";
import {
  aplicarPush,
  aplicarResync,
  ESTADO_INICIAL,
  type EstadoConexion,
  type EstadoMercado,
  type SnapshotResync,
} from "./reducers";

type Listener = () => void;

let estado: EstadoMercado = ESTADO_INICIAL;
const listeners = new Set<Listener>();

function emitir(nuevo: EstadoMercado): void {
  if (nuevo === estado) {
    return;
  }
  estado = nuevo;
  for (const listener of listeners) {
    listener();
  }
}

export const marketStore = {
  getState: (): EstadoMercado => estado,
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  push(evento: PushEvento): void {
    emitir(aplicarPush(estado, evento));
  },
  resync(snapshot: SnapshotResync): void {
    emitir(aplicarResync(estado, snapshot));
  },
  conexion(valor: EstadoConexion, detalle: string | null = null): void {
    emitir({ ...estado, conexion: valor, detalleConexion: detalle });
  },
  cuota(valor: CuotaRateLimit): void {
    emitir({ ...estado, cuota: valor });
  },
  salud(valor: Salud | null): void {
    emitir({ ...estado, salud: valor });
  },
  profundidad(lado: "buy" | "sell", valor: Profundidad | null): void {
    emitir({
      ...estado,
      profundidad: { ...estado.profundidad, [lado]: valor ?? undefined },
    });
  },
  /** Solo tests: vuelve al estado inicial. */
  reset(): void {
    emitir(ESTADO_INICIAL);
  },
};

export function useMarket(): EstadoMercado {
  return useSyncExternalStore(marketStore.subscribe, marketStore.getState);
}
