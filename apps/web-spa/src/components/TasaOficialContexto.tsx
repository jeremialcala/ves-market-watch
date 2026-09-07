/**
 * Tasa oficial como **bloque de contexto**, no como protagonista.
 *
 * La jerarquía de la vista se dice con el tamaño y el relleno, no con un
 * rótulo: la serie evaluada ocupa 280 px con su capa de referencia completa, y
 * esta ocupa 140 px, con área rellena, sin banda, sin mediana y sin eje Y.
 * Quien entra sabe cuál manda antes de leer nada.
 *
 * ### El porcentaje del subtítulo se CALCULA
 *
 * «La pierna que explica el N % del precio» es una afirmación factual, así que
 * sale de la brecha vigente: `parte = 100 / (1 + brecha/100)`. Cablear un
 * número —el enunciado traía un 88 %, y hoy son 85,1— habría envejecido en
 * días y dejado la frase diciendo algo falso con toda naturalidad. Sin brecha
 * vigente, la frase se queda sin el dato en vez de inventárselo.
 */

import { useI18n } from "../i18n/contexto";
import type { Idioma } from "../i18n/idioma";
import { formatDecimal } from "../lib/decimal";
import { parteDelPrecio } from "../lib/pierna";
import { puntosPolilinea, type Punto } from "../lib/series";
import { NoDataState } from "./NoDataState";

const ANCHO = 1060;
const ALTO = 140;
const PAD = 10;
const LOCALE: Record<Idioma, string> = { es: "es-VE", en: "en-US" };

export function TasaOficialContexto({
  puntos,
  moneda,
  brechaPct,
  idioma,
  vacio,
}: {
  puntos: readonly Punto[];
  moneda: string;
  /** Brecha porcentual vigente; `null` si no hay ninguna. */
  brechaPct: string | null;
  idioma: Idioma;
  vacio: string;
}) {
  const { t } = useI18n();
  const locale = LOCALE[idioma];

  const parte = parteDelPrecio(brechaPct);
  const ultimo = puntos.length > 0 ? puntos[puntos.length - 1] : null;

  const fecha = (ms: number) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
      new Date(ms),
    );

  const linea = puntosPolilinea(puntos, ANCHO, ALTO, PAD);

  return (
    <section className="vmw-oficial" aria-label={t("historico.tasaTitulo", { moneda })}>
      <div className="vmw-oficial__cabecera">
        <h3 className="vmw-oficial__titulo">
          {t("historico.tasaTitulo", { moneda })}
        </h3>
        <span className="vmw-oficial__bajada">
          {parte === null
            ? t("historico.oficialSinBrecha")
            : t("historico.oficialBajada", {
                pct: formatDecimal(String(parte), { maxDecimales: 1, idioma }),
              })}
        </span>
        {ultimo !== null && (
          <span className="vmw-oficial__resumen">
            {t("historico.oficialResumen", {
              valor: formatDecimal(ultimo.valor, { maxDecimales: 2, idioma }),
              moneda,
              fecha: fecha(ultimo.t),
            })}
          </span>
        )}
      </div>

      {puntos.length === 0 ? (
        <NoDataState detalle={vacio} />
      ) : (
        <>
          <svg
            viewBox={`0 0 ${ANCHO} ${ALTO}`}
            preserveAspectRatio="none"
            className="vmw-oficial__grafico"
            role="img"
            aria-label={t("historico.tasaTitulo", { moneda })}
          >
            {/* Área rellena: es lo que separa visualmente el contexto del
                protagonista, que va en línea limpia sobre su capa. */}
            <polygon
              points={`0,${ALTO} ${linea} ${ANCHO},${ALTO}`}
              fill="var(--teal-tint)"
              stroke="none"
            />
            <polyline
              points={linea}
              fill="none"
              stroke="var(--teal)"
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Solo el eje de fechas. Fuera del SVG: `preserveAspectRatio="none"`
              deformaría cualquier texto de dentro. */}
          <div className="vmw-oficial__eje" aria-hidden="true">
            <span>{fecha(puntos[0].t)}</span>
            {puntos.length > 2 && (
              <span>{fecha(puntos[Math.floor(puntos.length / 2)].t)}</span>
            )}
            <span>{fecha(puntos[puntos.length - 1].t)}</span>
          </div>
        </>
      )}
    </section>
  );
}
