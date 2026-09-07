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

import { useRef } from "react";

import { SinDatosGrafico } from "./SinDatosGrafico";
import { TooltipGrafico } from "./TooltipGrafico";
import { useI18n } from "../i18n/contexto";
import type { Idioma } from "../i18n/idioma";
import { formatDecimal } from "../lib/decimal";
import { parteDelPrecio } from "../lib/pierna";
import { marcasTiempo, puntosTemporales } from "../lib/ejeTiempo";
import { useAncho } from "../lib/useAncho";
import { useCrosshair } from "../lib/useCrosshair";
import { anclajeTooltip, contextoPunto, fraccionDe } from "../lib/tooltipSerie";
import { percentilDisc } from "../lib/series";
import { desfaseEntre } from "../lib/cobertura";
import { toChartNumber } from "../lib/decimal";
import type { Punto } from "../lib/series";

const ANCHO = 1060;
const ALTO = 140;
const PAD = 10;
const LOCALE: Record<Idioma, string> = { es: "es-VE", en: "en-US" };

export function TasaOficialContexto({
  puntos,
  moneda,
  brechaPct,
  dias,
  idioma,
  evaluada,
}: {
  puntos: readonly Punto[];
  moneda: string;
  /** Rango pedido, para elegir el paso de las marcas del eje. */
  dias: number;
  /** Brecha porcentual vigente; `null` si no hay ninguna. */
  brechaPct: string | null;
  idioma: Idioma;
  /** La otra serie de la vista, para anotar el desfase entre ambas. */
  evaluada: readonly Punto[];
}) {
  const { t } = useI18n();
  const ejeRef = useRef<HTMLDivElement>(null);
  const anchoEje = useAncho(ejeRef, ANCHO);
  const marcoRef = useRef<HTMLDivElement>(null);
  const { activo, manejadores } = useCrosshair(marcoRef, puntos);
  const locale = LOCALE[idioma];

  const parte = parteDelPrecio(brechaPct);
  const ultimo = puntos.length > 0 ? puntos[puntos.length - 1] : null;

  const fecha = (ms: number) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
      new Date(ms),
    );

  const desfase = desfaseEntre(puntos, evaluada);
  const linea = puntosTemporales(puntos, ANCHO, ALTO, PAD);

  // Misma aritmética de Y que `puntosTemporales`, para que el punto caiga
  // EXACTAMENTE sobre el trazo y no un píxel al lado.
  const valores = puntos.map((p) => toChartNumber(p.valor));
  const minimo = valores.length === 0 ? 0 : Math.min(...valores);
  const recorrido = (valores.length === 0 ? 0 : Math.max(...valores)) - minimo || 1;
  const fx = activo === null ? 0 : fraccionDe(puntos, activo);
  const fy =
    activo === null
      ? 0
      : (ALTO - PAD - ((valores[activo] - minimo) / recorrido) * (ALTO - PAD * 2)) /
        ALTO;

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
        <SinDatosGrafico
          titulo={t("historico.vacioOficial")}
          serie={`${moneda}/VES`}
          desde={Date.now() - dias * 86_400_000}
          alto={140}
          idioma={idioma}
        />
      ) : (
        <>
          <div className="vmw-oficial__marco" ref={marcoRef} {...manejadores}>
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

          {activo !== null && (
            <>
              <svg
                className="vmw-cross"
                viewBox={`0 0 ${ANCHO} ${ALTO}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <line
                  x1={fx * ANCHO}
                  y1="0"
                  x2={fx * ANCHO}
                  y2={ALTO}
                  stroke="var(--border)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <span
                className="vmw-cross__punto"
                style={{
                  left: `${fx * 100}%`,
                  top: `${fy * 100}%`,
                  background: "var(--teal)",
                }}
                aria-hidden="true"
              />
              <TooltipGrafico
                t={puntos[activo].t}
                valor={puntos[activo].valor}
                unidad="VES"
                color="var(--teal)"
                contexto={contextoPunto(
                  puntos,
                  activo,
                  percentilDisc(puntos, 0.5) ?? puntos[activo].valor,
                )}
                anclaje={anclajeTooltip(fx * anchoEje, anchoEje)}
                izquierda={fx * 100}
                arriba={fy * 100}
                idioma={idioma}
              />
            </>
          )}
          </div>

          {/* Solo el eje de fechas. Fuera del SVG: `preserveAspectRatio="none"`
              deformaría cualquier texto de dentro. */}
          <div className="vmw-oficial__eje" ref={ejeRef} aria-hidden="true">
            {marcasTiempo(
              puntos[0].t,
              puntos[puntos.length - 1].t,
              dias,
              idioma,
              anchoEje,
            ).map((marca) => (
              <span
                key={marca.t}
                style={{ left: `${(marca.fraccion * 100).toFixed(2)}%` }}
              >
                {marca.etiqueta}
              </span>
            ))}
          </div>

          {/* Las dos series se leen juntas: si terminan en días distintos,
              comparar sus extremos a ojo induce a error. El caso normal aquí es
              el fin de semana sin publicación del BCV, así que el aviso es una
              nota y no una alarma. */}
          {desfase !== null && (
            <p className="vmw-oficial__desfase">
              {t(
                desfase.oficialAtrasada
                  ? "historico.desfaseOficial"
                  : "historico.desfaseSerie",
                {
                  atrasada: fecha(desfase.atrasada),
                  adelantada: fecha(desfase.adelantada),
                  dias: String(desfase.dias),
                },
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
