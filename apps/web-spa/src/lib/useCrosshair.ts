import { useCallback, useEffect, useState, type RefObject } from "react";

import { puntoMasCercano } from "./tooltipSerie";
import type { Punto } from "./series";

/**
 * Crosshair sobre un gráfico: qué punto está señalado y con qué gesto.
 *
 * ### Ratón y táctil no se comportan igual, a propósito
 *
 * Con puntero fino, el crosshair sigue al cursor y desaparece al salir. En
 * táctil eso no existe —no hay «pasar por encima»—, así que **se abre con un
 * toque y se cierra tocando fuera**. Tratar el táctil como un ratón deja el
 * tooltip pegado hasta que alguien toca otra cosa por casualidad.
 */
export function useCrosshair(
  ref: RefObject<HTMLElement | null>,
  puntos: readonly Punto[],
) {
  const [activo, setActivo] = useState<number | null>(null);

  const desdeEvento = useCallback(
    (clienteX: number) => {
      const caja = ref.current?.getBoundingClientRect();
      if (caja === undefined || caja.width === 0) {
        return;
      }
      const fraccion = Math.min(
        1,
        Math.max(0, (clienteX - caja.left) / caja.width),
      );
      setActivo(puntoMasCercano(puntos, fraccion));
    },
    [ref, puntos],
  );

  // Cerrar al tocar fuera. Solo mientras hay algo abierto: un listener global
  // permanente por cada gráfico de la vista sería gratis de escribir y caro de
  // pagar en cada toque de la pantalla.
  useEffect(() => {
    if (activo === null) {
      return;
    }
    const fuera = (evento: PointerEvent) => {
      if (
        evento.pointerType !== "mouse" &&
        !ref.current?.contains(evento.target as Node)
      ) {
        setActivo(null);
      }
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [activo, ref]);

  return {
    activo,
    manejadores: {
      onPointerMove: (e: React.PointerEvent) => {
        if (e.pointerType === "mouse" || e.pointerType === "pen") {
          desdeEvento(e.clientX);
        }
      },
      onPointerLeave: (e: React.PointerEvent) => {
        if (e.pointerType === "mouse" || e.pointerType === "pen") {
          setActivo(null);
        }
      },
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType !== "mouse") {
          desdeEvento(e.clientX);
        }
      },
    },
  };
}
