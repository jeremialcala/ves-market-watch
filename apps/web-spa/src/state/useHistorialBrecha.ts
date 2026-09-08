/**
 * Serie horaria de la brecha para el mapa de calor y la sparkline.
 *
 * Una sola llamada, FILTRADA por indicador y moneda (regla del histórico: sin
 * filtro se pagina el formato largo entero y se agota la cuota): 14 días con
 * bucket 1 h, que sirve a las dos cosas — la sparkline son los últimos 24
 * buckets.
 *
 * Se pide una vez al montar: es contexto histórico, no dato en vivo — lo vivo
 * llega por el WSS. Sin esto, cada push dispararía una paginación.
 *
 * El LADO se elige por componente y no es un detalle: la sparkline vive en una
 * tarjeta titulada «lado buy» y tiene que coincidir con ella, mientras que el
 * mapa de calor usa **venta**, que es el lado con historia real (242 días
 * derivados, ADR-0013 RF-7) frente a los ~12 días del de compra.
 */

import { useEffect, useState } from "react";

import { historialIndicadores } from "../api/endpoints";
import type { Punto } from "../lib/series";

export type LadoBrecha = "buy" | "sell";

export const INDICADOR_BRECHA: Record<LadoBrecha, string> = {
  buy: "p2p_brecha_pct_buy",
  sell: "p2p_brecha_pct_sell",
};

const MONEDA_P2P = "VES";
export const DIAS_CALOR = 14;

export interface HistorialBrecha {
  /** Bucket 1 h de los últimos 14 días, en orden cronológico. */
  horario: Punto[];
  cargando: boolean;
  /** `true` si la serie falló: la UI lo dice, no lo esconde. */
  fallo: boolean;
}

const VACIO: HistorialBrecha = { horario: [], cargando: true, fallo: false };

function aPuntos(filas: { as_of: string; value: string }[]): Punto[] {
  return filas
    .map((fila) => ({ t: Date.parse(fila.as_of), valor: fila.value }))
    .sort((a, b) => a.t - b.t);
}

/**
 * Peticiones EN VUELO, para que dos componentes que piden el mismo lado en el
 * mismo commit compartan una sola llamada.
 *
 * Es deduplicación, no cache: la entrada se borra al resolverse. Un cache de
 * verdad serviría datos viejos al volver a montar la vista, y esta serie se pide
 * precisamente para tener el contexto reciente.
 */
const enVuelo = new Map<LadoBrecha, Promise<Punto[] | null>>();

function pedirSerie(lado: LadoBrecha): Promise<Punto[] | null> {
  const pendiente = enVuelo.get(lado);
  if (pendiente !== undefined) {
    return pendiente;
  }
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - DIAS_CALOR * 86_400_000);
  const promesa = historialIndicadores(
    desde,
    hasta,
    "1h",
    { indicador: INDICADOR_BRECHA[lado], moneda: MONEDA_P2P },
    // Sin `signal`: la petición la comparten varios componentes, así que el
    // desmontaje de uno no puede cancelársela a los demás. Cada uno ignora el
    // resultado si su propio `signal` ya abortó.
    {},
  )
    .then(aPuntos)
    .catch(() => null)
    .finally(() => enVuelo.delete(lado));
  enVuelo.set(lado, promesa);
  return promesa;
}

export function useHistorialBrecha(lado: LadoBrecha = "buy"): HistorialBrecha {
  const [estado, setEstado] = useState<HistorialBrecha>(VACIO);

  useEffect(() => {
    const control = new AbortController();

    void (async () => {
      const horario = await pedirSerie(lado);
      if (control.signal.aborted) {
        return;
      }
      setEstado({
        horario: horario ?? [],
        cargando: false,
        fallo: horario === null,
      });
    })();

    return () => control.abort();
  }, [lado]);

  return estado;
}
