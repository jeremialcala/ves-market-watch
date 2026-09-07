/**
 * Tooltip de los gráficos del histórico.
 *
 * Tres líneas, y ninguna es el volcado del dato crudo:
 *
 * 1. **Cuándo** — fecha y hora, atenuadas.
 * 2. **Cuánto** — el valor con dos decimales y su unidad detrás, en el color de
 *    la serie. Ni `USD/VES : 736,9339` ni ocho decimales: el contrato es exacto
 *    y el tooltip es para leer de un vistazo, que no es lo mismo.
 * 3. **Si eso es mucho** — percentil en la ventana y distancia a la mediana con
 *    signo. Un número solo no responde a la pregunta con la que alguien pasa el
 *    ratón por encima.
 *
 * La superficie repite el tratamiento de la navbar —fondo casi opaco con
 * `backdrop-filter`—, sin sombra de color y sin capturar el puntero: si lo
 * capturara, moverse sobre el propio tooltip cerraría el crosshair.
 */

import type { Idioma } from "../i18n/idioma";
import { useI18n } from "../i18n/contexto";
import { formatDecimal } from "../lib/decimal";
import { valorConUnidad } from "../lib/delta";
import type { ContextoPunto } from "../lib/tooltipSerie";
import { transformTooltip, type Anclaje } from "../lib/tooltipSerie";

const LOCALE: Record<Idioma, string> = { es: "es-VE", en: "en-US" };

export function TooltipGrafico({
  t: instante,
  valor,
  unidad,
  color,
  contexto,
  anclaje,
  izquierda,
  arriba,
  idioma,
}: {
  t: number;
  valor: string;
  unidad: string;
  color: string;
  contexto: ContextoPunto;
  anclaje: Anclaje;
  /** Posición del punto dentro del gráfico, en porcentaje. */
  izquierda: number;
  arriba: number;
  idioma: Idioma;
}) {
  const { t } = useI18n();
  const distancia = formatDecimal(contexto.distancia, {
    maxDecimales: 2,
    idioma,
  });

  return (
    <div
      className="vmw-tip"
      role="tooltip"
      style={{
        left: `${izquierda}%`,
        top: `${arriba}%`,
        transform: transformTooltip(anclaje),
      }}
    >
      <span className="vmw-tip__cuando">
        {new Intl.DateTimeFormat(LOCALE[idioma], {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(instante))}
      </span>
      <span className="vmw-tip__valor" style={{ color }}>
        {valorConUnidad(valor, { unidad, decimales: 2, idioma })}
      </span>
      <span className="vmw-tip__contexto">
        {t("historico.tipContexto", {
          percentil: String(contexto.percentil),
          distancia: contexto.distancia.startsWith("-")
            ? distancia
            : `+${distancia}`,
        })}
      </span>
    </div>
  );
}
