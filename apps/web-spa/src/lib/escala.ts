/**
 * Único punto de aritmética del panel de medidores.
 *
 * Banda, posición, posición de umbral, distancia y `met` vienen CALCULADOS del
 * contrato (`schemas/analysis.v1.json`): el SPA no reclasifica ni recalcula
 * nada. Lo único que queda por hacer aquí es traducir la fracción [0,1] del
 * contrato a un ancho CSS, y eso es presentación pura.
 */

import { toChartNumber } from "./decimal";

/**
 * Fracción [0,1] del contrato → porcentaje CSS.
 *
 * COORDENADA DE PRESENTACIÓN: la única conversión a `number` permitida en este
 * camino (ADR-0017, `lib/decimal.ts:toChartNumber`). El acotado es cinturón —
 * el engine ya publica la fracción dentro de [0,1].
 */
export function pctDesdeFraccion(fraccion: string): string {
  const n = toChartNumber(fraccion);
  return `${(Math.min(1, Math.max(0, n)) * 100).toFixed(2)}%`;
}
