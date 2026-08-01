/**
 * Series históricas de la brecha que alimentan el dashboard rediseñado.
 *
 * Dos llamadas, ambas FILTRADAS por indicador y moneda (regla del histórico:
 * sin filtro se pagina el formato largo entero y se agota la cuota):
 *   · 14 días con bucket 1 h → sparkline de 24 h y mapa de calor (una sola
 *     serie sirve a las dos cosas; la sparkline son los últimos 24 buckets).
 *   · 90 días con bucket 1 d → comparativas contra la historia (90 filas).
 *
 * Se piden una vez al montar: son contexto histórico, no dato en vivo — lo
 * vivo llega por el WSS. Sin esto, cada push dispararía dos paginaciones.
 */

import { useEffect, useState } from "react";

import { historialIndicadores } from "../api/endpoints";
import type { Punto } from "../lib/series";

export const INDICADOR_BRECHA = "p2p_brecha_pct_buy";
const MONEDA_P2P = "VES";
export const DIAS_CALOR = 14;
const DIAS_COMPARATIVA = 90;

export interface HistorialBrecha {
  /** Bucket 1 h de los últimos 14 días, en orden cronológico. */
  horario: Punto[];
  /** Bucket 1 d de los últimos 90 días, en orden cronológico. */
  diario: Punto[];
  cargando: boolean;
  /** `true` si alguna de las dos series falló: la UI lo dice, no lo esconde. */
  fallo: boolean;
}

const VACIO: HistorialBrecha = {
  horario: [],
  diario: [],
  cargando: true,
  fallo: false,
};

function aPuntos(filas: { as_of: string; value: string }[]): Punto[] {
  return filas
    .map((fila) => ({ t: Date.parse(fila.as_of), valor: fila.value }))
    .sort((a, b) => a.t - b.t);
}

export function useHistorialBrecha(): HistorialBrecha {
  const [estado, setEstado] = useState<HistorialBrecha>(VACIO);

  useEffect(() => {
    const control = new AbortController();
    const hasta = new Date();
    const desde = (dias: number) =>
      new Date(hasta.getTime() - dias * 86_400_000);
    const filtro = { indicador: INDICADOR_BRECHA, moneda: MONEDA_P2P };

    void (async () => {
      const [horario, diario] = await Promise.all([
        historialIndicadores(desde(DIAS_CALOR), hasta, "1h", filtro, {
          signal: control.signal,
        }).catch(() => null),
        historialIndicadores(desde(DIAS_COMPARATIVA), hasta, "1d", filtro, {
          signal: control.signal,
        }).catch(() => null),
      ]);
      if (control.signal.aborted) {
        return;
      }
      setEstado({
        horario: horario === null ? [] : aPuntos(horario),
        diario: diario === null ? [] : aPuntos(diario),
        cargando: false,
        fallo: horario === null || diario === null,
      });
    })();

    return () => control.abort();
  }, []);

  return estado;
}
