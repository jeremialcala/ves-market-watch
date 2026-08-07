/**
 * Qué series explican la sesión: se CALCULA, no se cablea.
 *
 * El criterio es el movimiento de la sesión medido en desviaciones típicas de la
 * propia serie: `z = |último − apertura| / σ₇d`. Normalizar es lo que permite
 * comparar cosas que viven en unidades distintas —una brecha en puntos, una
 * liquidez en USDT, un ratio adimensional— sin que gane siempre la de números
 * más grandes. Sin normalizar, la liquidez copaba las cuatro tarjetas todos los
 * días por el mero tamaño de la cifra.
 *
 * σ se toma sobre los VALORES de la serie en los últimos 7 días. La alternativa
 * —σ de las Δ diarias— da siete observaciones y una estimación demasiado pobre
 * para ordenar nada.
 *
 * Dos casos límite tienen respuesta explícita porque callarlos falsearía el
 * ranking:
 *
 * - **σ = 0 con movimiento**: la serie no se movió en una semana y hoy sí. Es lo
 *   más inusual que puede pasarle, no un dato inservible: va arriba del todo con
 *   `z = Infinity` y la tarjeta lo dice con esas palabras.
 * - **sin historia**: no hay con qué normalizar. Se queda FUERA del ranking en
 *   vez de colarse con un cero que la haría parecer tranquila.
 */

import { compararDecimales, restarDecimales, toChartNumber } from "./decimal";
import { resumenIntradia, type PuntoIntradia } from "./intradia";

export interface MovimientoSerie {
  indicador: string;
  /** Valores EXACTOS del contrato: la presentación redondea, esto no. */
  apertura: string;
  ultimo: string;
  deltaAbs: string;
  /** `null` si la apertura es cero — se escribe «—», nunca ∞. */
  deltaPct: string | null;
  /** Desviación típica de los últimos 7 días; `null` sin historia suficiente. */
  sigma: number | null;
  /** Movimiento en desviaciones típicas. `Infinity` con σ = 0 y Δ ≠ 0. */
  z: number;
  puntos: readonly PuntoIntradia[];
}

/** Mínimo de observaciones para que σ signifique algo. */
export const MUESTRAS_MINIMAS_SIGMA = 24;

/** Bajo esta z, el movimiento de la sesión cabe en la variación normal. */
export const Z_RANGO_NORMAL = 1;

/**
 * Desviación típica **poblacional** de una serie de decimales exactos.
 *
 * Poblacional y no muestral: no se está infiriendo nada sobre una población
 * mayor, se describe la dispersión de los 7 días que hay. Es la única conversión
 * a float del módulo, y va aquí porque σ es un estadístico, no un importe.
 */
export function desviacionTipica(valores: readonly string[]): number | null {
  if (valores.length < MUESTRAS_MINIMAS_SIGMA) {
    return null;
  }
  const numeros = valores.map(toChartNumber);
  const media = numeros.reduce((a, b) => a + b, 0) / numeros.length;
  const varianza =
    numeros.reduce((suma, v) => suma + (v - media) ** 2, 0) / numeros.length;
  return Math.sqrt(varianza);
}

/**
 * Movimientos de la sesión ordenados por z descendente.
 *
 * `sesion` son las series del día operativo; `historia`, las mismas series en la
 * ventana de 7 días. Una serie sin historia utilizable no entra: mejor cuatro
 * tarjetas de las que se puede decir algo que cinco donde una miente.
 */
export function movimientosDeSesion(
  sesion: ReadonlyMap<string, readonly PuntoIntradia[]>,
  historia: ReadonlyMap<string, readonly PuntoIntradia[]>,
): MovimientoSerie[] {
  const movimientos: MovimientoSerie[] = [];

  for (const [indicador, puntos] of sesion) {
    const resumen = resumenIntradia(puntos);
    if (resumen === null) {
      continue;
    }
    const sigma = desviacionTipica(
      (historia.get(indicador) ?? []).map((p) => p.valor),
    );
    if (sigma === null) {
      continue; // sin con qué normalizar: fuera, no al fondo
    }
    const delta = Math.abs(toChartNumber(resumen.deltaAbs));
    movimientos.push({
      indicador,
      apertura: resumen.apertura,
      ultimo: resumen.ultimo,
      deltaAbs: resumen.deltaAbs,
      deltaPct: resumen.deltaPct,
      sigma,
      z: sigma === 0 ? (delta === 0 ? 0 : Infinity) : delta / sigma,
      puntos,
    });
  }

  // Desempate por nombre canónico: con dos series a la misma z, el orden no
  // puede depender de cómo iteró el Map — la vista se recompone cada 5 min y
  // las tarjetas bailarían solas.
  return movimientos.sort(
    (a, b) => b.z - a.z || a.indicador.localeCompare(b.indicador),
  );
}

/** Cuántas de las restantes se salen del rango normal. Cero permite afirmar
 *  que «el resto se mantuvo dentro de su rango»; si no, se dice el número. */
export function fueraDeRango(
  movimientos: readonly MovimientoSerie[],
): number {
  return movimientos.filter((m) => m.z > Z_RANGO_NORMAL).length;
}

/**
 * Sentido que el proyecto ya le da a cada indicador cuando lo colorea.
 *
 * No es un juicio del motor ni un consejo: es la MISMA convención que el
 * dashboard usa en `data-sentido` para la brecha —abrirse va en coral, comprimir
 * en salvia—, extendida a los indicadores donde el proyecto ya tiene una lectura
 * establecida. Donde no la hay, `null`: la tarjeta va con hairline y no insinúa
 * nada.
 */
const ADVERSO_AL_SUBIR: Record<string, boolean> = {
  p2p_brecha_abs: true, // la brecha se abre
  p2p_brecha_pct: true,
  p2p_spread: true, // comprar y vender cuesta más
  p2p_spread_pct: true,
  p2p_outliers_pct: true, // más ruido en el snapshot
  p2p_liquidez: false, // menos liquidez es lo adverso
};

/** `true` adverso · `false` favorable · `null` sin lectura establecida. */
export function sentidoDelMovimiento(
  indicador: string,
  deltaAbs: string,
): boolean | null {
  const base = indicador.replace(/_(buy|sell)$/, "");
  const adversoAlSubir = ADVERSO_AL_SUBIR[base];
  if (adversoAlSubir === undefined) {
    return null;
  }
  const direccion = compararDecimales(deltaAbs, "0");
  if (direccion === 0) {
    return null; // sin movimiento no hay sentido que dar
  }
  return direccion === 1 ? adversoAlSubir : !adversoAlSubir;
}

/** `points` de la chispa en el viewBox de la tarjeta, con la escala de la
 *  propia serie: es un perfil de sesión, no un gráfico con escala absoluta. */
export function trazoSparkline(
  puntos: readonly PuntoIntradia[],
  ancho: number,
  alto: number,
  pad = 4,
): string {
  if (puntos.length === 0) {
    return "";
  }
  const valores = puntos.map((p) => toChartNumber(p.valor));
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const span = max - min || 1;
  const divisor = puntos.length > 1 ? puntos.length - 1 : 1;
  return valores
    .map((v, i) => {
      const x = (i / divisor) * ancho;
      const y = alto - pad - ((v - min) / span) * (alto - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Cierra el trazo contra la base para poder rellenarlo. */
export function areaSparkline(trazo: string, ancho: number, alto: number): string {
  return trazo === "" ? "" : `0,${alto} ${trazo} ${ancho},${alto}`;
}

/**
 * Trazo y línea de umbral EN LA MISMA ESCALA.
 *
 * El umbral entra en el dominio aunque la serie no se le acerque. Dejarlo fuera
 * lo recortaría del lienzo sin avisar, y una chispa sin la línea de disparo a la
 * vista se lee como si el disparo estuviera cerca — que es justo lo contrario de
 * lo que pasa cuando la línea no cabe. Que la serie salga aplanada contra un
 * borde ES la lectura: hoy no dispara, y por mucho.
 *
 * Con `umbral` nulo se comporta como `trazoSparkline`.
 */
export function trazoConUmbral(
  puntos: readonly PuntoIntradia[],
  umbral: string | null,
  ancho: number,
  alto: number,
  pad = 4,
): { trazo: string; yUmbral: number | null } {
  if (puntos.length === 0) {
    return { trazo: "", yUmbral: null };
  }
  const valores = puntos.map((p) => toChartNumber(p.valor));
  const limite = umbral === null ? null : toChartNumber(umbral);
  const dominio = limite === null ? valores : [...valores, limite];
  const min = Math.min(...dominio);
  const max = Math.max(...dominio);
  const span = max - min || 1;
  const y = (v: number) => alto - pad - ((v - min) / span) * (alto - pad * 2);
  const divisor = puntos.length > 1 ? puntos.length - 1 : 1;
  return {
    trazo: valores
      .map((v, i) => `${((i / divisor) * ancho).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" "),
    yUmbral: limite === null ? null : Number(y(limite).toFixed(1)),
  };
}

/** Δ con signo explícito: el color refuerza, nunca codifica solo. */
export function signoTexto(deltaAbs: string): string {
  return compararDecimales(deltaAbs, "0") === 1 ? "+" : "";
}

/** Diferencia exacta para el pie de la tarjeta. */
export function delta(ultimo: string, apertura: string): string {
  return restarDecimales(ultimo, apertura);
}
