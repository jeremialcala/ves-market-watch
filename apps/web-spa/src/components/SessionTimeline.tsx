/**
 * «Cronología de la sesión» — último bloque del Intradía.
 *
 * Cada línea es un hecho que se puede señalar en una serie: el criterio vive en
 * `lib/cronologia.ts`. Aquí solo se pinta y se pone en palabras.
 *
 * El color del punto es SEMÁNTICO y usa los tokens con el significado que el
 * sistema de diseño ya les da: coral para el umbral cruzado —es lo que dispara—,
 * teal para el cambio estructural, salvia para la validación, tinta apagada para
 * la rutina. Y como el color no puede ser la única pista, cada evento lleva su
 * título escrito.
 */

import type { Clave } from "../i18n/dict";
import { useI18n, type Traducir } from "../i18n/contexto";
import { formatearDelta, valorConUnidad } from "../lib/delta";
import {
  eventosDeSesion,
  SIGMAS_SALTO,
  type ClaseEvento,
  type EventoSesion,
} from "../lib/cronologia";
import { horaVET, presentacionDe, type PuntoIntradia } from "../lib/intradia";

type AnalisisTimeline = Parameters<typeof eventosDeSesion>[2];

const COLOR_CLASE: Record<ClaseEvento, string> = {
  umbral: "var(--coral)", // umbral cruzado: lo que dispara
  liquidez: "var(--teal)", // cambio estructural del libro
  recalculo: "var(--sage)", // validación: el motor volvió a mirar
  apertura: "var(--text-dim)", // rutina
};

const TITULO_CLASE: Record<ClaseEvento, Clave> = {
  apertura: "crono.aperturaTitulo",
  umbral: "crono.umbralTitulo",
  liquidez: "crono.liquidezTitulo",
  recalculo: "crono.recalculoTitulo",
};

export function SessionTimeline({
  sesion,
  referencia,
  analisis,
}: {
  sesion: Map<string, PuntoIntradia[]>;
  referencia: Map<string, PuntoIntradia[]>;
  analisis: AnalisisTimeline;
}) {
  const { t, idioma } = useI18n();
  const eventos = eventosDeSesion(sesion, referencia, analisis);
  if (eventos.length === 0) {
    return null;
  }

  return (
    <section className="vmw-seccion" aria-label={t("crono.titulo")}>
      <div className="vmw-seccion__cabecera">
        <h3 className="vmw-seccion__titulo">{t("crono.titulo")}</h3>
        <span className="vmw-seccion__bajada">{t("crono.bajada")}</span>
      </div>
      <ol className="vmw-crono">
        {eventos.map((evento, indice) => (
          <li
            className="vmw-crono__evento"
            key={`${evento.t}-${evento.clase}-${evento.indicador ?? ""}`}
            data-ultimo={indice === eventos.length - 1 ? "si" : "no"}
          >
            <span className="vmw-crono__hora">{horaVET(evento.t)}</span>
            <span className="vmw-crono__eje" aria-hidden="true">
              <i style={{ background: COLOR_CLASE[evento.clase] }} />
              <b />
            </span>
            <div className="vmw-crono__contenido">
              <p className="vmw-crono__titulo-evento">
                {t(TITULO_CLASE[evento.clase])}
              </p>
              <p className="vmw-crono__texto">{texto(evento, t)}</p>
              {cifras(evento, t, idioma) !== "" && (
                <p className="vmw-crono__cifras">{cifras(evento, t, idioma)}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Qué pasó, en prosa. */
function texto(evento: EventoSesion, t: Traducir): string {
  const nombre = evento.indicador ?? "";
  // La prosa nombra la serie con su ETIQUETA legible —la misma que la tabla y
  // las tarjetas—; la clave canónica va abajo, en la línea de cifras.
  const { etiqueta } = presentacionDe(nombre);
  const legible = etiqueta === null ? nombre : t(etiqueta);
  switch (evento.clase) {
    case "apertura":
      return t("crono.aperturaTexto");
    case "umbral":
      return t(
        evento.cumple === true ? "crono.umbralPasa" : "crono.umbralDeja",
        { indicador: legible },
      );
    case "liquidez":
      return t("crono.liquidezTexto", {
        lado: t(
          nombre.endsWith("_buy") ? "intradia.ladoCompra" : "intradia.ladoVenta",
        ),
        sigmas: SIGMAS_SALTO,
      });
    case "recalculo":
      return t("crono.recalculoTexto");
  }
}

/** Las cifras del momento. Vacío cuando el evento no las tiene. */
function cifras(
  evento: EventoSesion,
  t: Traducir,
  idioma: "es" | "en",
): string {
  if (evento.clase === "umbral" && evento.valor !== undefined) {
    /*
     * Valor y umbral por `valorConUnidad`, no crudos del contrato: el string
     * exacto trae punto decimal y guion ASCII («-57.10523657»), y en pantalla
     * eso es otro formato distinto del de al lado. La cifra exacta es la del
     * CSV; esta es la que se lee.
     *
     * La regla va en la línea: sin ella, dos cruces del mismo indicador contra
     * umbrales distintos se leen como una línea repetida.
     */
    const { unidad, decimales, clave } = presentacionDe(evento.indicador ?? "");
    const num = (v: string) => valorConUnidad(v, { unidad, decimales, idioma });
    return t("crono.cifrasUmbral", {
      regla: evento.regla ?? "",
      // La CLAVE, no la etiqueta: esta linea es la que se copia a una consulta.
      // La etiqueta legible va en el texto del evento, arriba.
      indicador: clave,
      valor: num(evento.valor),
      umbral: evento.umbral === undefined ? "" : num(evento.umbral),
    });
  }
  if (evento.clase === "liquidez" && evento.delta !== undefined) {
    const opciones = { unidad: "USDT", decimales: 0, idioma };
    return t("crono.cifrasLiquidez", {
      /*
       * Por la función común: signo escrito, menos tipográfico y unidad pegada.
       * `apertura: null` porque un salto no se mide contra ninguna base —no hay
       * porcentaje que dar, y el criterio de si lo hay vive en un solo sitio—.
       */
      delta: formatearDelta(
        { deltaAbs: evento.delta, apertura: null },
        { ...opciones, sinCambio: t("delta.sinCambio") },
      ).texto,
      valor: valorConUnidad(evento.valor ?? "0", opciones),
      sigmas: (evento.sigmas ?? 0).toFixed(1),
    });
  }
  return "";
}
