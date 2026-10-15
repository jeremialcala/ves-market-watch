/**
 * Un texto del diccionario con su tramo resaltado entre `*…*` («servida por
 * API» en el titular). Así el diccionario sigue siendo texto plano y la
 * traducción decide qué palabras se resaltan, sin HTML en las cadenas.
 */

import { Fragment } from "react";

export function Resaltado({ texto, clase = "resaltado" }: { texto: string; clase?: string }) {
  const tramos = texto.split("*");
  return (
    <>
      {tramos.map((tramo, i) =>
        i % 2 === 1 ? (
          <span key={i} className={clase}>
            {tramo}
          </span>
        ) : (
          <Fragment key={i}>{tramo}</Fragment>
        ),
      )}
    </>
  );
}
