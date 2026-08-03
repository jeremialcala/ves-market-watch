/**
 * Intradía = el día operativo de Venezuela (VET), tal como lo define el
 * glosario: «Variación Intradía — cambio de un indicador dentro del día
 * operativo (VET)». La Δ se mide siempre contra la APERTURA de ese día
 * (`docs/01-requirements/motor-indicadores.md`), no contra las 24 h móviles.
 *
 * VET es UTC−4 fijo: Venezuela no aplica horario de verano desde 2016, así que
 * el desplazamiento es constante y no hace falta una tz database en el cliente.
 */

import { porcentajeRelativo, restarDecimales, signo } from "./decimal";

/** Desplazamiento de VET respecto de UTC, en minutos. */
export const VET_OFFSET_MIN = -240;

/** Instante UTC de las 00:00 VET del día operativo que contiene a `ahora`. */
export function inicioDiaVET(ahora: Date): Date {
  const enVET = new Date(ahora.getTime() + VET_OFFSET_MIN * 60_000);
  const medianoche = Date.UTC(
    enVET.getUTCFullYear(),
    enVET.getUTCMonth(),
    enVET.getUTCDate(),
  );
  return new Date(medianoche - VET_OFFSET_MIN * 60_000);
}

/** Hora del día en VET, para los ejes y tooltips del intradía. */
export function horaVET(t: number): string {
  const enVET = new Date(t + VET_OFFSET_MIN * 60_000);
  const hh = String(enVET.getUTCHours()).padStart(2, "0");
  const mm = String(enVET.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Fecha del día operativo en curso, escrita en VET. */
export function etiquetaDiaVET(ahora: Date): string {
  // Se corre el instante a VET y se formatea en UTC: así la fecha impresa es
  // la del día operativo, sin depender de la zona horaria del navegador.
  return new Intl.DateTimeFormat("es-VE", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(ahora.getTime() + VET_OFFSET_MIN * 60_000));
}

/**
 * Lado del mercado — es lo ÚNICO que codifica el color en la parrilla
 * (azul compra / naranja venta / aqua sin lado), igual que en DepthChart.
 * Nunca codifica el grupo ni el signo de la Δ: el signo va en glifo + texto.
 */
export type Lado = "compra" | "venta" | "sin-lado";

export function ladoDe(indicador: string): Lado {
  if (indicador.endsWith("_buy")) {
    return "compra";
  }
  if (indicador.endsWith("_sell")) {
    return "venta";
  }
  return "sin-lado";
}

export type Grupo = "oficial" | "compra" | "venta" | "microestructura";

export const TITULO_GRUPO: Record<Grupo, string> = {
  oficial: "Tasa oficial (BCV)",
  compra: "P2P — compra (buy)",
  venta: "P2P — venta (sell)",
  microestructura: "Microestructura",
};

/** Orden de presentación de los grupos en la parrilla. */
export const ORDEN_GRUPOS: readonly Grupo[] = [
  "oficial",
  "compra",
  "venta",
  "microestructura",
];

export function grupoDe(indicador: string): Grupo {
  if (indicador.startsWith("official_rate")) {
    return "oficial";
  }
  const lado = ladoDe(indicador);
  return lado === "sin-lado" ? "microestructura" : lado;
}

/** El lado que pinta a un grupo entero (oficial y microestructura no tienen). */
export function ladoDeGrupo(grupo: Grupo): Lado {
  return grupo === "compra" || grupo === "venta" ? grupo : "sin-lado";
}

export const ETIQUETA_LADO: Record<Lado, string> = {
  compra: "compra",
  venta: "venta",
  "sin-lado": "sin lado",
};

/**
 * Catálogo de presentación. NO es una lista blanca: la parrilla dibuja todo lo
 * que devuelva el gateway, y un indicador nuevo aparece solo (con su nombre
 * canónico como etiqueta) sin tocar este archivo.
 */
interface Presentacion {
  etiqueta: string;
  unidad: string;
  decimales: number;
}

const BASE_P2P: Record<string, Presentacion> = {
  p2p_mediana: { etiqueta: "Mediana", unidad: "VES", decimales: 4 },
  p2p_vwap: { etiqueta: "VWAP", unidad: "VES", decimales: 4 },
  p2p_mejor_precio: { etiqueta: "Mejor precio", unidad: "VES", decimales: 4 },
  p2p_liquidez: { etiqueta: "Liquidez", unidad: "USDT", decimales: 0 },
  p2p_merchants_pct: { etiqueta: "Merchants", unidad: "%", decimales: 2 },
  p2p_outliers_pct: { etiqueta: "Outliers", unidad: "%", decimales: 2 },
  p2p_brecha_abs: { etiqueta: "Brecha", unidad: "VES", decimales: 4 },
  p2p_brecha_pct: { etiqueta: "Brecha", unidad: "%", decimales: 2 },
};

const SIN_LADO: Record<string, Presentacion> = {
  official_rate: { etiqueta: "Tasa oficial", unidad: "VES", decimales: 4 },
  official_rate_change_abs: { etiqueta: "Δ oficial", unidad: "VES", decimales: 4 },
  official_rate_change_pct: { etiqueta: "Δ oficial", unidad: "%", decimales: 2 },
  p2p_spread_pct: { etiqueta: "Spread", unidad: "%", decimales: 2 },
  p2p_ratio_oferta_demanda: {
    etiqueta: "Ratio oferta/demanda",
    unidad: "",
    decimales: 3,
  },
  p2p_momentum_bid_3h_pct: { etiqueta: "Momentum bid 3 h", unidad: "%", decimales: 2 },
  p2p_drenaje_oferta_6h_pct: {
    etiqueta: "Drenaje oferta 6 h",
    unidad: "%",
    decimales: 2,
  },
};

const SUFIJO_LADO = /_(buy|sell)$/;

export function presentacionDe(indicador: string): Presentacion {
  const sinLado = SIN_LADO[indicador];
  if (sinLado !== undefined) {
    return sinLado;
  }
  const base = BASE_P2P[indicador.replace(SUFIJO_LADO, "")];
  return base ?? { etiqueta: indicador, unidad: "", decimales: 4 };
}

export interface PuntoIntradia {
  /** Epoch ms del bucket. */
  t: number;
  /** Valor exacto del contrato (string), nunca float. */
  valor: string;
}

export interface ResumenIntradia {
  apertura: string;
  ultimo: string;
  deltaAbs: string;
  /** `null` cuando la apertura es cero: se muestra «—», jamás ∞ ni NaN. */
  deltaPct: string | null;
  /** Signo de la Δ: -1 baja, 0 plano, 1 sube. */
  direccion: -1 | 0 | 1;
}

/**
 * Resumen de la serie de un indicador dentro del día. `puntos` debe venir en
 * orden cronológico: la apertura es el primer bucket del día VET.
 */
export function resumenIntradia(
  puntos: readonly PuntoIntradia[],
): ResumenIntradia | null {
  if (puntos.length === 0) {
    return null;
  }
  const apertura = puntos[0].valor;
  const ultimo = puntos[puntos.length - 1].valor;
  const deltaAbs = restarDecimales(ultimo, apertura);
  return {
    apertura,
    ultimo,
    deltaAbs,
    deltaPct: porcentajeRelativo(deltaAbs, apertura),
    direccion: signo(deltaAbs),
  };
}


/**
 * Sello de frescura en hora de Venezuela: «1 ago · 14:32 VET».
 *
 * El desplazamiento se aplica al instante y luego se formatea **en UTC**: así el
 * nombre del mes sale localizado sin depender de que el runtime traiga la base
 * de zonas IANA, que en jsdom no está garantizada. Es el mismo truco que usa
 * `partesVET` para la parrilla del mapa de calor.
 */
export function selloVET(iso: string, idioma: "es" | "en"): string {
  const enVET = new Date(Date.parse(iso) + VET_OFFSET_MIN * 60_000);
  const mes = new Intl.DateTimeFormat(idioma === "es" ? "es-VE" : "en-US", {
    month: "short",
    timeZone: "UTC",
  }).format(enVET);
  const hh = String(enVET.getUTCHours()).padStart(2, "0");
  const mm = String(enVET.getUTCMinutes()).padStart(2, "0");
  return `${enVET.getUTCDate()} ${mes.replace(".", "")} · ${hh}:${mm} VET`;
}
