import { useEffect, useState } from "react";

/** Punto de corte del diseño entre la barra ancha y la compacta. */
export const ANCHO_COMPACTO = 760;

/**
 * `true` por debajo de 760 px. Usa `matchMedia` y tolera que no exista (jsdom
 * sin stub): sin él se asume ancha, que es la variante con toda la navegación
 * visible — nunca se esconde el menú por no poder medir.
 */
export function useCompacto(): boolean {
  const [compacto, setCompacto] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const consulta = window.matchMedia(`(max-width: ${ANCHO_COMPACTO - 1}px)`);
    const aplicar = () => setCompacto(consulta.matches);
    aplicar();
    consulta.addEventListener("change", aplicar);
    return () => consulta.removeEventListener("change", aplicar);
  }, []);

  return compacto;
}
