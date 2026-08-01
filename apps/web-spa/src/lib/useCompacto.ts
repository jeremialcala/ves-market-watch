import { useEffect, useState } from "react";

/**
 * Punto de corte del diseño entre la barra ancha y la compacta.
 *
 * Este número está DUPLICADO en `index.css` (la media query que esconde la tira
 * de estado). No se puede compartir una constante entre TS y CSS plano, así que
 * lo que evita la deriva es el test `tests/unit/compacto.test.ts`: si uno de los
 * dos cambia sin el otro, falla.
 */
export const ANCHO_COMPACTO = 760;

const CONSULTA = `(max-width: ${ANCHO_COMPACTO - 1}px)`;

function midePorDebajo(): boolean {
  // jsdom sin stub no trae matchMedia: se asume ancha, que es la variante con
  // toda la navegación visible — nunca se esconde el menú por no poder medir.
  return typeof window.matchMedia === "function"
    ? window.matchMedia(CONSULTA).matches
    : false;
}

/**
 * `true` por debajo de 760 px.
 *
 * El estado inicial se mide SÍNCRONAMENTE: con `useState(false)` el primer
 * pintado era siempre el ancho, así que en un móvil la tira de estado aparecía
 * un fotograma y desaparecía al correr el efecto — un salto de layout gratis.
 */
export function useCompacto(): boolean {
  const [compacto, setCompacto] = useState(midePorDebajo);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const consulta = window.matchMedia(CONSULTA);
    const aplicar = () => setCompacto(consulta.matches);
    aplicar(); // por si el ancho cambió entre el primer render y el efecto
    consulta.addEventListener("change", aplicar);
    return () => consulta.removeEventListener("change", aplicar);
  }, []);

  return compacto;
}
