/**
 * Qué series se pueden pintar en la tarjeta de serie evaluada, y cómo se llaman.
 *
 * La lista es **la del ruleset más la brecha**: los cuatro indicadores que
 * evalúan las reglas de `senales.v1.yaml` —momentum, drenaje, ratio y spread— y
 * la brecha que las contextualiza. Eso es lo que «serie evaluada» significa.
 *
 * Fuera quedan la tasa oficial, que tiene su propio bloque de contexto, y las
 * medianas y liquideces, que no gobiernan ninguna regla: verlas aquí sugeriría
 * que la capa de referencia va a dibujarles un umbral, y no hay ninguno.
 *
 * Los nombres son legibles porque el desplegable es donde se ELIGE. La clave
 * `snake_case` sigue a la vista en la cabecera de la tarjeta, que es donde
 * sirve: para saber qué se está mirando, no para decidirlo.
 */

import type { Clave } from "../i18n/dict";

export const PRESETS = [7, 30, 90] as const;

export interface SerieEvaluable {
  indicador: string;
  clave: Clave;
  /** Unidad que acompaña al valor en el tooltip. Vacía = adimensional. */
  unidad: string;
}

/** Unidad de una serie evaluable; vacía si no está en la lista. */
export function unidadDe(indicador: string): string {
  return SERIES.find((s) => s.indicador === indicador)?.unidad ?? "";
}

export const SERIES: readonly SerieEvaluable[] = [
  { indicador: "p2p_brecha_pct_buy", unidad: "%", clave: "opcionSerie.brechaCompra" },
  { indicador: "p2p_drenaje_oferta_6h_pct", unidad: "%", clave: "opcionSerie.drenaje" },
  { indicador: "p2p_momentum_bid_3h_pct", unidad: "%", clave: "opcionSerie.momentum" },
  { indicador: "p2p_ratio_oferta_demanda", unidad: "", clave: "opcionSerie.ratio" },
  { indicador: "p2p_spread_pct", unidad: "%", clave: "opcionSerie.spread" },
];
