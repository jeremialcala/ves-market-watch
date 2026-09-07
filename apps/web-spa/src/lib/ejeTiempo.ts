/**
 * Eje X temporal: la posición es el tiempo, no el índice.
 *
 * ### Por qué importa
 *
 * Con `x = i / (n-1)`, todos los puntos quedan equiespaciados aunque no lo
 * estén en el tiempo. En la tasa oficial eso **borra los fines de semana**: el
 * BCV no publica fecha-valor sábado ni domingo, y una serie indexada junta el
 * viernes con el lunes como si fueran consecutivos. La lectura correcta es la
 * contraria — ahí hay un tramo horizontal porque **nadie publicó**, y el hueco
 * es el dato.
 *
 * ### Las marcas se generan por INTERVALO, nunca por punto
 *
 * Un eje que rotula puntos hereda su irregularidad: en una serie con huecos
 * saldrían etiquetas apiñadas donde hay datos y ninguna donde no los hay. Aquí
 * las marcas nacen de un calendario —cada día, cada 3, cada 7 según el rango—,
 * ancladas al inicio del día VET, que es el día operativo del proyecto.
 */

import type { Idioma } from "../i18n/idioma";
import { VET_OFFSET_MIN } from "./intradia";
import { toChartNumber } from "./decimal";
import type { EscalaY, Punto } from "./series";

const DIA_MS = 86_400_000;

/** Separación mínima entre etiquetas, en píxeles REALES de pantalla. */
export const MINIMO_PX = 44;

export interface MarcaTiempo {
  t: number;
  /** Posición horizontal en 0–1 sobre el ancho del gráfico. */
  fraccion: number;
  etiqueta: string;
}

/** Cada cuántos días cae una marca, según el rango pedido. */
export function pasoDias(dias: number): number {
  return dias <= 7 ? 1 : dias <= 30 ? 3 : 7;
}

/** Inicio del día VET que contiene `t`, en epoch ms. */
function inicioDiaVET(t: number): number {
  const desplazado = t + VET_OFFSET_MIN * 60_000;
  return Math.floor(desplazado / DIA_MS) * DIA_MS - VET_OFFSET_MIN * 60_000;
}

/** `d/m` en español, `m/d` en inglés — sobre el día VET, no el del navegador. */
export function etiquetaFecha(t: number, idioma: Idioma): string {
  const enVET = new Date(t + VET_OFFSET_MIN * 60_000);
  const d = enVET.getUTCDate();
  const m = enVET.getUTCMonth() + 1;
  return idioma === "en" ? `${m}/${d}` : `${d}/${m}`;
}

/**
 * Polilínea con X proporcional al timestamp.
 *
 * Gemela de `puntosPolilinea`, que reparte por índice. La Y se calcula igual
 * para que las capas de referencia sigan alineadas.
 */
export function puntosTemporales(
  puntos: readonly Punto[],
  ancho: number,
  alto: number,
  pad: number,
  escala?: EscalaY | null,
): string {
  if (puntos.length === 0) {
    return "";
  }
  const valores = puntos.map((p) => toChartNumber(p.valor));
  const min = escala?.min ?? Math.min(...valores);
  const max = escala?.max ?? Math.max(...valores);
  const span = max - min || 1;
  const desde = puntos[0].t;
  const hasta = puntos[puntos.length - 1].t;
  const lapso = hasta - desde || 1;
  return puntos
    .map((p, i) => {
      const x = ((p.t - desde) / lapso) * ancho;
      const y = alto - pad - ((valores[i] - min) / span) * (alto - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * Marcas del eje, ya filtradas por separación mínima.
 *
 * `anchoPx` es el ancho REAL del eje en pantalla. La regla de los 44 px se
 * aplica sobre él y no sobre las unidades del `viewBox`, porque el gráfico se
 * estira: 44 unidades de un viewBox de 1060 son 44 px solo si la tarjeta mide
 * exactamente 1060.
 *
 * **Se elimina la intermedia, nunca se rota ni se encoge.** Un eje con
 * etiquetas giradas obliga a ladear la cabeza para leer una fecha; con menos
 * fechas se lee igual de bien.
 */
export function marcasTiempo(
  desde: number,
  hasta: number,
  dias: number,
  idioma: Idioma,
  anchoPx: number,
): MarcaTiempo[] {
  if (!(hasta > desde)) {
    return [{ t: desde, fraccion: 0, etiqueta: etiquetaFecha(desde, idioma) }];
  }
  const lapso = hasta - desde;
  const paso = pasoDias(dias) * DIA_MS;

  // Anclado al inicio del día VET: la primera marca del calendario que cae
  // dentro de la ventana, no el instante del primer punto.
  const candidatos: number[] = [desde];
  let t = inicioDiaVET(desde);
  while (t <= desde) {
    t += paso;
  }
  for (; t < hasta; t += paso) {
    candidatos.push(t);
  }
  candidatos.push(hasta);

  const marcas = candidatos.map((t) => ({
    t,
    fraccion: (t - desde) / lapso,
    etiqueta: etiquetaFecha(t, idioma),
  }));

  // 1) Nunca la misma cadena dos veces — pero la primera y la última son
  //    intocables, así que el duplicado que cae es el del CALENDARIO. Filtrar
  //    de izquierda a derecha sin más se comía la última cuando compartía día
  //    con una marca del calendario, y entonces el eje dejaba de terminar en el
  //    último dato.
  const primera = marcas[0];
  const ultimaCruda = marcas[marcas.length - 1];
  if (primera.etiqueta === ultimaCruda.etiqueta) {
    // Ventana de menos de un día: una sola fecha que rotular.
    return [ultimaCruda];
  }
  const reservadas = new Set([primera.etiqueta, ultimaCruda.etiqueta]);
  const vistas = new Set<string>();
  const intermedias = marcas.slice(1, -1).filter((m) => {
    if (reservadas.has(m.etiqueta) || vistas.has(m.etiqueta)) {
      return false;
    }
    vistas.add(m.etiqueta);
    return true;
  });
  const unicas = [primera, ...intermedias, ultimaCruda];

  // 2) Separación mínima. La primera y la última son intocables, así que si la
  //    última queda pegada a la anterior, la que cae es la ANTERIOR.
  const conservadas: MarcaTiempo[] = [];
  for (const marca of unicas.slice(0, -1)) {
    const previa = conservadas[conservadas.length - 1];
    if (
      previa === undefined ||
      (marca.fraccion - previa.fraccion) * anchoPx >= MINIMO_PX
    ) {
      conservadas.push(marca);
    }
  }
  const ultima = unicas[unicas.length - 1];
  if (ultima !== conservadas[conservadas.length - 1]) {
    while (
      conservadas.length > 1 &&
      (ultima.fraccion - conservadas[conservadas.length - 1].fraccion) *
        anchoPx <
        MINIMO_PX
    ) {
      conservadas.pop();
    }
    conservadas.push(ultima);
  }
  return conservadas;
}
