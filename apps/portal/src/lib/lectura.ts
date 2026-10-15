/**
 * Lo que los paneles de la landing derivan del snapshot. Funciones puras: los
 * componentes solo pintan.
 *
 * Decimales como cadena exacta (ADR-0017): la única conversión a `number` es
 * para posiciones en pantalla (`toChartNumber`).
 */

import {
  compararDecimales,
  formatDecimal,
  formatPct,
  porcentajeRelativo,
  restarDecimales,
  signo,
  toChartNumber,
  type Idioma,
} from "@criterio/ui";

import type { Medidor, ProximidadRegla, Snapshot } from "../api/cliente";
import type { Clave } from "../i18n/dict";

// -- tiempo -------------------------------------------------------------------

/** Antigüedad como clave del diccionario + cantidad, para `t(clave, { n })`. */
export function edad(asOfIso: string, ahora: number): { clave: Clave; n: number } {
  const ms = ahora - Date.parse(asOfIso);
  if (Number.isNaN(ms) || ms < 1000) {
    return { clave: "tiempo.ahora", n: 0 };
  }
  const seg = Math.floor(ms / 1000);
  if (seg < 60) {
    return { clave: "tiempo.segundos", n: seg };
  }
  const min = Math.floor(seg / 60);
  if (min < 60) {
    return { clave: "tiempo.minutos", n: min };
  }
  const horas = Math.floor(min / 60);
  if (horas < 48) {
    return { clave: "tiempo.horas", n: horas };
  }
  return { clave: "tiempo.dias", n: Math.floor(horas / 24) };
}

/** «14 oct · 20:19 VET»: el mercado es venezolano, la hora también. */
export function fechaVet(iso: string, idioma: Idioma): string {
  const fecha = new Date(iso);
  const dia = new Intl.DateTimeFormat(idioma === "es" ? "es-VE" : "en-US", {
    day: "numeric",
    month: "short",
    timeZone: "America/Caracas",
  })
    .format(fecha)
    .replace(".", "");
  const hora = new Intl.DateTimeFormat("es-VE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Caracas",
  }).format(fecha);
  return `${dia} · ${hora} VET`;
}

// -- cifras ---------------------------------------------------------------------

export function esPorcentaje(indicador: string): boolean {
  return indicador.endsWith("_pct");
}

/** Un valor de indicador con su unidad: los `_pct` en %, el resto tal cual. */
export function valorIndicador(valor: string, indicador: string, idioma: Idioma): string {
  return esPorcentaje(indicador)
    ? formatPct(valor, 2, idioma)
    : formatDecimal(valor, { maxDecimales: 2, idioma });
}

/** Con signo explícito: «+0,17» / «−1,34». */
export function conSigno(valor: string, idioma: Idioma, maxDecimales = 2): string {
  const texto = formatDecimal(valor, { maxDecimales, minDecimales: maxDecimales, idioma });
  if (signo(valor) > 0) {
    return `+${texto}`;
  }
  return texto.replace("-", "−");
}

export function absoluto(valor: string): string {
  return valor.startsWith("-") ? valor.slice(1) : valor;
}

const OPERADORES: Record<string, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤" };

export function operador(op: string): string {
  return OPERADORES[op] ?? op;
}

// -- hero -------------------------------------------------------------------------

/** La brecha de hoy menos su media de 7 días, en puntos. `null` sin historia. */
export function deltaVsSieteDias(s: Snapshot): string | null {
  const actual = s.gap?.pct;
  const buy = s.analysis?.gap_history?.sides.find((lado) => lado.side === "buy");
  const media = buy?.references.find((r) => r.days_configured === 7)?.mean;
  if (!actual || !media) {
    return null;
  }
  return restarDecimales(actual, media);
}

export function tasaUsd(s: Snapshot): string | null {
  return s.official_rates.find((t) => t.currency === "USD")?.rate ?? null;
}

/** Puntos de una polilínea SVG de `ancho` × `alto` para la sparkline. */
export function puntosSparkline(
  puntos: readonly { value: string }[],
  ancho: number,
  alto: number,
  margen = 6,
): string {
  if (puntos.length < 2) {
    return "";
  }
  const valores = puntos.map((p) => toChartNumber(p.value));
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min || 1;
  return valores
    .map((v, i) => {
      const x = (i / (valores.length - 1)) * ancho;
      const y = alto - margen - ((v - min) / rango) * (alto - margen * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

// -- 02 · anticipación ----------------------------------------------------------------

/** La regla más cercana a disparar, según el motor (`summary.closest_rule`). */
export function reglaCercana(s: Snapshot): ProximidadRegla | null {
  const reglas = s.analysis?.rule_proximity ?? [];
  const nombre = s.analysis?.summary.closest_rule;
  return reglas.find((r) => r.rule === nombre) ?? reglas[0] ?? null;
}

// -- 03 · contexto ----------------------------------------------------------------

/** Los tres medidores de la landing, en el orden del diseño. */
export const MEDIDORES_LANDING = [
  "p2p_spread_pct",
  "p2p_ratio_oferta_demanda",
  "p2p_momentum_bid_3h_pct",
] as const;

export function medidoresLanding(s: Snapshot): Medidor[] {
  const todos = s.analysis?.indicators ?? [];
  return MEDIDORES_LANDING.flatMap((nombre) => todos.filter((m) => m.indicator === nombre));
}

export interface VistaMedidor {
  /** Posición del valor en la escala de 90 días, de 0 a 100. */
  marcador: number;
  percentil: number | null;
  umbral: number | null;
  /** El tramo de la escala donde la condición se cumple. */
  zona: { izquierda: number; ancho: number } | null;
  cortes: { bajo: string | null; medio: string | null; alto: string | null };
  regla: { nombre: string; cumple: boolean; distancia: string } | null;
}

const porcentaje = (posicion: string): number =>
  Math.min(100, Math.max(0, toChartNumber(posicion) * 100));

export function vistaMedidor(m: Medidor): VistaMedidor {
  // La regla que más dice: una que ya se cumple o, si no, la más cercana.
  const reglas = [...m.rules].sort((a, b) => {
    if (a.met !== b.met) {
      return a.met ? -1 : 1;
    }
    return compararDecimales(absoluto(a.distance), absoluto(b.distance));
  });
  const regla = reglas[0] ?? null;
  const umbral = regla === null ? null : porcentaje(regla.threshold_position);
  const zona =
    regla === null || umbral === null
      ? null
      : regla.op.startsWith("lt")
        ? { izquierda: 0, ancho: umbral }
        : { izquierda: umbral, ancho: 100 - umbral };
  const corte = (clave: string) => m.scale.cuts.find((c) => c.key === clave)?.value ?? null;
  return {
    marcador: m.position === null ? 0 : porcentaje(m.position),
    percentil:
      m.position === null || m.scale.source !== "percentiles"
        ? null
        : Math.round(toChartNumber(m.position) * 100),
    umbral,
    zona,
    cortes: { bajo: corte("p10"), medio: corte("p50"), alto: corte("p90") },
    regla:
      regla === null
        ? null
        : { nombre: regla.rule, cumple: regla.met, distancia: absoluto(regla.distance) },
  };
}

// -- 04 · explicación ---------------------------------------------------------------

export interface Descomposicion {
  oficial: string;
  vwap: string;
  /** Qué parte del precio P2P es la tasa oficial, en %. */
  pctOficial: string;
  pctBrecha: string;
}

export function descomposicion(s: Snapshot): Descomposicion | null {
  const oficial = tasaUsd(s);
  const vwap = s.p2p.buy?.vwap;
  if (!oficial || !vwap) {
    return null;
  }
  const pctOficial = porcentajeRelativo(oficial, vwap, 1);
  if (pctOficial === null) {
    return null;
  }
  return { oficial, vwap, pctOficial, pctBrecha: restarDecimales("100.0", pctOficial) };
}

/** `official_share` (0 a 1) como porcentaje entero para el texto. */
export function cuotaOficial(share: string | null): string | null {
  if (share === null) {
    return null;
  }
  return porcentajeRelativo(share, "1", 0);
}
