/**
 * Intradía = el día operativo de Venezuela (VET), tal como lo define el
 * glosario: «Variación Intradía — cambio de un indicador dentro del día
 * operativo (VET)». La Δ se mide siempre contra la APERTURA de ese día
 * (`docs/01-requirements/motor-indicadores.md`), no contra las 24 h móviles.
 *
 * VET es UTC−4 fijo: Venezuela no aplica horario de verano desde 2016, así que
 * el desplazamiento es constante y no hace falta una tz database en el cliente.
 */

import type { Clave } from "../i18n/dict";
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

/**
 * Fecha del día operativo en curso, escrita en VET y en el idioma de la interfaz
 * («6 ago» / «Aug 6»).
 *
 * El idioma es parámetro y no una constante: dentro de una frase en inglés, un
 * «jueves, 6 de agosto de 2026» delata que la fecha se formateó en otro sitio.
 */
export function etiquetaDiaVET(ahora: Date, idioma: "es" | "en" = "es"): string {
  // Se corre el instante a VET y se formatea en UTC: así la fecha impresa es
  // la del día operativo, sin depender de la zona horaria del navegador.
  return new Intl.DateTimeFormat(idioma === "en" ? "en-GB" : "es-VE", {
    day: "numeric",
    month: "short",
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
 * Catálogo de series: el ÚNICO sitio donde vive el par etiqueta ↔ clave.
 *
 * La tabla enfrentada, las tarjetas de «qué se movió», las de microestructura y
 * la cronología nombran la misma serie igual porque todas leen de aquí. Antes
 * cada bloque componía su rótulo, y en inglés salían en español porque las
 * etiquetas estaban cableadas en este archivo.
 *
 * **La clave es la del CONTRATO, no una inventada.** Es lo que se escribe en una
 * consulta, en un ticket o en el CSV: `p2p_brecha_abs`, `p2p_liquidez`,
 * `p2p_drenaje_oferta_6h_pct`. Un rótulo bonito que no exista en `indicators`
 * sería un identificador que falla en cuanto alguien lo copia, y RF-9 es
 * explícito en que el vocabulario del contrato no se traduce ni se maquilla.
 *
 * NO es una lista blanca: la vista dibuja todo lo que devuelva el gateway, y un
 * indicador nuevo aparece solo —con su nombre canónico como etiqueta— sin tocar
 * este archivo (RF-7).
 */
export interface Presentacion {
  /** Clave i18n de la etiqueta legible; `null` si no está en el catálogo. */
  etiqueta: Clave | null;
  /** Nombre canónico, tal cual viaja en el contrato. */
  clave: string;
  unidad: string;
  decimales: number;
  /**
   * Qué decir cuando la serie entera vale cero, o `null` si no hay lectura.
   *
   * En `p2p_outliers_pct` el cero **es el resultado deseado**: significa que el
   * filtro MAD/IQR no tuvo que descartar ningún anuncio. Una chispa plana y un
   * «0 %» lo cuentan como si faltara el dato; con su frase, se lee como lo que
   * es. Donde el proyecto no tenga una lectura del cero, `null` y la serie se
   * pinta normal: inventarle una sería afirmar algo sobre un indicador que nadie
   * ha interpretado.
   */
  etiquetaCero: Clave | null;
}

type Entrada = {
  etiqueta: Clave;
  unidad: string;
  decimales: number;
  etiquetaCero?: Clave;
};

const BASE_P2P: Record<string, Entrada> = {
  p2p_brecha_abs: { etiqueta: "serie.brechaAbs", unidad: "VES", decimales: 4 },
  p2p_brecha_pct: { etiqueta: "serie.brechaPct", unidad: "%", decimales: 2 },
  p2p_liquidez: { etiqueta: "serie.liquidez", unidad: "USDT", decimales: 0 },
  p2p_mediana: { etiqueta: "serie.mediana", unidad: "VES", decimales: 4 },
  p2p_mejor_precio: { etiqueta: "serie.mejorPrecio", unidad: "VES", decimales: 4 },
  p2p_mejor_precio_filtrado: {
    etiqueta: "serie.mejorPrecioFiltrado",
    unidad: "VES",
    decimales: 4,
  },
  p2p_merchants_pct: { etiqueta: "serie.merchants", unidad: "%", decimales: 2 },
  p2p_outliers_pct: {
    etiqueta: "serie.outliers",
    unidad: "%",
    decimales: 2,
    etiquetaCero: "cero.sinOutliers",
  },
  p2p_vwap: { etiqueta: "serie.vwap", unidad: "VES", decimales: 4 },
};

const SIN_LADO: Record<string, Entrada> = {
  official_rate: { etiqueta: "serie.oficial", unidad: "VES", decimales: 4 },
  official_rate_change_abs: {
    etiqueta: "serie.oficialDeltaAbs",
    unidad: "VES",
    decimales: 4,
  },
  official_rate_change_pct: {
    etiqueta: "serie.oficialDeltaPct",
    unidad: "%",
    decimales: 2,
  },
  p2p_drenaje_oferta_6h_pct: {
    etiqueta: "serie.drenaje",
    unidad: "%",
    decimales: 2,
  },
  p2p_momentum_bid_3h_pct: { etiqueta: "serie.momentum", unidad: "%", decimales: 2 },
  p2p_ratio_oferta_demanda: { etiqueta: "serie.ratio", unidad: "", decimales: 3 },
  p2p_spread_pct: { etiqueta: "serie.spread", unidad: "%", decimales: 2 },
};

const SUFIJO_LADO = /_(buy|sell)$/;

/**
 * Presentación de un indicador. `indicador` puede venir con sufijo de lado
 * (`p2p_vwap_sell`) o sin él (`p2p_vwap`, la familia que enfrenta la tabla);
 * `clave` devuelve lo que se le pasó, porque es el identificador de ESO.
 */
export function presentacionDe(indicador: string): Presentacion {
  const sinLado = SIN_LADO[indicador];
  if (sinLado !== undefined) {
    return { etiquetaCero: null, ...sinLado, clave: indicador };
  }
  const base = BASE_P2P[indicador.replace(SUFIJO_LADO, "")];
  return base === undefined
    ? {
        etiqueta: null,
        clave: indicador,
        unidad: "",
        decimales: 4,
        etiquetaCero: null,
      }
    : { etiquetaCero: null, ...base, clave: indicador };
}

/**
 * `true` cuando TODOS los puntos de la sesión valen cero.
 *
 * Es «todos», no «el último» ni «no se movió»: la frase que dispara —«sin
 * outliers en la sesión»— habla del día entero, y una serie que tuvo outliers a
 * media mañana y ahora está en cero la desmentiría. Hoy mismo, sin ir más lejos,
 * el lado venta lleva 128 lecturas no nulas.
 */
export function serieEnCero(puntos: readonly PuntoIntradia[]): boolean {
  return puntos.length > 0 && puntos.every((p) => signo(p.valor) === 0);
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
  /**
   * `null` cuando la apertura NO es positiva: se omite el porcentaje.
   *
   * Con apertura cero no hay porcentaje que dar (∞), y con apertura negativa el
   * que sale miente el sentido: el momentum abrió en −0,24 y está en +0,31, una
   * subida, y el cociente lo escribía «−232 %» junto a una Δ de «+0,55». La
   * variación en puntos es exacta y no depende del signo de la base; el
   * porcentaje sobre una base con signo, no.
   */
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
    deltaPct:
      signo(apertura) === 1 ? porcentajeRelativo(deltaAbs, apertura) : null,
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
