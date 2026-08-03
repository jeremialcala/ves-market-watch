/**
 * Reposición del estado por REST (ADR-0016: el push WSS es best-effort; el
 * estado consultable vive en la API). Se ejecuta al conectar/reconectar el
 * stream. ~12 requests por corrida — holgado dentro de los 120/min por sub.
 */

import {
  analisis,
  historialIndicadores,
  indicadores,
  profundidad,
  referenciaP2P,
  salud,
  senalesRecientes,
  tasaOficial,
  type TasaOficial as Tasa,
} from "../api/endpoints";
import { marketStore } from "./marketStore";

export const MONEDAS_BCV = ["USD", "EUR", "CNY", "TRY", "RUB"] as const;

export async function resyncTodo(): Promise<void> {
  const [
    tasas,
    buy,
    sell,
    inds,
    lectura,
    depthBuy,
    depthSell,
    senales,
    estadoSalud,
    variacion,
  ] = await Promise.all([
      Promise.all(
        MONEDAS_BCV.map(async (moneda) => {
          // 404 por moneda = sin datos aún: tolerado (RF-5).
          try {
            return await tasaOficial(moneda);
          } catch {
            return null;
          }
        }),
      ),
      referenciaP2P("buy").catch(() => null),
      referenciaP2P("sell").catch(() => null),
      indicadores("USD").catch(() => null),
      analisis().catch(() => null),
      profundidad("buy").catch(() => null),
      profundidad("sell").catch(() => null),
      senalesRecientes().catch(() => null),
      salud().catch(() => null),
      variacionOficialReciente().catch(() => null),
    ]);

  const mapaTasas: Record<string, Tasa> = {};
  for (const tasa of tasas) {
    if (tasa !== null) {
      mapaTasas[tasa.currency] = tasa;
    }
  }
  marketStore.resync({
    tasas: mapaTasas,
    p2p: { buy: buy ?? undefined, sell: sell ?? undefined },
    indicadores: inds,
    analisis: lectura,
    profundidad: { buy: depthBuy ?? undefined, sell: depthSell ?? undefined },
    ...(senales !== null && { senales: senales.data }),
    salud: estadoSalud,
    ...(variacion !== null && { variacionOficial: variacion }),
  });
}

/**
 * La variación de la última publicación de cada moneda.
 *
 * Hace falta reponerla por REST porque `variacionOficial` solo la llena el push,
 * y el BCV publica UNA vez al día: sin esto la cifra no aparecería hasta la
 * siguiente publicación — el mismo defecto que dejó tres tarjetas en blanco
 * durante días (efecto de montaje sin resync).
 *
 * Una sola petición para las cinco monedas: sin filtro de moneda, el histórico
 * las devuelve todas. Bucket de 1 día porque hay como mucho una publicación
 * diaria por moneda, así que el promedio del bucket ES el valor; y 14 días de
 * ventana para cubrir un puente largo sin publicaciones.
 */
async function variacionOficialReciente(): Promise<
  Record<string, { pct: string; as_of: string }>
> {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - 14 * 86_400_000);
  const filas = await historialIndicadores(desde, hasta, "1d", {
    indicador: INDICADOR_VARIACION_OFICIAL,
  });
  const ultima: Record<string, { pct: string; as_of: string }> = {};
  for (const fila of filas) {
    const previa = ultima[fila.currency];
    if (previa === undefined || fila.as_of > previa.as_of) {
      ultima[fila.currency] = { pct: fila.value, as_of: fila.as_of };
    }
  }
  return ultima;
}

const INDICADOR_VARIACION_OFICIAL = "official_rate_change_pct";
