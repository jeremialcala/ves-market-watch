/**
 * El ÚNICO sitio donde se da formato a una variación del Intradía.
 *
 * Estaba repetido en cinco componentes con cinco criterios ligeramente
 * distintos, y por ahí se colaron dos cosas que llegaron a pantalla: un
 * «+0,55 (−232,25 %)» —un porcentaje que contradecía el signo que tenía al
 * lado— y un «+−382,85 %» con el signo duplicado. Ninguna de las dos era un
 * fallo de aritmética: eran cinco formateos distintos del mismo hecho.
 *
 * Las reglas, todas aquí:
 *
 * - **Menos tipográfico U+2212**, nunca el guion ASCII. El guion es un guion;
 *   esto es un signo, y en cifras tabulares tiene el ancho de un dígito.
 * - **«+» explícito solo en positivos.** El signo va escrito siempre porque el
 *   color no puede ser la única pista de la dirección.
 * - **El porcentaje se omite si la apertura no llega a 0,5.** Una sola condición
 *   que cubre los tres casos malos: apertura cero (no existe el cociente),
 *   apertura pequeña (un movimiento de nada sale como «+133 %») y apertura
 *   negativa (el cociente invierte el sentido: de −0,24 a +0,31 es una SUBIDA y
 *   el porcentaje la escribe con menos). La Δ en unidades es exacta siempre y no
 *   depende del signo ni del tamaño de la base.
 * - **Sin cambio se dice**, no se pinta un «+0» que parece movimiento.
 * - **La unidad viaja pegada al valor** con espacio duro, nunca colgada del
 *   nombre de la métrica: el nombre dice qué se mide, la cifra en qué se mide.
 *
 * La dirección la dan el signo y el color. Los triángulos de dirección se
 * retiraron: eran un tercer canal que repetía lo que ya decían los otros dos y
 * que había que traducir mentalmente ("¿es la dirección o el ranking?").
 */

import type { Idioma } from "../i18n/idioma";
import {
  compararDecimales,
  formatDecimal,
  porcentajeRelativo,
  signo,
} from "./decimal";

/** Menos tipográfico. */
export const MENOS = "−";

/** Espacio duro: la unidad no se queda huérfana al final de una línea. */
const DURO = " ";

/**
 * Apertura mínima para que un porcentaje signifique algo.
 *
 * No es un número redondo elegido al azar: por debajo de medio punto, la Δ en
 * unidades y el porcentaje dejan de contar la misma historia —y el porcentaje es
 * el que miente—.
 */
export const APERTURA_MINIMA_PCT = "0.5";

const COLOR_DIRECCION = {
  "-1": "var(--dir-bajista)", // = var(--coral)
  "0": "var(--dir-neutral)", // = var(--text-dim)
  "1": "var(--dir-alcista)", // = var(--teal)
} as const;

export interface DeltaIntradia {
  /** Listo para pintar; ya lleva signo, unidad y porcentaje si procede. */
  texto: string;
  color: string;
  direccion: -1 | 0 | 1;
  /** `true` cuando el valor no se movió: el llamador puede darle su clase. */
  sinCambio: boolean;
}

export interface OpcionesDelta {
  /** Unidad del indicador («VES», «%», «USDT»); vacía si no tiene. */
  unidad?: string;
  decimales?: number;
  idioma?: Idioma;
  /** Texto ya traducido para el caso sin movimiento («— sin cambio»). */
  sinCambio: string;
}

/** Valor absoluto de un decimal exacto, como string. */
function magnitudDe(valor: string): string {
  return valor.startsWith("-") ? valor.slice(1) : valor;
}

/** Cifra con su unidad pegada, y el menos tipográfico si es negativa. */
export function valorConUnidad(
  valor: string,
  {
    unidad = "",
    decimales = 2,
    idioma = "es",
  }: Omit<OpcionesDelta, "sinCambio"> = {},
): string {
  const cuerpo = formatDecimal(magnitudDe(valor), {
    maxDecimales: decimales,
    idioma,
  });
  const conSigno = signo(valor) === -1 ? `${MENOS}${cuerpo}` : cuerpo;
  return unidad === "" ? conSigno : `${conSigno}${DURO}${unidad}`;
}

/**
 * La variación de un indicador dentro del día, con todas las reglas de arriba.
 *
 * `deltaAbs` y `apertura` son los strings exactos del contrato; aquí no se hace
 * aritmética de coma flotante en ningún punto.
 */
export function formatearDelta(
  {
    deltaAbs,
    apertura,
  }: {
    deltaAbs: string;
    /** `null` cuando no hay base contra la que medir (un salto suelto). */
    apertura: string | null;
  },
  { unidad = "", decimales = 2, idioma = "es", sinCambio }: OpcionesDelta,
): DeltaIntradia {
  const direccion = signo(deltaAbs);
  if (direccion === 0) {
    return {
      texto: sinCambio,
      color: COLOR_DIRECCION["0"],
      direccion: 0,
      sinCambio: true,
    };
  }

  const marca = direccion === 1 ? "+" : MENOS;
  const magnitud = formatDecimal(magnitudDe(deltaAbs), {
    maxDecimales: decimales,
    idioma,
  });
  const cuerpo = `${marca}${magnitud}${unidad === "" ? "" : `${DURO}${unidad}`}`;
  const pct = porcentajeSignificativo(deltaAbs, apertura, idioma);

  return {
    texto: pct === null ? cuerpo : `${cuerpo} (${marca}${pct}${DURO}%)`,
    color: COLOR_DIRECCION[String(direccion) as "-1" | "1"],
    direccion,
    sinCambio: false,
  };
}

/**
 * El porcentaje, o `null` si contra esa apertura no dice la verdad.
 *
 * Devuelve la MAGNITUD sin signo: el signo lo pone el llamador, que es el mismo
 * que el de la Δ. Con apertura ≥ 0,5 los dos coinciden siempre, y componerlo así
 * es lo que hace imposible volver a imprimir un «+−382,85 %».
 */
function porcentajeSignificativo(
  deltaAbs: string,
  apertura: string | null,
  idioma: Idioma,
): string | null {
  if (apertura === null || compararDecimales(apertura, APERTURA_MINIMA_PCT) === -1) {
    return null;
  }
  const pct = porcentajeRelativo(deltaAbs, apertura);
  return pct === null
    ? null
    : formatDecimal(magnitudDe(pct), { maxDecimales: 2, idioma });
}
