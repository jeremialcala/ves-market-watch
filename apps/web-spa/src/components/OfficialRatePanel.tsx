import type { CSSProperties } from "react";

import { useI18n } from "../i18n/contexto";
import { formatDecimal, formatPct, signo } from "../lib/decimal";
import { relativo, UMBRAL_OFICIAL_MS } from "../lib/freshness";
import { useMarket } from "../state/marketStore";
import { MONEDAS_BCV } from "../state/resync";
import { FreshnessBadge } from "./FreshnessBadge";
import { NoDataState } from "./NoDataState";

/** `+0,69 %` / `-0,12 %`: con su unidad, y el signo siempre — también el «+».
 *  Sin el «%» la cifra queda ambigua al lado de una tasa en VES. */
function conSigno(valor: string, idioma: "es" | "en"): string {
  const texto = formatPct(valor, 2, idioma);
  return signo(valor) > 0 ? `+${texto}` : texto;
}

/** Tasa oficial BCV multi-moneda con bandera stale (ADR-0007). */
export function OfficialRatePanel() {
  const { t, idioma } = useI18n();
  const { tasas, variacionOficial } = useMarket();
  const disponibles = MONEDAS_BCV.filter((moneda) => tasas[moneda]);
  const referencia = tasas["USD"] ?? tasas[disponibles[0]];

  return (
    <section className="vmw-seccion" aria-label={t("oficial.titulo")}>
      <div className="vmw-seccion__cabecera">
        <h3 className="vmw-seccion__titulo">{t("oficial.titulo")}</h3>
        {referencia !== undefined ? (
          <span className="vmw-seccion__bajada">
            {t("oficial.bajada", {
              fecha: referencia.value_date,
              cuando: (() => {
                const { clave, n } = relativo(referencia.captured_at);
                return t(clave, { n });
              })(),
            })}
          </span>
        ) : null}
      </div>
      {disponibles.length === 0 ? (
        <div className="vmw-tarjeta">
          <NoDataState detalle={t("oficial.sinDatos")} />
        </div>
      ) : (
        <div className="vmw-grid" style={{ "--min": "150px" } as CSSProperties}>
          {disponibles.map((moneda) => {
            const tasa = tasas[moneda];
            const variacion = variacionOficial[moneda];
            return (
              <div className="vmw-tarjeta" key={moneda} style={{ padding: "20px 22px" }}>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "var(--fs-micro)",
                    letterSpacing: "0.08em",
                    color: "var(--text-dim)",
                  }}
                >
                  <span>{moneda}/VES</span>
                  {tasa.stale ? (
                    <span className="vmw-badge vmw-badge--alerta">
                      {t("oficial.stale")}
                    </span>
                  ) : null}
                </div>
                <div
                  className="vmw-cifra"
                  style={{ marginTop: "8px", fontSize: "26px" }}
                >
                  {formatDecimal(tasa.rate, { maxDecimales: 4, idioma })}
                </div>
                {/* Cuánto se movió respecto a la PUBLICACIÓN ANTERIOR. No se
                    rotula «24 h»: entre dos publicaciones cabe un fin de semana
                    o un feriado (ADR-0022), y ponerle horas sería inventar la
                    ventana. Sin variación no se escribe nada — la primera tasa
                    de una moneda no tiene contra qué compararse. */}
                {variacion !== undefined && (
                  <div
                    className="vmw-oficial__delta"
                    data-signo={signo(variacion.pct) < 0 ? "baja" : "sube"}
                  >
                    {t("oficial.variacion", {
                      delta: conSigno(variacion.pct, idioma),
                    })}
                  </div>
                )}
                <div
                  style={{
                    marginTop: "8px",
                    fontSize: "var(--fs-micro)",
                    color: "var(--text-muted)",
                  }}
                >
                  {t("oficial.vigente", { fecha: tasa.value_date })}{" "}
                  <FreshnessBadge
                    asOf={tasa.captured_at}
                    umbralMs={UMBRAL_OFICIAL_MS}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
