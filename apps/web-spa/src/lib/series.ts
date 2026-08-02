/**
 * Derivaciones de las series históricas que pide el diseño (sparkline de 24 h,
 * mapa de calor de 14 días, comparativas contra la historia).
 *
 * Todo lo de aquí es puro y trabaja sobre el string exacto del contrato: la
 * única conversión a number es la de coordenadas (`toChartNumber`), igual que
 * en el resto del cliente (ADR-0017).
 */

import { compararDecimales, toChartNumber } from "./decimal";
import { VET_OFFSET_MIN } from "./intradia";

export interface Punto {
  /** Epoch ms del bucket. */
  t: number;
  /** Valor exacto del contrato. */
  valor: string;
}

/** Mínimo y máximo exactos (sin pasar por float). */
export function extremos(
  puntos: readonly Punto[],
): { min: string; max: string } | null {
  if (puntos.length === 0) {
    return null;
  }
  let min = puntos[0].valor;
  let max = puntos[0].valor;
  for (const { valor } of puntos) {
    if (compararDecimales(valor, min) === -1) {
      min = valor;
    }
    if (compararDecimales(valor, max) === 1) {
      max = valor;
    }
  }
  return { min, max };
}

/**
 * `points` de un `<polyline>` SVG. El eje Y se normaliza al rango de la propia
 * serie (como el diseño): es una sparkline, no un gráfico con escala absoluta,
 * y por eso siempre va acompañada de sus extremos escritos.
 */
export interface EscalaY {
  min: number;
  max: number;
}

/**
 * Extremos comunes a varias series, para dibujarlas en la MISMA escala.
 *
 * Sin esto cada polilínea se escala con sus propios extremos y dos series en el
 * mismo SVG se vuelven engañosas: una serie de 12,7 % puede quedar dibujada por
 * encima de otra de 13,4 %.
 */
export function escalaComun(...series: readonly Punto[][]): EscalaY | null {
  const valores = series.flat().map((p) => toChartNumber(p.valor));
  if (valores.length === 0) {
    return null;
  }
  return { min: Math.min(...valores), max: Math.max(...valores) };
}

export function puntosPolilinea(
  puntos: readonly Punto[],
  ancho: number,
  alto: number,
  pad: number,
  /** Escala impuesta. Sin ella cada serie usa la suya, que es lo correcto
   *  cuando va sola en su SVG. */
  escala?: EscalaY | null,
): string {
  if (puntos.length === 0) {
    return "";
  }
  const valores = puntos.map((p) => toChartNumber(p.valor));
  const min = escala?.min ?? Math.min(...valores);
  const max = escala?.max ?? Math.max(...valores);
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

/** Cierra la polilínea contra la base para poder rellenarla. */
export function areaPolilinea(
  linea: string,
  ancho: number,
  alto: number,
): string {
  return linea === "" ? "" : `0,${alto} ${linea} ${ancho},${alto}`;
}

// -- mapa de calor -----------------------------------------------------------

export interface CeldaCalor {
  /** Valor exacto del bucket, o `null` si no hubo dato a esa hora. */
  valor: string | null;
  hora: number;
}

export interface FilaCalor {
  /** Etiqueta corta del día en VET (d/m). */
  etiqueta: string;
  /** Fecha del día operativo en VET (aaaa-mm-dd), para el tooltip. */
  dia: string;
  celdas: CeldaCalor[];
}

function partesVET(t: number): { dia: string; hora: number; etiqueta: string } {
  const enVET = new Date(t + VET_OFFSET_MIN * 60_000);
  const aaaa = enVET.getUTCFullYear();
  const mm = enVET.getUTCMonth() + 1;
  const dd = enVET.getUTCDate();
  return {
    dia: `${aaaa}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`,
    hora: enVET.getUTCHours(),
    etiqueta: `${dd}/${mm}`,
  };
}

/**
 * Parrilla día × hora en VET a partir de una serie con bucket de 1 h. Los días
 * salen en orden ascendente y SIEMPRE con sus 24 celdas: las horas sin dato
 * quedan en `null` (se pintan vacías, no se interpolan).
 */
export function parrillaCalor(
  puntos: readonly Punto[],
  dias: number,
  ahora: Date = new Date(),
): FilaCalor[] {
  const porDia = new Map<string, Map<number, string>>();
  for (const punto of puntos) {
    const { dia, hora } = partesVET(punto.t);
    const fila = porDia.get(dia) ?? new Map<number, string>();
    fila.set(hora, punto.valor);
    porDia.set(dia, fila);
  }

  const filas: FilaCalor[] = [];
  for (let atras = dias - 1; atras >= 0; atras -= 1) {
    const t = ahora.getTime() - atras * 86_400_000;
    const { dia, etiqueta } = partesVET(t);
    const valores = porDia.get(dia);
    filas.push({
      dia,
      etiqueta,
      celdas: Array.from({ length: 24 }, (_, hora) => ({
        hora,
        valor: valores?.get(hora) ?? null,
      })),
    });
  }
  return filas;
}

/** Escalones de la rampa secuencial (`--calor-1` … `--calor-5`): hasta el p90. */
export const PASOS_CALOR = 5;
/** Escalones del tramo de exceso (`--calor-alto-1`, `--calor-alto-2`): sobre el p90. */
export const PASOS_CALOR_ALTO = 2;

export interface EscalaCalor {
  /** Extremo bajo de la rampa. */
  p10: string;
  /** Umbral de exceso: por encima de aquí la celda pasa a coral. */
  p90: string;
  /** Techo del tramo de exceso. */
  max: string;
}

/**
 * Percentil **discreto** (nearest-rank): devuelve siempre un valor REALMENTE
 * observado, nunca uno interpolado entre dos muestras.
 *
 * Es la misma elección que ADR-0017 fijó para los percentiles del motor
 * (`percentile_disc`, jamás `percentile_cont`): un extremo de la escala que
 * nadie llegó a medir es una cifra inventada, y aquí encima se rotula en la
 * leyenda. Con `q` bajo devuelve el primer valor cuya frecuencia acumulada
 * alcanza `q`, igual que Postgres.
 */
export function percentilDisc(puntos: readonly Punto[], q: number): string | null {
  if (puntos.length === 0) {
    return null;
  }
  const orden = puntos
    .map((p) => p.valor)
    .sort((a, b) => compararDecimales(a, b));
  const i = Math.min(orden.length - 1, Math.max(0, Math.ceil(q * orden.length) - 1));
  return orden[i];
}

/**
 * Anclas de la escala del mapa: p10, p90 y techo.
 *
 * El tramo coloreado va del p10 al p90 en vez de min→max porque **una sola hora
 * extrema comprimía toda la rampa**: con min/max, un pico aislado dejaba al
 * resto del mapa repartido entre dos escalones y el mapa entero se leía plano.
 *
 * Son percentiles de la ventana que se está PINTANDO —los 14 días del mapa—, no
 * los de la escala de ningún medidor: el lado venta no publica percentiles
 * (no es medidor del panel), así que la leyenda los rotula por lo que son.
 */
export function escalaCalor(puntos: readonly Punto[]): EscalaCalor | null {
  const rango = extremos(puntos);
  const p10 = percentilDisc(puntos, 0.1);
  const p90 = percentilDisc(puntos, 0.9);
  if (rango === null || p10 === null || p90 === null) {
    return null;
  }
  return { p10, p90, max: rango.max };
}

/** ¿Esta celda está por encima del p90? Comparación EXACTA, sin pasar por float. */
export function esExceso(valor: string, escala: EscalaCalor): boolean {
  // Estrictamente por encima, como dice la leyenda: con una serie plana el p90
  // es el propio valor de todas las celdas y `>=` habría pintado el mapa entero
  // como exceso.
  return compararDecimales(valor, escala.p90) === 1;
}

/**
 * Variable CSS de la celda: rampa secuencial hasta el p90, coral por encima.
 *
 * Dos codificaciones distintas para dos preguntas distintas. **Magnitud** es
 * secuencial de un solo tono con luminosidad monótona —el mapa se lee de tenue
 * a intenso—; el coral no es la continuación de esa rampa sino una **categoría**:
 * la brecha salió del rango habitual de la propia ventana.
 *
 * Por qué no un recorrido continuo de dos tonos: la versión que iba salvia →
 * teal → coral no era monótona en luminosidad (así no se lee una magnitud) y en
 * tema claro su extremo bajo quedaba a 1,67:1 sobre blanco, invisible. La rampa
 * teal de ahora se derivó igualando escalón por escalón el contraste de la coral
 * ya validada, y el salto teal→coral se midió aparte para que la categoría
 * sobreviva al daltonismo (protan ΔE 14,0 frente a ~7 entre escalones).
 *
 * Devuelve una variable, no un color: cada tema usa su rampa. Y el exceso se
 * dice además en el tooltip, para que no dependa solo del color.
 */
export function colorCalor(valor: string, escala: EscalaCalor): string {
  if (esExceso(valor, escala)) {
    const desde = toChartNumber(escala.p90);
    const t = fraccion(toChartNumber(valor) - desde, toChartNumber(escala.max) - desde);
    return `var(--calor-alto-${escalon(t, PASOS_CALOR_ALTO)})`;
  }
  const desde = toChartNumber(escala.p10);
  const t = fraccion(toChartNumber(valor) - desde, toChartNumber(escala.p90) - desde);
  return `var(--calor-${escalon(t, PASOS_CALOR)})`;
}

/** Posición en [0, 1] dentro de un tramo; un tramo degenerado cae al principio. */
function fraccion(avance: number, tramo: number): number {
  return tramo <= 0 ? 0 : Math.max(0, Math.min(1, avance / tramo));
}

function escalon(t: number, pasos: number): number {
  return Math.min(pasos, Math.floor(t * pasos) + 1);
}

/** Ancho relativo (0–100 %) de `valor` dentro de [0, max], para las barras. */
export function porcentajeDeMaximo(valor: string, max: string): string {
  const v = toChartNumber(valor);
  const m = toChartNumber(max);
  if (m <= 0) {
    return "0%";
  }
  return `${Math.max(0, Math.min(100, (v / m) * 100)).toFixed(1)}%`;
}
