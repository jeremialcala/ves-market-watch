/**
 * Cuánto del precio P2P explica la pierna oficial.
 *
 * Se deriva de la brecha vigente: si el P2P está un `b` % por encima de la
 * oficial, la oficial es `100 / (1 + b/100)` por ciento del precio.
 *
 * **Se calcula y no se cablea a propósito.** El enunciado del bloque traía un
 * «88 %» fijo; el día que se implementó eran 85,1 y la cifra se mueve con el
 * mercado. Un número cosido a la frase la habría dejado diciendo algo falso con
 * toda naturalidad, y sin que ninguna prueba se enterara.
 */

import { toChartNumber } from "./decimal";

export function parteDelPrecio(brechaPct: string | null): number | null {
  if (brechaPct === null) {
    return null;
  }
  const brecha = toChartNumber(brechaPct);
  const parte = 100 / (1 + brecha / 100);
  // Una brecha de -100 % anularía el divisor, y una que deje la parte fuera de
  // (0, ...] no describe nada: mejor sin dato que con un número imposible.
  return Number.isFinite(parte) && parte > 0 ? Math.round(parte * 10) / 10 : null;
}
