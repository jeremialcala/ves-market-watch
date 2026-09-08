/**
 * Episodios comparables: qué pasó las últimas veces que el libro se parecía.
 *
 * **La similitud se calcula, no se elige a mano.** Cada señal pasada trae en
 * `evidence.inputs` los valores exactos que dispararon su regla; el estado de
 * hoy trae los suyos en `rule_proximity`. La distancia entre ambos, normalizada
 * **por las condiciones del ruleset**, ordena los episodios. Elegir tres a dedo
 * habría producido la misma pantalla diciendo algo que no es.
 *
 * ### Por qué se normaliza por el umbral
 *
 * Cada condición vive en su propia escala: un momentum en puntos porcentuales y
 * un ratio oferta/demanda adimensional no se pueden restar y promediar sin más.
 * El **umbral** es la escala que el propio ruleset considera significativa para
 * esa condición —es donde decide—, así que dividir por él pone las tres
 * distancias en la misma unidad: «cuántos umbrales de distancia».
 *
 * ### Lo que esto NO es
 *
 * No es una tasa de acierto ni una predicción. `outcome` es **historia
 * observada** —lo que hizo la brecha después— y así se presenta, sin veredicto
 * y sin agregar un «N de M» que se leería como acierto (no-objetivo del PRD, y
 * la misma línea que fija `historialReglas.ts`).
 */

import type { Analisis, Senal } from "../api/endpoints";
import { compararDecimales, restarDecimales, toChartNumber } from "./decimal";

/** Evita dividir por cero cuando un umbral es 0. */
const EPSILON = 1e-9;

export interface CondicionEpisodio {
  indicador: string;
  /** Valor que tenía cuando la regla disparó. */
  entonces: string | null;
  /** Valor vigente ahora, o `null` si el indicador no está vigente. */
  hoy: string | null;
  umbral: string;
  /** Hoy cae del mismo lado del umbral que entonces. */
  coincide: boolean;
}

export interface Episodio {
  senal: Senal;
  /** 0–100. Cuánto se parece el estado de hoy al de aquel momento. */
  similitud: number;
  condiciones: CondicionEpisodio[];
}

function lado(valor: string, umbral: string): -1 | 0 | 1 {
  return compararDecimales(valor, umbral);
}

/**
 * Condiciones de la regla que disparó `senal`, emparejadas con el estado de hoy.
 *
 * La regla se busca en `rule_proximity` por su identificador versionado: si el
 * ruleset cambió de versión desde aquel episodio, no hay pareja y el episodio
 * se descarta en vez de compararse contra condiciones que ya no son las suyas.
 */
function emparejar(senal: Senal, analisis: Analisis): CondicionEpisodio[] | null {
  const proximidad = analisis.rule_proximity.find(
    (r) => r.rule === senal.evidence.rule,
  );
  if (proximidad === undefined) {
    return null;
  }
  const entradas = senal.evidence.inputs as Record<string, unknown>;
  return proximidad.conditions.map((c) => {
    const bruto = entradas[c.indicator];
    const entonces = typeof bruto === "string" ? bruto : null;
    const hoy = c.value ?? null;
    return {
      indicador: c.indicator,
      entonces,
      hoy,
      umbral: c.threshold,
      coincide:
        entonces !== null &&
        hoy !== null &&
        lado(entonces, c.threshold) === lado(hoy, c.threshold),
    };
  });
}

/**
 * Distancia media en «umbrales», o `null` si no hay nada que comparar.
 *
 * Solo entran las condiciones con los dos valores presentes: comparar contra un
 * hueco daría una cifra inventada. Si no queda ninguna, el episodio no se puede
 * puntuar y se descarta.
 */
function distancia(condiciones: CondicionEpisodio[]): number | null {
  const comparables = condiciones.filter(
    (c) => c.entonces !== null && c.hoy !== null,
  );
  if (comparables.length === 0) {
    return null;
  }
  const suma = comparables.reduce((acc, c) => {
    const delta = Math.abs(toChartNumber(restarDecimales(c.hoy!, c.entonces!)));
    const escala = Math.max(Math.abs(toChartNumber(c.umbral)), EPSILON);
    return acc + delta / escala;
  }, 0);
  return suma / comparables.length;
}

export function episodiosComparables(
  senales: readonly Senal[],
  analisis: Analisis | null,
  limite = 3,
): Episodio[] {
  if (analisis === null) {
    return [];
  }
  return senales
    .flatMap((senal) => {
      const condiciones = emparejar(senal, analisis);
      if (condiciones === null) {
        return [];
      }
      const d = distancia(condiciones);
      if (d === null) {
        return [];
      }
      // 1 umbral de distancia media = 0 % de parecido. Más allá satura en 0 en
      // vez de dar negativos, que no significarían nada en una pastilla.
      return [
        { senal, similitud: Math.round(Math.max(0, 1 - d) * 100), condiciones },
      ];
    })
    .sort(
      (a, b) =>
        b.similitud - a.similitud ||
        // Empate: el más reciente primero, para que dos refrescos no reordenen.
        Date.parse(b.senal.as_of) - Date.parse(a.senal.as_of),
    )
    .slice(0, limite);
}

/**
 * Color del resultado: lo describe, NO lo juzga.
 *
 * La brecha ensanchándose va en coral porque en esta interfaz el coral marca lo
 * que acerca un disparo, no «lo malo». Un color por acierto convertiría una
 * historia observada en una nota, que es justo lo que el PRD descarta.
 */
export function colorResultado(deltaPp: string | null | undefined): string {
  if (deltaPp === null || deltaPp === undefined) {
    return "var(--text-muted)";
  }
  const c = compararDecimales(deltaPp, "0");
  return c === 0 ? "var(--text-muted)" : c > 0 ? "var(--coral)" : "var(--sage)";
}

/** Color del valor de hoy en la minitabla: coincide con entonces o no. */
export function colorCoincidencia(coincide: boolean): string {
  return coincide ? "var(--sage)" : "var(--coral)";
}
