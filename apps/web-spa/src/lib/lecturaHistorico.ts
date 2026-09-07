/**
 * Lectura de la ventana del histórico: qué dice la serie que se está mirando.
 *
 * **Todo sale de la ventana consultada.** Nada se cablea y nada se pide a otro
 * endpoint: si el usuario cambia el rango, el indicador o el bucket, el
 * veredicto cambia con ellos porque se recalcula sobre los puntos que hay
 * delante. Un titular fijo sería una frase decorativa.
 *
 * Describe el presente, **no lo anticipa**: dice dónde cae hoy dentro de lo que
 * la ventana ha recorrido, no hacia dónde va. Es la misma línea que ADR-0021
 * fija para la lectura del mercado — sin consejo y sin pronóstico.
 *
 * Aritmética EXACTA sobre los strings del contrato (`compararDecimales`,
 * `restarDecimales`). Pasar por `number` aquí redondearía la distancia a la
 * mediana, que es justo la cifra que el panel presenta.
 */

import { compararDecimales, restarDecimales, toChartNumber } from "./decimal";
import { percentilDisc, type Punto } from "./series";
import type { CondicionDeIndicador } from "./reglas";

const DIA_MS = 86_400_000;

/** Dónde cae hoy respecto de lo recorrido por la ventana. */
export type Zona = "alta" | "baja" | "centro";

/** Una estadística de la ventana, con cuándo ocurrió si eso significa algo. */
export interface Estadistica {
  /** Valor exacto del contrato. */
  valor: string;
  /**
   * Instante en que se dio. `null` en la dispersión, que no ocurre en un punto
   * — poner ahí una fecha cualquiera sería inventarse un hecho.
   */
  t: number | null;
}

export interface EstadisticasVentana {
  minimo: Estadistica;
  maximo: Estadistica;
  mediana: Estadistica;
  /**
   * Desviación típica poblacional de la ventana.
   *
   * Es la ÚNICA cifra de este módulo que pasa por coma flotante: una raíz
   * cuadrada no tiene forma decimal exacta. Se calcula sobre los mismos valores
   * y se presenta con dos decimales, que es lo que una dispersión necesita.
   */
  desviacion: Estadistica;
}

export interface Lectura {
  /** Valor del último punto: el «hoy» del que habla el panel. */
  hoy: string;
  mediana: string;
  /** Posición de hoy en la distribución de la ventana, 0–100. */
  percentil: number;
  zona: Zona;
  /** `hoy − mediana`, exacto y con signo. */
  distancia: string;
  /**
   * Días desde el último cambio de lado respecto del umbral.
   *
   * `null` con motivo distinto según el caso, y el panel los distingue:
   * sin regla no hay umbral que cruzar; con regla pero sin cruces, la serie
   * lleva toda la ventana del mismo lado — que es información, no ausencia.
   */
  diasDesdeCruce: number | null;
  hayRegla: boolean;
  /** La serie no cruzó, pero hay umbral: lleva toda la ventana de un lado. */
  sinCruces: boolean;
  /** Puntos de la ventana, para rotular «N puntos». */
  puntos: number;
  /** Extremos temporales de la ventana. */
  desde: number;
  hasta: number;
  estadisticas: EstadisticasVentana;
}

/**
 * Percentil de `valor` dentro de `valores`, por rango.
 *
 * Cuenta cuántos quedan estrictamente por debajo y suma la mitad de los
 * empates: con una serie plana el resultado es 50 y no 0 ni 100, que es lo
 * honesto — si todo vale lo mismo, hoy no está ni alto ni bajo.
 */
function percentilDe(valor: string, valores: readonly string[]): number {
  const menores = valores.filter((v) => compararDecimales(v, valor) < 0).length;
  const iguales = valores.filter((v) => compararDecimales(v, valor) === 0).length;
  return Math.round(((menores + iguales / 2) / valores.length) * 100);
}

/** Lado del umbral en el que cae un valor, o `null` si está justo encima. */
function lado(valor: string, umbral: string): -1 | 1 | null {
  const c = compararDecimales(valor, umbral);
  return c === 0 ? null : (c as -1 | 1);
}

export function leerHistorico(
  puntos: readonly Punto[],
  condicion: CondicionDeIndicador | null,
): Lectura | null {
  if (puntos.length === 0) {
    return null;
  }
  const valores = puntos.map((p) => p.valor);
  const hoy = valores[valores.length - 1];
  const mediana = percentilDisc(puntos, 0.5) ?? hoy;
  const percentil = percentilDe(hoy, valores);

  // Los cortes en 10 y 90 son los mismos que dibuja la banda del gráfico: el
  // titular y la capa de referencia tienen que decir lo mismo, o el panel
  // contradice a la imagen que hay justo debajo.
  const zona: Zona = percentil >= 90 ? "alta" : percentil <= 10 ? "baja" : "centro";

  let diasDesdeCruce: number | null = null;
  let sinCruces = false;
  if (condicion !== null) {
    // Se recorre desde el final hacia atrás buscando el ÚLTIMO cambio de lado.
    // Los valores exactamente en el umbral no cuentan como lado: tocar la línea
    // no es cruzarla.
    const ladoHoy = lado(hoy, condicion.umbral);
    let cruce: number | null = null;
    if (ladoHoy !== null) {
      for (let i = puntos.length - 2; i >= 0; i--) {
        const l = lado(valores[i], condicion.umbral);
        if (l !== null && l !== ladoHoy) {
          cruce = i;
          break;
        }
      }
    }
    if (cruce === null) {
      sinCruces = true;
    } else {
      diasDesdeCruce =
        Math.round(
          ((puntos[puntos.length - 1].t - puntos[cruce].t) / DIA_MS) * 10,
        ) / 10;
    }
  }

  const conValor = (v: string): number | null =>
    puntos.find((p) => compararDecimales(p.valor, v) === 0)?.t ?? null;

  const numeros = valores.map(toChartNumber);
  const media = numeros.reduce((a, b) => a + b, 0) / numeros.length;
  const varianza =
    numeros.reduce((acc, n) => acc + (n - media) ** 2, 0) / numeros.length;
  const minimo = valores.reduce((a, b) => (compararDecimales(b, a) < 0 ? b : a));
  const maximo = valores.reduce((a, b) => (compararDecimales(b, a) > 0 ? b : a));

  return {
    hoy,
    mediana,
    estadisticas: {
      minimo: { valor: minimo, t: conValor(minimo) },
      maximo: { valor: maximo, t: conValor(maximo) },
      mediana: { valor: mediana, t: conValor(mediana) },
      desviacion: { valor: Math.sqrt(varianza).toFixed(2), t: null },
    },
    percentil,
    zona,
    distancia: restarDecimales(hoy, mediana),
    diasDesdeCruce,
    hayRegla: condicion !== null,
    sinCruces,
    puntos: puntos.length,
    desde: puntos[0].t,
    hasta: puntos[puntos.length - 1].t,
  };
}

/**
 * Color semántico del ancla del percentil.
 *
 * Coral SOLO en los extremos, y no por «malo»: el coral en esta interfaz marca
 * lo que está cerca de un disparo, y una lectura extrema es lo que acerca una
 * regla. En el centro va sage, que es lo normal.
 */
export function colorZona(zona: Zona): string {
  return zona === "centro" ? "var(--sage)" : "var(--coral)";
}

/** El signo manda en la distancia: por encima o por debajo de la mediana. */
export function colorDistancia(distancia: string): string {
  return compararDecimales(distancia, "0") === 0
    ? "var(--text-muted)"
    : toChartNumber(distancia) > 0
      ? "var(--sage)"
      : "var(--coral)";
}
