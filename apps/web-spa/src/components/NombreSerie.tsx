/**
 * El par etiqueta ↔ clave, pintado igual en todos los bloques del Intradía.
 *
 * Arriba la etiqueta legible en caja de oración; debajo la clave técnica en
 * snake_case. Las dos salen de `presentacionDe` —un solo catálogo—, así que la
 * tabla enfrentada, «qué se movió», microestructura y la cronología nombran la
 * misma serie con las mismas palabras.
 *
 * **La clave es la del contrato, tal cual.** No se traduce (RF-9) ni se maquilla:
 * es lo que se escribe en una consulta, en un ticket o lo que sale en el CSV. Un
 * rótulo más bonito que no existiera en `indicators` sería un identificador que
 * falla en cuanto alguien lo copia.
 *
 * Un indicador que no esté en el catálogo se queda con su nombre canónico como
 * etiqueta y sin segunda línea: repetir la misma cadena dos veces no informa
 * (RF-7 promete que aparece igual, no que tenga rótulo).
 */

import { useI18n } from "../i18n/contexto";
import { presentacionDe } from "../lib/intradia";

export function NombreSerie({
  indicador,
  claseEtiqueta,
  claseClave = "vmw-serie__clave",
}: {
  /** Nombre canónico, con sufijo de lado o sin él (la familia de la tabla). */
  indicador: string;
  claseEtiqueta: string;
  claseClave?: string;
}) {
  const { t } = useI18n();
  const { etiqueta, clave } = presentacionDe(indicador);

  if (etiqueta === null) {
    return (
      <span className={claseEtiqueta} title={clave}>
        {clave}
      </span>
    );
  }
  return (
    <>
      <span className={claseEtiqueta} title={clave}>
        {t(etiqueta)}
      </span>
      <span className={claseClave}>{clave}</span>
    </>
  );
}
