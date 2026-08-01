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
export function puntosPolilinea(
  puntos: readonly Punto[],
  ancho: number,
  alto: number,
  pad: number,
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

/**
 * Color de una celda entre `min` y `max`: salvia (convergido) → teal → coral
 * (brecha amplia). Es la rampa del diseño; la escala se escribe siempre al pie
 * porque un mapa de calor sin leyenda no se puede leer.
 */
export function colorCalor(
  valor: string,
  min: number,
  max: number,
): string {
  const span = max - min || 1;
  const t = Math.max(0, Math.min(1, (toChartNumber(valor) - min) / span));
  if (t < 0.4) {
    return `rgb(158 188 182 / ${((0.14 + t * 0.5) * 100).toFixed(0)}%)`;
  }
  if (t < 0.7) {
    return `rgb(138 214 204 / ${((0.25 + t * 0.55) * 100).toFixed(0)}%)`;
  }
  return `rgb(249 113 113 / ${((0.3 + t * 0.55) * 100).toFixed(0)}%)`;
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
