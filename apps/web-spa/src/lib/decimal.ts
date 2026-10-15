/** Los decimales exactos viven en `@criterio/ui` (ADR-0031): los usan el
 * `web-spa` y el portal. Se reexportan para no cambiar las importaciones. */
export {
  compararDecimales,
  esDecimal,
  formatDecimal,
  formatPct,
  porcentajeRelativo,
  promediarDecimales,
  restarDecimales,
  signo,
  toChartNumber,
  type OpcionesFormato,
} from "@criterio/ui";
