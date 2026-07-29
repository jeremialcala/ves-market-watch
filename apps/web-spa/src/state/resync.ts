/**
 * Reposición del estado por REST (ADR-0016: el push WSS es best-effort; el
 * estado consultable vive en la API). Se ejecuta al conectar/reconectar el
 * stream. ~10 requests por corrida — holgado dentro de los 120/min por sub.
 */

import {
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
  const [tasas, buy, sell, inds, depthBuy, depthSell, senales, estadoSalud] =
    await Promise.all([
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
      profundidad("buy").catch(() => null),
      profundidad("sell").catch(() => null),
      senalesRecientes().catch(() => null),
      salud().catch(() => null),
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
    profundidad: { buy: depthBuy ?? undefined, sell: depthSell ?? undefined },
    ...(senales !== null && { senales: senales.data }),
    salud: estadoSalud,
  });
}
