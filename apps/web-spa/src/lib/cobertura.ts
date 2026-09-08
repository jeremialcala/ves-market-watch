/**
 * Cuánto cubre de verdad una ventana, y qué hay que decir cuando no llega.
 *
 * ### La regla que gobierna este módulo
 *
 * **El percentil no puede calcularse en silencio sobre una base distinta de la
 * anunciada.** Si se piden 30 días y solo hay 18, el percentil es legítimo —se
 * calcula sobre lo que hay— pero leerlo como «percentil de 30 días» es falso.
 * La única salida honesta es decir las tres cifras: lo pedido, lo disponible y
 * la base real del cálculo.
 *
 * Nada aquí redondea hacia arriba. Un día de tolerancia existe porque una
 * ventana de 30 días servida con bucket de 1 h empieza en el primer bucket
 * disponible y rara vez cubre las 720 horas exactas; más allá de eso, la
 * diferencia es real y se anuncia.
 */

import type { Punto } from "./series";

const DIA_MS = 86_400_000;

/** Tolerancia: por debajo de esto la ventana se considera completa. */
const HOLGURA_DIAS = 1;

/** Días que cubre la serie, del primer punto al último. */
export function diasCubiertos(puntos: readonly Punto[]): number {
  if (puntos.length < 2) {
    return puntos.length === 1 ? 0 : 0;
  }
  return (puntos[puntos.length - 1].t - puntos[0].t) / DIA_MS;
}

export interface Insuficiencia {
  pedidos: number;
  /** Días realmente cubiertos, redondeados hacia ABAJO: no se infla. */
  disponibles: number;
}

/**
 * `null` si la ventana llega, o cuánto le falta.
 *
 * Con menos de dos puntos no hay ventana que medir: eso es el estado «sin
 * datos», que se trata aparte y con su propio bloque.
 */
export function ventanaInsuficiente(
  puntos: readonly Punto[],
  pedidos: number,
): Insuficiencia | null {
  if (puntos.length < 2) {
    return null;
  }
  const disponibles = Math.floor(diasCubiertos(puntos));
  return disponibles + HOLGURA_DIAS < pedidos
    ? { pedidos, disponibles }
    : null;
}

export interface Desfase {
  /** Último instante de la serie que va por detrás. */
  atrasada: number;
  /** Último instante de la que va por delante. */
  adelantada: number;
  /** Diferencia en días, con un decimal. */
  dias: number;
  /** `true` si la que se queda atrás es la tasa oficial. */
  oficialAtrasada: boolean;
}

/**
 * Desfase entre las dos series de la vista, o `null` si van a la par.
 *
 * Importa porque las dos se leen juntas: si la oficial termina el viernes y la
 * evaluada llega al domingo, comparar sus extremos a ojo induce a error. El
 * caso normal en este proyecto es justo ese —el BCV no publica el fin de
 * semana—, así que el aviso tiene que ser tranquilo, no una alarma.
 */
export function desfaseEntre(
  oficial: readonly Punto[],
  evaluada: readonly Punto[],
): Desfase | null {
  if (oficial.length === 0 || evaluada.length === 0) {
    return null;
  }
  const finOficial = oficial[oficial.length - 1].t;
  const finEvaluada = evaluada[evaluada.length - 1].t;
  const dias = Math.abs(finEvaluada - finOficial) / DIA_MS;
  if (dias < HOLGURA_DIAS) {
    return null;
  }
  const oficialAtrasada = finOficial < finEvaluada;
  return {
    atrasada: oficialAtrasada ? finOficial : finEvaluada,
    adelantada: oficialAtrasada ? finEvaluada : finOficial,
    dias: Math.round(dias * 10) / 10,
    oficialAtrasada,
  };
}
