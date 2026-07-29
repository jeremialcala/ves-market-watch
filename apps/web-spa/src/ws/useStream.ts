/**
 * Conecta el singleton del stream con el marketStore. El guard de HMR y el
 * `beforeunload` cierran la conexión al recargar — sin esto cada edición en
 * dev filtra una conexión y el gateway responde 1008 al quinto intento.
 */

import { useEffect } from "react";

import { profundidad } from "../api/endpoints";
import { marketStore } from "../state/marketStore";
import { resyncTodo } from "../state/resync";
import { streamClient } from "./StreamClient";

async function reponerProfundidad(): Promise<void> {
  const [buy, sell] = await Promise.all([
    profundidad("buy").catch(() => null),
    profundidad("sell").catch(() => null),
  ]);
  marketStore.profundidad("buy", buy);
  marketStore.profundidad("sell", sell);
}

export function useStream(): void {
  useEffect(() => {
    streamClient.start({
      alRecibir: (push) => {
        marketStore.push(push);
        if (push.topic === "p2p.snapshot") {
          // La profundidad es proyección REST del crudo (ADR-0016): un
          // snapshot nuevo la invalida (2 req/min, dentro del presupuesto).
          void reponerProfundidad();
        }
      },
      alResync: () => void resyncTodo(),
      alCambiarEstado: (estado, detalle) =>
        marketStore.conexion(estado, detalle ?? null),
    });
    const cerrar = () => streamClient.close();
    window.addEventListener("beforeunload", cerrar);
    return () => {
      window.removeEventListener("beforeunload", cerrar);
      streamClient.close();
    };
  }, []);
}

// Guard de HMR (dev): al reemplazar el módulo, cerrar la conexión vieja.
if (import.meta.hot) {
  import.meta.hot.dispose(() => streamClient.close());
}
