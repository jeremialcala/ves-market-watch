/**
 * Envoltorio de sparkline con tooltip propio, el mismo en toda la vista.
 *
 * Lo que arregla: el único tooltip que había era el de Recharts, en los paneles
 * de la parrilla, y se pintaba dentro del flujo de la tarjeta — tapaba la línea
 * de apertura y empujaba el layout al aparecer. Los 24 sparklines de la tabla
 * enfrentada, «qué se movió» y microestructura no tenían ninguno: la serie se
 * veía pero no se podía leer ni un valor.
 *
 * Cómo no vuelve a tapar nada:
 *
 * - `position: absolute` sobre un contenedor `relative` que es el propio hueco
 *   del sparkline, así que **sale del flujo**: aparecer no mueve un píxel.
 * - `pointer-events: none`, para que no se robe el puntero y provoque el
 *   parpadeo clásico (entra el tooltip → sale del gráfico → se cierra → vuelve).
 * - `translate(−50%, −100%)` con 8 px de separación: se ancla EXACTAMENTE sobre
 *   el punto —las coordenadas son las mismas que dibuja la línea, de
 *   `coordenadasSparkline`— y crece hacia arriba.
 * - Cerca del borde del viewport **voltea**: a menos de 120 px se ancla por su
 *   lado en vez de centrarse, y no se sale de la pantalla.
 *
 * En **táctil no se muestra**: sin hover no hay forma de cerrarlo salvo tocando
 * otra cosa, y en un móvil taparía justo la tarjeta que se acaba de tocar. El
 * dato exacto de cada bucket está en «Exportar sesión», que es la vía que sí
 * funciona sin puntero.
 */

import { useRef, useState, type ReactNode } from "react";

import { useI18n } from "../i18n/contexto";
import { valorConUnidad } from "../lib/delta";
import { horaVET, type PuntoIntradia } from "../lib/intradia";
import { coordenadasSparkline } from "../lib/movimiento";

/** Margen al borde del viewport bajo el cual el tooltip se voltea. */
export const MARGEN_VOLTEO_PX = 120;

/** Separación entre el punto y el tooltip. */
const OFFSET_PX = 8;

export function ChispaConTooltip({
  puntos,
  ancho,
  alto,
  pad = 4,
  color,
  unidad,
  decimales,
  /** `true` cuando el trazo no lo dibujamos nosotros (Recharts tiene su escala). */
  anclarArriba = false,
  className,
  children,
}: {
  puntos: readonly PuntoIntradia[];
  ancho: number;
  alto: number;
  pad?: number;
  color: string;
  unidad: string;
  decimales: number;
  anclarArriba?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { idioma } = useI18n();
  const contenedor = useRef<HTMLDivElement>(null);
  const [indice, setIndice] = useState<number | null>(null);
  const [voltear, setVoltear] = useState<"izq" | "der" | null>(null);

  function alMover(evento: React.PointerEvent<HTMLDivElement>) {
    // Táctil fuera: sin hover no hay forma de cerrarlo (ver el docstring).
    if (evento.pointerType === "touch" || puntos.length === 0) {
      return;
    }
    const caja = contenedor.current?.getBoundingClientRect();
    if (caja === undefined || caja.width === 0) {
      return;
    }
    const fraccion = (evento.clientX - caja.left) / caja.width;
    const i = Math.min(
      puntos.length - 1,
      Math.max(0, Math.round(fraccion * (puntos.length - 1))),
    );
    setIndice(i);
    const xEnPantalla = caja.left + (i / Math.max(1, puntos.length - 1)) * caja.width;
    setVoltear(
      window.innerWidth - xEnPantalla < MARGEN_VOLTEO_PX
        ? "der"
        : xEnPantalla < MARGEN_VOLTEO_PX
          ? "izq"
          : null,
    );
  }

  const coords = coordenadasSparkline(puntos, ancho, alto, pad);
  const punto = indice === null ? undefined : puntos[indice];
  const coord = indice === null ? undefined : coords[indice];

  return (
    <div
      ref={contenedor}
      className={`vmw-chispa ${className ?? ""}`}
      onPointerMove={alMover}
      onPointerLeave={() => setIndice(null)}
      onPointerCancel={() => setIndice(null)}
    >
      {children}
      {punto !== undefined && coord !== undefined && (
        <div
          className="vmw-chispa__tooltip"
          role="tooltip"
          data-voltear={voltear ?? "no"}
          style={{
            left: `${(coord.x / ancho) * 100}%`,
            top: anclarArriba ? 0 : `${(coord.y / alto) * 100}%`,
            marginTop: `-${OFFSET_PX}px`,
          }}
        >
          <span className="vmw-chispa__hora">{horaVET(punto.t)} VET</span>
          <span className="vmw-chispa__valor" style={{ color }}>
            {valorConUnidad(punto.valor, { unidad, decimales, idioma })}
          </span>
        </div>
      )}
    </div>
  );
}
