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
}

export const SERIES: readonly SerieEvaluable[] = [
  { indicador: "p2p_brecha_pct_buy", clave: "opcionSerie.brechaCompra" },
  { indicador: "p2p_drenaje_oferta_6h_pct", clave: "opcionSerie.drenaje" },
  { indicador: "p2p_momentum_bid_3h_pct", clave: "opcionSerie.momentum" },
  { indicador: "p2p_ratio_oferta_demanda", clave: "opcionSerie.ratio" },
  { indicador: "p2p_spread_pct", clave: "opcionSerie.spread" },
];
