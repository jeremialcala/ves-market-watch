import type { CSSProperties } from "react";

import type { Clave } from "../i18n/dict";
import { useI18n } from "../i18n/contexto";
import { compararDecimales, formatDecimal, formatPct, toChartNumber } from "../lib/decimal";
import { porcentajeDeMaximo } from "../lib/series";
import { useMarket } from "../state/marketStore";
import type { PayloadAnalisis } from "../ws/messages";
import { NoDataState } from "./NoDataState";

type GapHistory = NonNullable<PayloadAnalisis["gap_history"]>;
type LadoHistoria = GapHistory["sides"][number];
type Referencia = LadoHistoria["references"][number];
type Claim = NonNullable<PayloadAnalisis["reading"]>["claims"][number];

/**
 * Descomposición de la brecha + comparativa contra la historia.
 *
 * Las dos mitades son dato REAL y ninguna se calcula aquí:
 *  · la barra parte el precio P2P en «pierna oficial» + «brecha» con la tasa
 *    oficial vigente y el VWAP de compra;
 *  · las referencias 7/30/90 llegan del contrato (`gap_history`), no de una
 *    media hecha en el cliente. El SPA solo dibuja y redacta.
 *
 * Lo que esta tarjeta hace distinto del resto: **rotula el tramo REAL** de cada
 * ventana. `days_covered < days_configured` significa que la serie no alcanza la
 * ventana pedida, y entonces la fila dice «Promedio 12 d (de 30)». Antes decía
 * «Promedio 30 días» sobre 12 días de historia: el número era real y la etiqueta
 * no.
 */
export function GapDecomposition() {
  const { t, idioma } = useI18n();
  const { tasas, p2p, analisis } = useMarket();

  const oficial = tasas["USD"];
  const vwapBuy = p2p.buy?.vwap;

  const anchoOficial =
    oficial !== undefined && vwapBuy !== undefined
      ? Math.min(
          100,
          Math.max(0, (toChartNumber(oficial.rate) / toChartNumber(vwapBuy)) * 100),
        )
      : null;

  const lados = analisis?.gap_history?.sides ?? [];
  const frases = (analisis?.reading?.claims ?? [])
    .map((claim) => fraseDeHistoria(claim, t, idioma))
    .filter((frase): frase is string => frase !== null);

  return (
    <section className="vmw-seccion" aria-label={t("descomposicion.titulo")}>
      <div className="vmw-seccion__cabecera">
        <h3 className="vmw-seccion__titulo">{t("descomposicion.titulo")}</h3>
        <span className="vmw-seccion__bajada">{t("descomposicion.bajada")}</span>
      </div>

      <div className="vmw-grid" style={{ "--min": "360px" } as CSSProperties}>
        <div className="vmw-tarjeta">
          {anchoOficial === null ? (
            <NoDataState detalle={t("descomposicion.sinPiernas")} />
          ) : (
            <>
              <div className="vmw-descomp__cifras">
                <span>
                  {t("brecha.oficialPar", {
                    valor: formatDecimal(oficial.rate, { maxDecimales: 4, idioma }),
                  })}
                </span>
                <span>
                  {t("brecha.vwap", {
                    valor: formatDecimal(vwapBuy, { maxDecimales: 2, idioma }),
                  })}
                </span>
              </div>
              <div className="vmw-descomp__barra">
                <div
                  className="vmw-descomp__pierna"
                  style={{ width: `${anchoOficial.toFixed(1)}%` }}
                >
                  {t("descomposicion.piernaOficial")}
                </div>
                <div
                  className="vmw-descomp__hueco"
                  style={{ width: `${(100 - anchoOficial).toFixed(1)}%` }}
                >
                  {t("descomposicion.brecha")}
                </div>
              </div>
              <p className="vmw-nota" style={{ marginTop: "20px" }}>
                {t("descomposicion.lectura")}
              </p>
              {frases.length > 0 && (
                <p className="vmw-nota vmw-descomp__interpretacion">
                  {frases.join(" ")}
                </p>
              )}
            </>
          )}
        </div>

        <div className="vmw-tarjeta">
          <div className="vmw-eyebrow">{t("descomposicion.comparativas")}</div>
          {lados.length === 0 ? (
            <NoDataState detalle={t("descomposicion.sinHistoria")} />
          ) : (
            <div className="vmw-descomp__lados">
              {lados.map((lado) => (
                <BloqueLado key={lado.side} lado={lado} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** Un lado con su valor de hoy y sus referencias, cada una en su tramo real. */
function BloqueLado({ lado }: { lado: LadoHistoria }) {
  const { t, idioma } = useI18n();

  const filas = [
    { etiqueta: t("descomposicion.hoy"), valor: lado.current, hoy: true },
    ...lado.references.map((referencia) => ({
      etiqueta: etiquetaReferencia(referencia, t),
      valor: valorDe(referencia),
      hoy: false,
    })),
  ];

  // La barra más larga es la referencia visual; sin ella no hay proporción que
  // dibujar y las barras se quedan a cero.
  const maximo = filas
    .map((f) => f.valor)
    .filter((v): v is string => v !== null)
    .reduce<string | null>(
      (max, v) => (max === null || compararDecimales(v, max) === 1 ? v : max),
      null,
    );

  const parcial = lado.references.find(
    (r) => r.days_covered < r.days_configured,
  );

  return (
    <div>
      <div className="vmw-descomp__lado">
        {t(lado.side === "buy" ? "descomposicion.ladoCompra" : "descomposicion.ladoVenta")}
      </div>
      <div className="vmw-descomp__filas">
        {filas.map((fila) => (
          <div key={fila.etiqueta}>
            <div className="vmw-descomp__fila">
              <span>{fila.etiqueta}</span>
              <span className="vmw-descomp__valor">
                {fila.valor === null ? "—" : formatPct(fila.valor, 2, idioma)}
              </span>
            </div>
            <div className="vmw-barra" style={{ marginTop: "7px" }}>
              <div
                className="vmw-barra__relleno"
                style={{
                  width:
                    fila.valor === null || maximo === null
                      ? "0%"
                      : porcentajeDeMaximo(fila.valor, maximo),
                  background: fila.hoy ? "var(--series-buy)" : "var(--teal-dim)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
      {parcial !== undefined && (
        <p className="vmw-nota vmw-descomp__parcial">
          {t("descomposicion.tramoParcial", {
            cubiertos: String(parcial.days_covered),
          })}
        </p>
      )}
    </div>
  );
}

/**
 * La ventana más ancha lleva el máximo; las demás, la media.
 *
 * No es capricho: comparar contra «el máximo de 90 días» dice cuán lejos se está
 * del peor momento conocido, y contra la media de 7 dice si hoy es un día raro.
 * Son preguntas distintas y cada ventana responde la suya.
 */
function valorDe(referencia: Referencia): string | null {
  return esVentanaAncha(referencia) ? referencia.max : referencia.mean;
}

function esVentanaAncha(referencia: Referencia): boolean {
  return referencia.days_configured >= 90;
}

/** La etiqueta declara el TRAMO REAL cuando la serie no llega a la ventana. */
function etiquetaReferencia(
  referencia: Referencia,
  t: (clave: Clave, params?: Record<string, string>) => string,
): string {
  const completa = referencia.days_covered >= referencia.days_configured;
  const dias = String(referencia.days_configured);
  const cubiertos = String(referencia.days_covered);
  if (esVentanaAncha(referencia)) {
    return completa
      ? t("descomposicion.maximo", { dias })
      : t("descomposicion.maximoParcial", { dias, cubiertos });
  }
  return completa
    ? t("descomposicion.media", { dias })
    : t("descomposicion.mediaParcial", { dias, cubiertos });
}

/**
 * Una frase por claim de historia, en el orden que manda el motor.
 *
 * Los claims que no son de historia devuelven `null`: los redacta
 * `MarketRegimeCard`, y repetirlos aquí sería decir dos veces lo mismo.
 */
function fraseDeHistoria(
  claim: Claim,
  t: (clave: Clave, params?: Record<string, string>) => string,
  idioma: "es" | "en",
): string | null {
  const lado =
    claim.data.lado === "sell"
      ? t("descomposicion.ladoVenta").toLowerCase()
      : t("descomposicion.ladoCompra").toLowerCase();

  switch (claim.code) {
    case "brecha_vs_historia": {
      const params = {
        lado,
        dias: claim.data.dias,
        delta: formatDecimal(claim.data.delta_pp, { maxDecimales: 2, idioma }),
      };
      if (claim.data.posicion === "por_encima") {
        return t("brechaHist.porEncima", params);
      }
      if (claim.data.posicion === "por_debajo") {
        return t("brechaHist.porDebajo", params);
      }
      return t("brechaHist.enLinea", params);
    }
    case "brecha_extremo":
      return t(
        claim.data.tipo === "maximo" ? "brechaHist.maximo" : "brechaHist.minimo",
        { lado, dias: claim.data.dias },
      );
    case "historia_parcial":
      return t("brechaHist.parcial", {
        lado,
        dias: claim.data.dias,
        ventana: claim.data.ventana,
      });
    default:
      return null;
  }
}
