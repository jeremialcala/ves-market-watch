/**
 * El cero como RESULTADO, no como hueco.
 *
 * `p2p_outliers_pct` en cero significa que el filtro MAD/IQR no tuvo que
 * descartar ni un anuncio: el snapshot vino limpio. Dibujarlo como una chispa
 * plana lo cuenta como si faltara el dato —una línea sin relieve es lo mismo que
 * se ve cuando una serie no llega— y un «0 %» sin más obliga a saberse de
 * memoria que ahí el cero es bueno.
 *
 * Por eso el área de la serie se sustituye por una línea hairline centrada —hay
 * dato, y es constante— y la frase que lo interpreta, en salvia porque es el
 * color con el que este proyecto marca la validación.
 *
 * Solo aparece donde el proyecto TIENE una lectura del cero (`etiquetaCero` del
 * catálogo). Para el resto de series, cero es un valor como otro cualquiera y se
 * pinta la chispa normal: inventar una frase sería afirmar algo que nadie ha
 * interpretado.
 */

import type { Clave } from "../i18n/dict";
import { useI18n } from "../i18n/contexto";

export function SerieEnCero({
  etiqueta,
  className,
}: {
  etiqueta: Clave;
  /** La misma clase que ocupaba la chispa, para conservar el hueco. */
  className: string;
}) {
  const { t } = useI18n();
  return (
    <div className={`vmw-cero ${className}`}>
      <span className="vmw-cero__linea" aria-hidden="true" />
      <span className="vmw-cero__etiqueta">{t(etiqueta)}</span>
    </div>
  );
}
