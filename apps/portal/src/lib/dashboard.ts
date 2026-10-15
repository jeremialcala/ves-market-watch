/**
 * Lo que el Dashboard (RF-2) deriva del snapshot y de las series. Funciones
 * puras, como `lectura.ts`: los componentes solo pintan.
 *
 * Decimales como cadena exacta (ADR-0017). `toChartNumber` solo para
 * posiciones y anchos en pantalla, nunca para una cifra que se lee.
 */

import {
  compararDecimales,
  formatDecimal,
  restarDecimales,
  toChartNumber,
  type Idioma,
} from "@criterio/ui";

import type { Medidor, Snapshot } from "../api/cliente";
import type { Clave } from "../i18n/dict";
import { absoluto } from "./lectura";

type Analisis = NonNullable<Snapshot["analysis"]>;
type Claim = NonNullable<Analisis["reading"]>["claims"][number];
export type Senal = Snapshot["signals"]["items"][number];
type NivelProfundidad = NonNullable<Snapshot["depth"]["buy"]>["levels"][number];

export interface Frase {
  clave: Clave;
  params: Record<string, string | number>;
}

// -- lectura de hoy ------------------------------------------------------------------

/**
 * Una frase por afirmación del motor, en su orden: lo que invalida al resto va
 * primero. Un código sin frase propia se omite (el motor puede estrenar
 * códigos antes que el diccionario). La lectura describe el presente: ninguna
 * frase dice qué hacer.
 */
export function frasesLectura(claims: readonly Claim[], idioma: Idioma): Frase[] {
  const pts = (v: string | undefined) => formatDecimal(absoluto(v ?? "0"), { maxDecimales: 2, idioma });
  const frases: Frase[] = [];
  for (const { code, data } of claims) {
    const lado = data.lado ?? "buy";
    switch (code) {
      case "confianza_baja":
        frases.push({ clave: "lectura.claim.confianzaBaja", params: {} });
        break;
      case "oficial_rancia":
        frases.push({ clave: "lectura.claim.oficialRancia", params: {} });
        break;
      case "brecha":
        if (data.direccion === "ampliando" || data.direccion === "comprimiendo" || data.direccion === "estable") {
          frases.push({
            clave: `lectura.claim.brecha.${data.direccion}`,
            params: { delta: pts(data.delta_pp), horas: data.horas ?? "" },
          });
        }
        break;
      case "atribucion":
        if (data.responsable === "oficial" || data.responsable === "paralelo" || data.responsable === "ambos") {
          frases.push({ clave: `lectura.claim.atribucion.${data.responsable}`, params: {} });
        }
        break;
      case "medidor_en_banda":
        if (data.banda === "very_low" || data.banda === "very_high") {
          frases.push({ clave: `lectura.claim.banda.${data.banda}`, params: { dias: data.dias ?? "" } });
        }
        break;
      case "regla_cerca":
        frases.push({
          clave: "lectura.claim.reglaCerca",
          params: { regla: data.regla ?? "", cumplidas: data.cumplidas ?? "", totales: data.totales ?? "" },
        });
        break;
      case "brecha_vs_historia": {
        const clave =
          data.posicion === "por_encima"
            ? "lectura.claim.historia.porEncima"
            : data.posicion === "por_debajo"
              ? "lectura.claim.historia.porDebajo"
              : "lectura.claim.historia.enLinea";
        frases.push({ clave, params: { lado, dias: data.dias ?? "", delta: pts(data.delta_pp) } });
        break;
      }
      case "brecha_extremo":
        frases.push({
          clave: data.tipo === "maximo" ? "lectura.claim.historia.maximo" : "lectura.claim.historia.minimo",
          params: { lado, dias: data.dias ?? "" },
        });
        break;
      case "historia_parcial":
        frases.push({
          clave: "lectura.claim.historia.parcial",
          params: { lado, dias: data.dias ?? "", ventana: data.ventana ?? "" },
        });
        break;
      default:
        break;
    }
  }
  return frases;
}

/** Reglas con todas sus condiciones cumplidas ahora mismo (no señales emitidas). */
export function reglasCumplidas(s: Snapshot): number {
  return (s.analysis?.rule_proximity ?? []).filter(
    (r) => r.evaluable && r.conditions_total > 0 && r.conditions_met === r.conditions_total,
  ).length;
}

// -- brecha -----------------------------------------------------------------------

/** Mínimo y máximo de una serie, exactos. `null` sin puntos. */
export function extremos(puntos: readonly { value: string }[]): { min: string; max: string } | null {
  if (puntos.length === 0) {
    return null;
  }
  let min = puntos[0].value;
  let max = puntos[0].value;
  for (const { value } of puntos) {
    if (compararDecimales(value, min) < 0) {
      min = value;
    }
    if (compararDecimales(value, max) > 0) {
      max = value;
    }
  }
  return { min, max };
}

function referencias(s: Snapshot, lado: "buy" | "sell") {
  return s.analysis?.gap_history?.sides.find((l) => l.side === lado) ?? null;
}

/** La brecha buy de hoy menos su media de 30 días, en puntos. */
export function deltaVsTreintaDias(s: Snapshot): { delta: string; media: string } | null {
  const actual = s.gap?.pct;
  const media = referencias(s, "buy")?.references.find((r) => r.days_configured === 30)?.mean;
  if (!actual || !media) {
    return null;
  }
  return { delta: restarDecimales(actual, media), media };
}

export interface Comparativa {
  clave: "hoy" | "media7" | "media30" | "max90";
  valor: string;
  /** Días que la ventana cubre de verdad, si son menos de los configurados. */
  cubiertos: number | null;
  /** Ancho de la barra, de 0 a 100, contra el máximo de 90 días. */
  ancho: number;
}

/** «Brecha hoy vs. historia»: hoy, medias de 7 y 30 días y máximo de 90. */
export function comparativasBrecha(s: Snapshot): Comparativa[] {
  const lado = referencias(s, "buy");
  const actual = s.gap?.pct ?? lado?.current ?? null;
  if (lado === null || actual === null) {
    return [];
  }
  const ref = (dias: number) => lado.references.find((r) => r.days_configured === dias) ?? null;
  const r7 = ref(7);
  const r30 = ref(30);
  const r90 = ref(90);
  const tope = r90?.max ?? null;
  const ancho = (valor: string) =>
    tope === null || toChartNumber(tope) <= 0
      ? 0
      : Math.min(100, Math.max(0, (toChartNumber(valor) / toChartNumber(tope)) * 100));
  const parcial = (r: { days_configured: number; days_covered: number }) =>
    r.days_covered < r.days_configured ? r.days_covered : null;
  const filas: Comparativa[] = [{ clave: "hoy", valor: actual, cubiertos: null, ancho: ancho(actual) }];
  if (r7?.mean) {
    filas.push({ clave: "media7", valor: r7.mean, cubiertos: parcial(r7), ancho: ancho(r7.mean) });
  }
  if (r30?.mean) {
    filas.push({ clave: "media30", valor: r30.mean, cubiertos: parcial(r30), ancho: ancho(r30.mean) });
  }
  if (r90?.max) {
    filas.push({ clave: "max90", valor: r90.max, cubiertos: parcial(r90), ancho: 100 });
  }
  return filas;
}

/** El percentil de 90 días de la brecha buy de hoy, si hay escala. */
export function percentilBrecha(s: Snapshot): number | null {
  const m = s.analysis?.indicators.find((i) => i.indicator === "p2p_brecha_pct_buy");
  if (!m || m.position === null || m.scale.source !== "percentiles") {
    return null;
  }
  return Math.round(toChartNumber(m.position) * 100);
}

// -- panel de instrumentos ------------------------------------------------------------

/** Los seis medidores del diseño. */
export const MEDIDORES_DASHBOARD = [
  "p2p_spread_pct",
  "p2p_ratio_oferta_demanda",
  "p2p_momentum_bid_3h_pct",
  "p2p_drenaje_oferta_6h_pct",
  "p2p_brecha_pct_buy",
  "p2p_outliers_pct_buy",
] as const;

/**
 * Lo cerca que está un medidor de disparar, comparable entre medidores: la
 * distancia en la escala de 90 días (0 a 1) entre el valor y el umbral más
 * próximo. Una condición ya cumplida va antes que cualquiera; sin reglas o
 * sin posición, al final.
 */
export function cercania(m: Medidor): number {
  if (m.rules.some((r) => r.met)) {
    return -1;
  }
  if (m.position === null || m.rules.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  const posicion = toChartNumber(m.position);
  return Math.min(...m.rules.map((r) => Math.abs(posicion - toChartNumber(r.threshold_position))));
}

/** «Primero el más cerca de su umbral»; a igual cercanía, el orden del diseño. */
export function medidoresDashboard(s: Snapshot): Medidor[] {
  const todos = s.analysis?.indicators ?? [];
  const elegidos = MEDIDORES_DASHBOARD.flatMap((nombre) => todos.filter((m) => m.indicator === nombre));
  return elegidos
    .map((m, orden) => ({ m, orden, c: cercania(m) }))
    .sort((a, b) => (a.c === b.c ? a.orden - b.orden : a.c < b.c ? -1 : 1))
    .map(({ m }) => m);
}

// -- mapa de calor ------------------------------------------------------------------

const VET_MS = -4 * 3600 * 1000; // Venezuela, UTC−4 todo el año

export interface FilaCalor {
  /** El día en hora de Caracas, `AAAA-MM-DD`. */
  dia: string;
  /** Las 24 horas VET; `null` donde no hubo dato. */
  celdas: (string | null)[];
}

export interface MapaCalor {
  filas: FilaCalor[];
  p10: number | null;
  p90: number | null;
}

function cuantil(ordenados: readonly number[], p: number): number {
  return ordenados[Math.min(ordenados.length - 1, Math.max(0, Math.round(p * (ordenados.length - 1))))];
}

/**
 * Los puntos horarios en una rejilla de `dias` × 24 horas VET, del más
 * antiguo al de hoy. Los cortes p10 y p90 son los de la propia ventana: la
 * escala del color dice «alto para estos días», no para los 90.
 */
export function mapaCalor(puntos: readonly { t: string; value: string }[], dias = 14): MapaCalor {
  const porDia = new Map<string, (string | null)[]>();
  let ultimo: number | null = null;
  for (const { t, value } of puntos) {
    const ms = Date.parse(t);
    if (Number.isNaN(ms)) {
      continue;
    }
    const vet = new Date(ms + VET_MS);
    const dia = vet.toISOString().slice(0, 10);
    const celdas = porDia.get(dia) ?? Array<string | null>(24).fill(null);
    celdas[vet.getUTCHours()] = value;
    porDia.set(dia, celdas);
    ultimo = ultimo === null ? ms : Math.max(ultimo, ms);
  }
  if (ultimo === null) {
    return { filas: [], p10: null, p90: null };
  }
  const filas: FilaCalor[] = [];
  const hoy = Date.parse(new Date(ultimo + VET_MS).toISOString().slice(0, 10));
  for (let d = dias - 1; d >= 0; d--) {
    const dia = new Date(hoy - d * 86_400_000).toISOString().slice(0, 10);
    filas.push({ dia, celdas: porDia.get(dia) ?? Array<string | null>(24).fill(null) });
  }
  const valores = filas
    .flatMap((f) => f.celdas)
    .filter((v): v is string => v !== null)
    .map(toChartNumber)
    .sort((a, b) => a - b);
  return {
    filas,
    p10: valores.length === 0 ? null : cuantil(valores, 0.1),
    p90: valores.length === 0 ? null : cuantil(valores, 0.9),
  };
}

export type TonoCalor = { tono: "sage" | "teal" | "coral"; intensidad: number };

/** Sage abajo, teal en medio, coral **solo** por encima del p90. */
export function tonoCalor(valor: string, p10: number, p90: number): TonoCalor {
  const v = toChartNumber(valor);
  if (v > p90) {
    return { tono: "coral", intensidad: 1 };
  }
  const rango = p90 - p10 || 1;
  const t = Math.min(1, Math.max(0, (v - p10) / rango));
  return t < 0.5 ? { tono: "sage", intensidad: 0.25 + t } : { tono: "teal", intensidad: 0.25 + t * 0.6 };
}

// -- cronología de señales -------------------------------------------------------------

export interface GrupoSenales {
  tipo: string;
  direccion: string;
  /** Las señales del tipo, de la más reciente a la más antigua. */
  instancias: Senal[];
}

/**
 * Agrupadas por regla, con la que disparó más recientemente primero. Solo
 * historia: cuántas veces disparó y qué hizo la brecha después de cada una.
 * Nada de «N de M» (RF-2): un recuento de aciertos se lee como pronóstico.
 */
export function gruposSenales(items: readonly Senal[]): GrupoSenales[] {
  const ordenadas = [...items].sort((a, b) => Date.parse(b.as_of) - Date.parse(a.as_of));
  const grupos: GrupoSenales[] = [];
  for (const senal of ordenadas) {
    let grupo = grupos.find((g) => g.tipo === senal.type);
    if (grupo === undefined) {
      grupo = { tipo: senal.type, direccion: senal.direction, instancias: [] };
      grupos.push(grupo);
    }
    grupo.instancias.push(senal);
  }
  return grupos;
}

// -- profundidad --------------------------------------------------------------------

export interface FilaProfundidad {
  precio: string;
  volumen: string;
  /** Ancho de la barra, de 0 a 100, contra el nivel más profundo del lado. */
  ancho: number;
}

export function filasProfundidad(niveles: readonly NivelProfundidad[]): FilaProfundidad[] {
  const tope = Math.max(0, ...niveles.map((n) => toChartNumber(n.cum_volume)));
  return niveles.map((n) => ({
    precio: n.price_band,
    volumen: n.cum_volume,
    ancho: tope <= 0 ? 0 : (toChartNumber(n.cum_volume) / tope) * 100,
  }));
}

/** «79 k», «2,24 M»: el volumen de una barra, para leerlo de un vistazo. */
export function volumenCorto(valor: string, idioma: Idioma): string {
  const n = toChartNumber(valor);
  if (Math.abs(n) >= 1_000_000) {
    return `${formatDecimal((n / 1_000_000).toFixed(2), { maxDecimales: 2, minDecimales: 2, idioma })} M`;
  }
  if (Math.abs(n) >= 1_000) {
    return `${formatDecimal(Math.round(n / 1_000).toString(), { maxDecimales: 0, idioma })} k`;
  }
  return formatDecimal(Math.round(n).toString(), { maxDecimales: 0, idioma });
}
