/**
 * Lógica del tooltip de los gráficos: qué punto, qué contexto y dónde cabe.
 *
 * Todo lo que decide **qué se dice** vive aquí y no en el componente, para que
 * se pueda probar sin montar un SVG ni simular un puntero.
 */

import { compararDecimales, restarDecimales } from "./decimal";
import type { Punto } from "./series";

/** A qué distancia del borde se voltea el tooltip, en píxeles reales. */
export const MARGEN_VOLTEO = 140;

export type Anclaje = "centro" | "izquierda" | "derecha";

/**
 * Punto más cercano a una posición horizontal, **en tiempo**.
 *
 * El eje es temporal, así que no vale con dividir por el número de puntos: con
 * huecos —los fines de semana sin fecha-valor del BCV— el índice y la posición
 * dejan de corresponderse, y el tooltip señalaría un día distinto del que está
 * bajo el cursor.
 */
export function puntoMasCercano(
  puntos: readonly Punto[],
  fraccion: number,
): number | null {
  if (puntos.length === 0) {
    return null;
  }
  const desde = puntos[0].t;
  const lapso = puntos[puntos.length - 1].t - desde;
  if (lapso <= 0) {
    return 0;
  }
  const objetivo = desde + fraccion * lapso;
  let mejor = 0;
  let distancia = Math.abs(puntos[0].t - objetivo);
  for (let i = 1; i < puntos.length; i++) {
    const d = Math.abs(puntos[i].t - objetivo);
    if (d < distancia) {
      mejor = i;
      distancia = d;
    }
  }
  return mejor;
}

/** Posición horizontal de un punto dentro del gráfico, en 0–1. */
export function fraccionDe(puntos: readonly Punto[], indice: number): number {
  const desde = puntos[0].t;
  const lapso = puntos[puntos.length - 1].t - desde;
  return lapso <= 0 ? 0 : (puntos[indice].t - desde) / lapso;
}

export interface ContextoPunto {
  /** Posición del valor en la distribución de la ventana, 0–100. */
  percentil: number;
  /** `valor − mediana`, exacto y con signo. */
  distancia: string;
}

/**
 * Dónde cae este punto respecto de su propia ventana.
 *
 * Es la tercera línea del tooltip: sin ella, un número suelto no dice si es
 * mucho. Se calcula con la misma regla que el panel rector —empates a la
 * mitad—, para que una serie plana dé 50 y no 0.
 */
export function contextoPunto(
  puntos: readonly Punto[],
  indice: number,
  mediana: string,
): ContextoPunto {
  const valor = puntos[indice].valor;
  const valores = puntos.map((p) => p.valor);
  const menores = valores.filter((v) => compararDecimales(v, valor) < 0).length;
  const iguales = valores.filter((v) => compararDecimales(v, valor) === 0).length;
  return {
    percentil: Math.round(((menores + iguales / 2) / valores.length) * 100),
    distancia: restarDecimales(valor, mediana),
  };
}

/**
 * Cómo anclar el tooltip para que no se salga.
 *
 * Se **voltea**, no se recorta: un tooltip cortado por el borde esconde
 * justamente la cifra, que es lo único que se ha ido a mirar.
 */
export function anclajeTooltip(xPx: number, anchoPx: number): Anclaje {
  if (xPx < MARGEN_VOLTEO) {
    return "izquierda";
  }
  if (anchoPx - xPx < MARGEN_VOLTEO) {
    return "derecha";
  }
  return "centro";
}

/** `transform` del tooltip: 8 px por encima del punto, anclado según quepa. */
export function transformTooltip(anclaje: Anclaje): string {
  const x =
    anclaje === "izquierda" ? "0" : anclaje === "derecha" ? "-100%" : "-50%";
  return `translate(${x}, calc(-100% - 8px))`;
}
