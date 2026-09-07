/**
 * Estado «sin datos» de un gráfico del histórico.
 *
 * Ocupa **el mismo alto que el gráfico que sustituye**, para que la tarjeta no
 * se encoja y la vista no dé un salto al cambiar de serie.
 *
 * Dice **qué falta y desde cuándo**. Un gráfico vacío sin explicación y un
 * spinner eterno son el mismo fallo con dos caras: ninguno de los dos deja
 * saber si el problema es que no hay dato, que no ha cargado, o que se pidió
 * algo que no existe.
 */

import { Icon } from "../ds/components";
import { useI18n } from "../i18n/contexto";
import type { Idioma } from "../i18n/idioma";

const LOCALE: Record<Idioma, string> = { es: "es-VE", en: "en-US" };

export function SinDatosGrafico({
  titulo,
  serie,
  desde,
  alto = 280,
  idioma,
}: {
  titulo: string;
  /** Nombre legible de lo que falta. */
  serie: string;
  /** Inicio de la ventana pedida: el «desde cuándo» de la ausencia. */
  desde: number;
  alto?: number;
  idioma: Idioma;
}) {
  const { t } = useI18n();
  return (
    <div className="vmw-vacio" style={{ minHeight: `${alto}px` }} role="status">
      <Icon name="nodes" size={42} className="vmw-vacio__icono" />
      <span className="vmw-vacio__titulo">{titulo}</span>
      <span className="vmw-vacio__linea">
        {t("historico.vacioDetalle", {
          serie,
          fecha: new Intl.DateTimeFormat(LOCALE[idioma], {
            day: "numeric",
            month: "long",
          }).format(new Date(desde)),
        })}
      </span>
    </div>
  );
}
