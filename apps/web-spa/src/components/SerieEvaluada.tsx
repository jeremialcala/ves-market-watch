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

import type { ReactNode } from "react";

import { SerieTemporal } from "./SerieTemporal";
import { SinDatosGrafico } from "./SinDatosGrafico";
import { useI18n } from "../i18n/contexto";
import type { Idioma } from "../i18n/idioma";
import { formatDecimal } from "../lib/decimal";
import type { CondicionDeIndicador } from "../lib/reglas";
import { colorZona, leerHistorico } from "../lib/lecturaHistorico";
import { unidadDe } from "../lib/seriesEvaluables";
import { ventanaInsuficiente } from "../lib/cobertura";
import type { Punto } from "../lib/series";


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
  etiqueta,
  controles,
}: DatosSerieEvaluada & {
  indicador: string;
  dias: number;
  idioma: Idioma;
  etiqueta: string;
  /** Barra de control de la tarjeta; va pegada bajo la cabecera. */
  controles?: ReactNode;
}) {
  const { t } = useI18n();

  if (puntos.length === 0) {
    // Bloque del mismo alto que el gráfico, para que la tarjeta no se encoja y
    // la vista no dé un salto al cambiar de serie.
    return (
      <SinDatosGrafico
        titulo={t("historico.vacioTitulo")}
        serie={indicador.replaceAll("_", " ")}
        desde={Date.now() - dias * 86_400_000}
        idioma={idioma}
      />
    );
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

  const umbral = condicion?.umbral ?? null;

  const textoUmbral =
    condicion === null
      ? null
      : t(
          condicion.op === "gt" || condicion.op === "gte"
            ? "historico.leyendaUmbralPorEncima"
            : "historico.leyendaUmbralPorDebajo",
          { umbral: num(condicion.umbral, idioma) },
        );

  const unidad = unidadDe(indicador);
  const corta = ventanaInsuficiente(puntos, dias);

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
          <span className="vmw-serieval__valor">{num(lectura.hoy, idioma)}</span>
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

      {controles}

      <SerieTemporal
        puntos={puntos}
        color="var(--series-buy)"
        alto={280}
        formato={(v) => num(v, idioma)}
        unidad={unidad}
        dias={dias}
        idioma={idioma}
        etiqueta={etiqueta}
        banda
        mediana
        umbral={umbral}
        hoy
        ejeY
        tooltip
      />

      {/* Sobre la leyenda, no debajo: la advertencia tiene que leerse ANTES
          que las cifras que matiza. */}
      {corta !== null && (
        <div className="vmw-serieval__corta">
          <span className="vmw-corta">
            {t("historico.ventanaCorta", {
              pedidos: String(corta.pedidos),
              disponibles: String(corta.disponibles),
            })}
          </span>
        </div>
      )}

      <ul className="vmw-serieval__leyenda">
        <li>
          <span className="vmw-serieval__muestra" aria-hidden="true" />
          {t("historico.leyendaBanda")}
        </li>
        {lectura.mediana !== null && (
          <li>
            <span
              className="vmw-serieval__guion vmw-serieval__guion--mediana"
              aria-hidden="true"
            />
            {t("historico.leyendaMediana")}
            <strong>{num(lectura.mediana, idioma)}</strong>
          </li>
        )}
        <li>
          <span
            className="vmw-serieval__guion vmw-serieval__guion--hoy"
            aria-hidden="true"
          />
          {t("historico.leyendaHoy")}
          <strong>{num(lectura.hoy, idioma)}</strong>
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
