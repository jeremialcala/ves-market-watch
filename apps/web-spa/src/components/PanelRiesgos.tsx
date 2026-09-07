/**
 * «Riesgos que vigilar», con niveles servidos por el motor.
 *
 * ### Qué cambió
 *
 * Los cuatro niveles estaban escritos a mano en la vista. Un nivel cableado no
 * es que sea impreciso: **no puede cambiar cuando cambia el mercado**, y por eso
 * la tarjeta «Libro concentrado» decía `alto` mientras el valor real rondaba el
 * 60 % contra su propio umbral declarado de 80 %. Ahora el nivel, el valor y el
 * corte salen de `analysis.updated → risks`, con los cortes en config versionada
 * del motor (`riesgos.v1.yaml`).
 *
 * ### El orden NO se toca
 *
 * La lista llega ordenada por gravedad desde el motor —alto, medio, bajo, y al
 * final los no evaluables—. Reordenar aquí duplicaría la regla en dos sitios y
 * las dos se irían separando.
 *
 * ### `sin medir` no es `bajo`
 *
 * Un riesgo cuyo indicador no está vigente llega con `level: null`. Se pinta
 * como un cuarto estado propio, en gris y diciéndolo con todas las letras: un
 * panel de riesgos que tranquiliza porque le falta el dato es peor que uno que
 * calla. Por lo mismo se pintan **todos** los riesgos servidos, también los no
 * evaluables — uno que desaparece de la lista se lee como uno que no existe.
 */

import type { CSSProperties } from "react";

import type { Analisis } from "../api/endpoints";
import type { Clave } from "../i18n/dict";
import { useI18n } from "../i18n/contexto";
import { formatDecimal } from "../lib/decimal";
import { useMarket } from "../state/marketStore";
import { NoDataState } from "./NoDataState";

type Riesgo = NonNullable<Analisis["risks"]>["items"][number];
type Nivel = Riesgo["level"];

/** Un color por nivel. `null` va en gris: no es una buena noticia, es un hueco. */
const COLOR: Record<string, { texto: string; borde: string }> = {
  alto: { texto: "var(--coral)", borde: "var(--coral-line)" },
  medio: { texto: "var(--teal)", borde: "var(--teal-line)" },
  bajo: { texto: "var(--sage)", borde: "var(--sage-line)" },
  sinMedir: { texto: "var(--text-dim)", borde: "var(--border)" },
};

const ETIQUETA_NIVEL: Record<string, Clave> = {
  alto: "analisis.nivelAlto",
  medio: "analisis.nivelMedio",
  bajo: "analisis.nivelBajo",
  sinMedir: "analisis.nivelSinMedir",
};

/** Título y cuerpo por código, como `MarketRegimeCard` hace con los claims. */
const TEXTOS: Record<string, { titulo: Clave; cuerpo: Clave }> = {
  libro_concentrado: {
    titulo: "analisis.riesgoLibro",
    cuerpo: "analisis.riesgoLibroTexto",
  },
  oficial_rancia: {
    titulo: "analisis.riesgoRancidez",
    cuerpo: "analisis.riesgoRancidezTexto",
  },
  umbrales_sin_recalibrar: {
    titulo: "analisis.riesgoUmbrales",
    cuerpo: "analisis.riesgoUmbralesTexto",
  },
  calidad_snapshot: {
    titulo: "analisis.riesgoSnapshot",
    cuerpo: "analisis.riesgoSnapshotTexto",
  },
};

const clave = (nivel: Nivel) => nivel ?? "sinMedir";

export function PanelRiesgos() {
  const { t, idioma } = useI18n();
  const { analisis } = useMarket();
  const riesgos = analisis?.risks;

  if (!riesgos) {
    return (
      <div className="vmw-tarjeta">
        <NoDataState detalle={t("analisis.riesgosSinDato")} />
      </div>
    );
  }

  const num = (valor: string, decimales = 2) =>
    formatDecimal(valor, { maxDecimales: decimales, idioma });

  /**
   * La línea de abajo: la cifra que decidió el nivel contra su corte.
   *
   * Cada código la redacta a su manera porque las unidades no son la misma cosa
   * —un porcentaje del libro, un porcentaje de outliers, una versión de
   * ruleset—, y una frase única para las tres acabaría diciendo «80» sin unidad.
   */
  function pie(riesgo: Riesgo): string {
    if (riesgo.level === null) {
      return t("analisis.riesgoSinMedir");
    }
    const { value, threshold, source } = riesgo;
    switch (riesgo.code) {
      case "oficial_rancia":
        return t(
          riesgo.level === "alto"
            ? "analisis.riesgoRancidezSi"
            : "analisis.riesgoRancidezNo",
        );
      case "libro_concentrado":
        return value === null || threshold === null
          ? ""
          : t("analisis.riesgoLibroUmbral", {
              valor: num(value),
              umbral: num(threshold, 0),
              lado: t(
                source?.endsWith("_sell") ? "analisis.ladoSell" : "analisis.ladoBuy",
              ),
            });
      case "calidad_snapshot":
        return value === null || threshold === null
          ? ""
          : t("analisis.riesgoSnapshotUmbral", {
              valor: num(value),
              umbral: num(threshold, 0),
            });
      case "umbrales_sin_recalibrar":
        return value === null || threshold === null
          ? ""
          : t("analisis.riesgoUmbralesUmbral", {
              valor: num(value, 0),
              umbral: num(threshold, 0),
            });
      default:
        return "";
    }
  }

  return (
    <>
      <div className="vmw-grid" style={{ "--min": "380px" } as CSSProperties}>
        {riesgos.items.map((riesgo) => {
          const color = COLOR[clave(riesgo.level)];
          // Un código que el diccionario todavía no cubre se pinta con su
          // código crudo en vez de desaparecer: el motor puede desplegarse por
          // delante del cliente, y esconder un riesgo es el peor de los fallos.
          const textos = TEXTOS[riesgo.code];
          const pieTexto = pie(riesgo);
          return (
            <div
              className="vmw-tarjeta vmw-tarjeta--panel"
              key={riesgo.code}
              style={{ borderColor: color.borde, padding: "24px 26px" }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "baseline",
                  gap: "10px",
                }}
              >
                <span className="vmw-eyebrow" style={{ color: color.texto }}>
                  {t(ETIQUETA_NIVEL[clave(riesgo.level)])}
                </span>
                <span
                  className="vmw-cifra"
                  style={{ fontSize: "18px", letterSpacing: "-0.02em" }}
                >
                  {textos ? t(textos.titulo) : riesgo.code}
                </span>
              </div>
              {textos ? (
                <p className="vmw-nota" style={{ marginTop: "12px" }}>
                  {t(textos.cuerpo)}
                </p>
              ) : null}
              {pieTexto ? (
                <div
                  style={{
                    marginTop: "12px",
                    fontSize: "var(--fs-meta)",
                    color:
                      riesgo.level === null ? "var(--text-dim)" : "var(--text)",
                  }}
                >
                  {pieTexto}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <p
        className="vmw-nota"
        style={{ marginTop: "14px", fontSize: "var(--fs-micro)" }}
      >
        {t("analisis.riesgosProcedencia", { version: riesgos.version })}
      </p>
    </>
  );
}
