import { useEffect, useState, type RefObject } from "react";

/**
 * Ancho real en píxeles de un elemento, observado.
 *
 * Hace falta para la regla de separación del eje temporal: 44 px son 44 px de
 * pantalla, y el gráfico se estira con `preserveAspectRatio="none"`, así que las
 * unidades del `viewBox` no sirven para decidir cuántas etiquetas caben.
 *
 * Sin `ResizeObserver` —jsdom no lo trae por defecto— devuelve el ancho de
 * respaldo, que es el del `viewBox`. En pruebas eso hace la salida determinista
 * en vez de dependiente del entorno.
 */
export function useAncho(ref: RefObject<HTMLElement | null>, respaldo: number): number {
  const [ancho, setAncho] = useState(respaldo);

  useEffect(() => {
    const nodo = ref.current;
    if (nodo === null || typeof ResizeObserver !== "function") {
      return;
    }
    const observador = new ResizeObserver(([entrada]) => {
      const medido = entrada.contentRect.width;
      if (medido > 0) {
        setAncho(medido);
      }
    });
    observador.observe(nodo);
    return () => observador.disconnect();
  }, [ref]);

  return ancho;
}
