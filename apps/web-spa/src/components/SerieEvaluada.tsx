/**
 * Serie evaluada del histórico, con su capa de referencia debajo del trazo.
 *
 * Un trazo solo dice cómo se ha movido algo. Lo que no dice —y es lo que se
 * pregunta quien lo mira— es **si eso es mucho**. La capa de referencia
 * responde a eso sin escribir una palabra: dónde cae el 80 % central de la
 * ventana, por dónde va la mediana, a qué distancia está el umbral que
 * gobierna al indicador y en qué punto está hoy.
 *
 * ### Orden de pintado
 *
 * El orden importa y es el que fija la lectura: banda → gridlines → mediana →
 * umbral → hoy → serie. La serie va **encima de todo**, porque es el dato; las
 * demás capas son contexto y ninguna puede taparla.
 *
 * ### El eje va FUERA del SVG
 *
 * Mismo motivo que en `GapPanel`: el gráfico usa `preserveAspectRatio="none"`
 * para estirarse al ancho de la tarjeta, y cualquier texto dentro saldría
 * deformado con él. Las etiquetas del eje y la leyenda son HTML.
 */

import { useRef } from "react";

import { useI18n } from "../i18n/contexto";
import type { Idioma } from "../i18n/idioma";
import { formatDecimal, toChartNumber } from "../lib/decimal";
import type { CondicionDeIndicador } from "../lib/reglas";
import { marcasTiempo, puntosTemporales } from "../lib/ejeTiempo";
import { colorZona, leerHistorico } from "../lib/lecturaHistorico";
import { useAncho } from "../lib/useAncho";
import { percentilDisc, type Punto } from "../lib/series";
import { NoDataState } from "./NoDataState";

const ANCHO = 1060;
const ALTO = 280;
const PAD = 14;
/** Cuatro gridlines: las dos de los bordes y dos interiores a tercios. Las
 *  etiquetas del eje usan estas MISMAS fracciones — tres marcas contra cuatro
 *  líneas se leería como un fallo de alineación. */
const FRACCIONES = [0, 1 / 3, 2 / 3, 1] as const;

export interface DatosSerieEvaluada {
  puntos: readonly Punto[];
  /** Condición del ruleset que gobierna al indicador, o `null` si no hay. */
  condicion: CondicionDeIndicador | null;
}

const LOCALE: Record<Idioma, string> = { es: "es-VE", en: "en-US" };

function num(valor: string, idioma: Idioma): string {
  return formatDecimal(valor, { maxDecimales: 4, idioma });
}

export function SerieEvaluada({
  puntos,
  condicion,
  indicador,
  dias,
  idioma,
  vacio,
  etiqueta,
}: DatosSerieEvaluada & {
  indicador: string;
  dias: number;
  idioma: Idioma;
  vacio: string;
  etiqueta: string;
}) {
  const { t } = useI18n();
  const ejeRef = useRef<HTMLDivElement>(null);
  const anchoEje = useAncho(ejeRef, ANCHO);

  if (puntos.length === 0) {
    return <NoDataState detalle={vacio} />;
  }

  // `percentilDisc` toma FRACCION, no porcentaje. Pasarle 10/50/90 no falla:
  // satura el indice y devuelve el maximo en las tres, con lo que la banda sale
  // plana y la mediana miente coincidiendo con «hoy». Silencioso y creible.
  // Misma fuente que el panel rector: percentil y estadísticas salen de
  // `leerHistorico`, no de un segundo cálculo que podría discrepar del titular.
  const lectura = leerHistorico(puntos, condicion)!;
  const fecha = (ms: number) =>
    new Intl.DateTimeFormat(LOCALE[idioma], {
      day: "numeric",
      month: "short",
    }).format(new Date(ms));

  const p10 = percentilDisc(puntos, 0.1);
  const p90 = percentilDisc(puntos, 0.9);
  const mediana = percentilDisc(puntos, 0.5);
  const umbral = condicion?.umbral ?? null;

  // «Hoy» sale del ÚLTIMO PUNTO DE LA SERIE, no de `vigentes`. La razón es
  // concreta: `vigentes` indexa solo por nombre de indicador, y la familia
  // `official_rate*` existe en las cinco monedas del BCV colisionando entre sí
  // (está escrito en `reducers.ts`). Aquí se elige moneda, así que leer de ahí
  // podría dibujar una línea de VES sobre un gráfico de USD. El último bucket
  // de la propia serie no puede equivocarse de moneda ni de indicador.
  const hoy = puntos[puntos.length - 1].valor;

  // El dominio TIENE que incluir las capas de referencia. Con la escala de la
  // serie a secas, un umbral fuera del rango recorrido se dibujaría fuera del
  // viewBox: invisible, y peor que invisible, porque el hueco se leería como
  // «no hay umbral» en vez de como «el umbral está lejos».
  const valores = [
    ...puntos.map((p) => toChartNumber(p.valor)),
    ...[p10, p90, mediana, umbral, hoy]
      .filter((v): v is string => v !== null)
      .map(toChartNumber),
  ];
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const escala = { min, max };
  const span = max - min || 1;
  const aY = (v: number) =>
    ALTO - PAD - ((v - min) / span) * (ALTO - PAD * 2);
  const horizontal = (valor: string) =>
    `0,${aY(toChartNumber(valor)).toFixed(1)} ${ANCHO},${aY(toChartNumber(valor)).toFixed(1)}`;

  const banda =
    p10 !== null && p90 !== null
      ? { y: aY(toChartNumber(p90)), alto: aY(toChartNumber(p10)) - aY(toChartNumber(p90)) }
      : null;

  const textoUmbral =
    condicion === null
      ? null
      : t(
          condicion.op === "gt" || condicion.op === "gte"
            ? "historico.leyendaUmbralPorEncima"
            : "historico.leyendaUmbralPorDebajo",
          { umbral: num(condicion.umbral, idioma) },
        );

  const est = lectura.estadisticas;
  const ESTADISTICAS = [
    { clave: "minimo", dato: est.minimo, color: "var(--coral)" },
    { clave: "maximo", dato: est.maximo, color: "var(--coral)" },
    { clave: "mediana", dato: est.mediana, color: "var(--sage)" },
    { clave: "desviacion", dato: est.desviacion, color: "var(--text-muted)" },
  ] as const;

  return (
    <div>
      {/* Cabecera: qué serie es y en qué punto está hoy, antes del trazo. */}
      <div className="vmw-serieval__cabecera">
        <div className="vmw-serieval__ident">
          <span className="vmw-serieval__nombre">
            {indicador.replaceAll("_", " ")}
          </span>
          <span className="vmw-serieval__clave">{indicador}</span>
        </div>
        <div className="vmw-serieval__ahora">
          <span className="vmw-serieval__valor">{num(hoy, idioma)}</span>
          <span
            className="vmw-serieval__percentil"
            style={{ color: colorZona(lectura.zona) }}
          >
            {t("historico.percentilVentana", {
              percentil: String(lectura.percentil),
              dias: String(dias),
            })}
          </span>
        </div>
      </div>

      <div className="vmw-serieval__marco">
        <div className="vmw-serieval__eje" aria-hidden="true">
          {FRACCIONES.map((fraccion) => (
            <span key={fraccion} style={{ top: `${(fraccion * 100).toFixed(1)}%` }}>
              {num(String(max - fraccion * span), idioma)}
            </span>
          ))}
        </div>
        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          preserveAspectRatio="none"
          className="vmw-serieval"
          role="img"
          aria-label={etiqueta}
        >
          {/* 1. Banda del 80 % central. Sin borde: es un fondo, no un objeto. */}
          {banda !== null && (
            <rect
              x="0"
              y={banda.y.toFixed(1)}
              width={ANCHO}
              height={Math.max(banda.alto, 1).toFixed(1)}
              fill="var(--overlay-soft)"
              stroke="none"
            />
          )}

          {/* 2. Gridlines. `vectorEffect` porque el SVG se estira: sin él, 1 px
                 de trazo se vuelve grueso al ensancharse la tarjeta. */}
          {FRACCIONES.map((fraccion) => {
            const y = PAD + fraccion * (ALTO - PAD * 2);
            return (
              <line
                key={fraccion}
                x1="0"
                y1={y.toFixed(1)}
                x2={ANCHO}
                y2={y.toFixed(1)}
                stroke="var(--border)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {/* 3. Mediana de la ventana. */}
          {mediana !== null && (
            <polyline
              points={horizontal(mediana)}
              fill="none"
              stroke="var(--sage)"
              strokeWidth="1.3"
              strokeDasharray="7 7"
              opacity="0.85"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* 4. Umbral de la regla — solo si la serie participa en alguna. */}
          {umbral !== null && (
            <polyline
              points={horizontal(umbral)}
              fill="none"
              stroke="var(--coral)"
              strokeWidth="1.3"
              strokeDasharray="4 4"
              opacity="0.8"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* 5. Valor de hoy.

                 `var(--white)` y no `#fff`: el token significa «maximo
                 contraste» y vale `#15181b` en tema claro. Un blanco literal
                 dejaria esta linea invisible sobre la tarjeta clara — es el
                 defecto que documenta `tests/unit/tema-tokens.test.ts`, que ya
                 paso una vez con siete elementos de Intradia. */}
          <polyline
            points={horizontal(hoy)}
            fill="none"
            stroke="var(--white)"
            strokeWidth="1"
            strokeDasharray="2 6"
            opacity="0.5"
            vectorEffect="non-scaling-stroke"
          />

          {/* 6. La serie, encima de todo: es el dato. */}
          <polyline
            points={puntosTemporales(puntos, ANCHO, ALTO, PAD, escala)}
            fill="none"
            stroke="var(--series-buy)"
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      {/* Eje de fechas. Fuera del SVG, como el de valores: con
          `preserveAspectRatio="none"` el texto de dentro se deformaría. */}
      <div className="vmw-serieval__fechas" ref={ejeRef} aria-hidden="true">
        {marcasTiempo(lectura.desde, lectura.hasta, dias, idioma, anchoEje).map(
          (marca) => (
            <span
              key={marca.t}
              style={{ left: `${(marca.fraccion * 100).toFixed(2)}%` }}
            >
              {marca.etiqueta}
            </span>
          ),
        )}
      </div>

      <ul className="vmw-serieval__leyenda">
        <li>
          <span className="vmw-serieval__muestra" aria-hidden="true" />
          {t("historico.leyendaBanda")}
        </li>
        {mediana !== null && (
          <li>
            <span
              className="vmw-serieval__guion vmw-serieval__guion--mediana"
              aria-hidden="true"
            />
            {t("historico.leyendaMediana")}
            <strong>{num(mediana, idioma)}</strong>
          </li>
        )}
        <li>
          <span
            className="vmw-serieval__guion vmw-serieval__guion--hoy"
            aria-hidden="true"
          />
          {t("historico.leyendaHoy")}
          <strong>{num(hoy, idioma)}</strong>
        </li>
        {textoUmbral !== null && (
          <li>
            <span
              className="vmw-serieval__guion vmw-serieval__guion--umbral"
              aria-hidden="true"
            />
            {textoUmbral}
          </li>
        )}
      </ul>

      {/* Las cuatro cifras que resumen la ventana, con cuándo ocurrió cada una.
          La desviación no lleva fecha: no ocurre en un punto. */}
      <div className="vmw-serieval__stats">
        {ESTADISTICAS.map(({ clave, dato, color }) => (
          <div className="vmw-serieval__stat" key={clave}>
            <span className="vmw-serieval__stat-nombre">
              {t(`historico.stat.${clave}`)}
            </span>
            <span className="vmw-serieval__stat-valor" style={{ color }}>
              {num(dato.valor, idioma)}
            </span>
            <span className="vmw-serieval__stat-detalle">
              {dato.t === null
                ? t("historico.statSobre", { puntos: String(lectura.puntos) })
                : fecha(dato.t)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
