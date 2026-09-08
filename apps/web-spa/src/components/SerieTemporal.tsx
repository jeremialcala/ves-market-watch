/**
 * Serie temporal: **el** gráfico de líneas de Criterio.
 *
 * Un solo componente para la serie evaluada, la tasa oficial y lo que venga.
 * Las diferencias entre gráficos son **flags**, no implementaciones: la oficial
 * es esta misma serie con casi todo apagado y el área encendida.
 *
 * Antes había dos SVG escritos a mano que fueron divergiendo — uno ganó el eje
 * de valores y el otro no, uno recibió el crosshair y el otro lo copió después.
 * Cada capacidad nueva costaba dos veces y se arreglaba una.
 *
 * ### Lo que NO es configurable, a propósito
 *
 * El estilo es del sistema y no se pasa por props: gridlines de 1 px
 * `var(--border)`, trazo de 2,2 px con uniones y extremos redondeados, ticks de
 * valores en una columna de 66 px, fechas debajo. Sin sombra, sin degradado de
 * trazo y sin más animación que el revelado estándar —`--dur-reveal` con
 * `--ease-out-expo`—, que se detiene con `prefers-reduced-motion`.
 *
 * Un gráfico que acepta su propio grosor de línea acaba teniendo tantos estilos
 * como llamantes.
 *
 * ### Contrato de los puntos
 *
 * Se conserva `Punto = {t, valor}` en vez de `{t, v}`: es el tipo compartido de
 * `lib/series`, y lo usan también `GapPanel`, `MetricCard` y `SideBySide`.
 * Renombrar el campo aquí obligaría a mapear en cada llamante para no ganar
 * nada.
 *
 * ### Accesibilidad
 *
 * El gráfico es **enfocable con teclado**: al recibir foco señala el último
 * punto, las flechas recorren la serie, Inicio/Fin saltan a los extremos y
 * Escape suelta. Antes el tooltip solo existía con ratón o dedo, así que la
 * serie era ilegible sin ellos.
 */

import { useRef, useState, type KeyboardEvent } from "react";

import { useI18n } from "../i18n/contexto";
import type { Idioma } from "../i18n/idioma";
import { toChartNumber } from "../lib/decimal";
import { marcasTiempo, puntosTemporales } from "../lib/ejeTiempo";
import { percentilDisc, type EscalaY, type Punto } from "../lib/series";
import {
  anclajeTooltip,
  contextoPunto,
  fraccionDe,
} from "../lib/tooltipSerie";
import { useAncho } from "../lib/useAncho";
import { useCrosshair } from "../lib/useCrosshair";
import { TooltipGrafico } from "./TooltipGrafico";

const ANCHO = 1060;
const PAD = 14;
/** Cuatro gridlines, y las etiquetas del eje en las MISMAS fracciones. */
const FRACCIONES = [0, 1 / 3, 2 / 3, 1] as const;

export interface CapasSerie {
  /** Banda del 80 % central de la ventana. */
  banda?: boolean;
  /** Mediana de la ventana, discontinua. */
  mediana?: boolean;
  /** Umbral de la regla asociada; `null` = la serie no tiene regla. */
  umbral?: string | null;
  /** Marca horizontal del valor de hoy. */
  hoy?: boolean;
  /** Rellena bajo el trazo. Es lo que distingue contexto de protagonista. */
  area?: boolean;
  /** Columna de valores a la izquierda. */
  ejeY?: boolean;
  /** Crosshair, punto y tooltip. */
  tooltip?: boolean;
}

export function SerieTemporal({
  puntos,
  color,
  alto,
  formato,
  unidad = "",
  dias,
  idioma,
  etiqueta,
  banda = false,
  mediana = false,
  umbral = null,
  hoy = false,
  area = false,
  ejeY = false,
  tooltip = false,
}: CapasSerie & {
  puntos: readonly Punto[];
  color: string;
  alto: number;
  /** Cómo se escribe un valor de esta serie. */
  formato: (valor: string) => string;
  unidad?: string;
  dias: number;
  idioma: Idioma;
  etiqueta: string;
}) {
  const { t } = useI18n();
  const ejeRef = useRef<HTMLDivElement>(null);
  const marcoRef = useRef<HTMLDivElement>(null);
  const anchoEje = useAncho(ejeRef, ANCHO);
  const { activo, manejadores, setActivo } = useCrosshair(marcoRef, puntos);
  const [porTeclado, setPorTeclado] = useState(false);

  const valores = puntos.map((p) => toChartNumber(p.valor));
  const p10 = banda ? percentilDisc(puntos, 0.1) : null;
  const p90 = banda ? percentilDisc(puntos, 0.9) : null;
  const medianaVal = percentilDisc(puntos, 0.5) ?? puntos[0].valor;
  const hoyVal = puntos[puntos.length - 1].valor;

  // El dominio incluye las capas de referencia: un umbral fuera del recorrido
  // se dibujaría fuera del viewBox, y el hueco se leería como «no hay umbral».
  const extras = [p10, p90, mediana ? medianaVal : null, umbral, hoy ? hoyVal : null]
    .filter((v): v is string => v !== null)
    .map(toChartNumber);
  const min = Math.min(...valores, ...extras);
  const max = Math.max(...valores, ...extras);
  const escala: EscalaY = { min, max };
  const span = max - min || 1;
  const aY = (v: number) => alto - PAD - ((v - min) / span) * (alto - PAD * 2);
  const horizontal = (valor: string) => {
    const y = aY(toChartNumber(valor)).toFixed(1);
    return `0,${y} ${ANCHO},${y}`;
  };

  const linea = puntosTemporales(puntos, ANCHO, alto, PAD, escala);
  const fx = activo === null ? 0 : fraccionDe(puntos, activo);
  const fy = activo === null ? 0 : aY(valores[activo]) / alto;

  function teclas(evento: KeyboardEvent<HTMLDivElement>) {
    const ultimo = puntos.length - 1;
    const actual = activo ?? ultimo;
    const mover = (destino: number) => {
      evento.preventDefault();
      setPorTeclado(true);
      setActivo(Math.min(ultimo, Math.max(0, destino)));
    };
    if (evento.key === "ArrowRight") mover(actual + 1);
    else if (evento.key === "ArrowLeft") mover(actual - 1);
    else if (evento.key === "Home") mover(0);
    else if (evento.key === "End") mover(ultimo);
    else if (evento.key === "Escape") setActivo(null);
  }

  return (
    <div className="vmw-serie">
      <div className={`vmw-serie__marco${ejeY ? " vmw-serie__marco--eje" : ""}`}>
        {ejeY && (
          <div className="vmw-serie__valores" aria-hidden="true">
            {FRACCIONES.map((fraccion) => (
              <span key={fraccion} style={{ top: `${(fraccion * 100).toFixed(1)}%` }}>
                {formato(String(max - fraccion * span))}
              </span>
            ))}
          </div>
        )}

        <div
          className="vmw-serie__lienzo"
          ref={marcoRef}
          {...(tooltip ? manejadores : {})}
          tabIndex={tooltip ? 0 : undefined}
          role={tooltip ? "application" : undefined}
          aria-label={tooltip ? t("serie.navegar", { serie: etiqueta }) : undefined}
          onKeyDown={tooltip ? teclas : undefined}
          onBlur={tooltip ? () => setPorTeclado(false) : undefined}
        >
          <svg
            viewBox={`0 0 ${ANCHO} ${alto}`}
            preserveAspectRatio="none"
            className="vmw-serie__svg"
            style={{ height: `${alto}px` }}
            role="img"
            aria-label={etiqueta}
          >
            {/* 1. Banda del 80 % central. Sin borde: es fondo, no objeto. */}
            {p10 !== null && p90 !== null && (
              <rect
                x="0"
                y={aY(toChartNumber(p90)).toFixed(1)}
                width={ANCHO}
                height={Math.max(
                  aY(toChartNumber(p10)) - aY(toChartNumber(p90)),
                  1,
                ).toFixed(1)}
                fill="var(--overlay-soft)"
                stroke="none"
              />
            )}

            {/* 2. Gridlines. `vectorEffect` porque el SVG se estira. */}
            {FRACCIONES.map((fraccion) => {
              const y = PAD + fraccion * (alto - PAD * 2);
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

            {/* 3. Mediana. */}
            {mediana && (
              <polyline
                points={horizontal(medianaVal)}
                fill="none"
                stroke="var(--sage)"
                strokeWidth="1.3"
                strokeDasharray="7 7"
                opacity="0.85"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* 4. Umbral de la regla, solo si la serie participa en alguna. */}
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

            {/* 5. Valor de hoy. `var(--white)` y no `#fff`: en tema claro vale
                   `#15181b` y un blanco literal sería invisible. */}
            {hoy && (
              <polyline
                points={horizontal(hoyVal)}
                fill="none"
                stroke="var(--white)"
                strokeWidth="1"
                strokeDasharray="2 6"
                opacity="0.5"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* 6. Área bajo el trazo: lo que distingue contexto de dato. */}
            {area && linea !== "" && (
              <polygon
                points={`0,${alto} ${linea} ${ANCHO},${alto}`}
                fill="var(--teal-tint)"
                stroke="none"
              />
            )}

            {/* 7. La serie, encima de todo: es el dato. */}
            <polyline
              className="vmw-serie__trazo"
              points={linea}
              fill="none"
              stroke={color}
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />

            {activo !== null && (
              <line
                x1={fx * ANCHO}
                y1="0"
                x2={fx * ANCHO}
                y2={alto}
                stroke="var(--border)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {activo !== null && (
            <>
              <span
                className={`vmw-serie__punto${porTeclado ? " vmw-serie__punto--foco" : ""}`}
                style={{
                  left: `${fx * 100}%`,
                  top: `${fy * 100}%`,
                  background: color,
                }}
                aria-hidden="true"
              />
              <TooltipGrafico
                t={puntos[activo].t}
                valor={puntos[activo].valor}
                unidad={unidad}
                color={color}
                contexto={contextoPunto(puntos, activo, medianaVal)}
                anclaje={anclajeTooltip(fx * anchoEje, anchoEje)}
                izquierda={fx * 100}
                arriba={fy * 100}
                idioma={idioma}
              />
            </>
          )}
        </div>
      </div>

      {/* El eje va FUERA del SVG: con `preserveAspectRatio="none"` cualquier
          texto de dentro saldría deformado. */}
      <div
        className={`vmw-serie__fechas${ejeY ? " vmw-serie__fechas--eje" : ""}`}
        ref={ejeRef}
        aria-hidden="true"
      >
        {marcasTiempo(
          puntos[0].t,
          puntos[puntos.length - 1].t,
          dias,
          idioma,
          anchoEje,
        ).map((marca) => (
          <span key={marca.t} style={{ left: `${(marca.fraccion * 100).toFixed(2)}%` }}>
            {marca.etiqueta}
          </span>
        ))}
      </div>
    </div>
  );
}
