import type { CSSProperties } from "react";

import type { Clave } from "../i18n/dict";
import { useI18n } from "../i18n/contexto";
import { formatDecimal, formatPct } from "../lib/decimal";
import { useMarket } from "../state/marketStore";
import { NoDataState } from "./NoDataState";

const FILAS: { clave: string; etiqueta: Clave; pct: boolean }[] = [
  { clave: "p2p_ratio_oferta_demanda", etiqueta: "micro.ratio", pct: false },
  { clave: "p2p_momentum_bid_3h_pct", etiqueta: "micro.momentum", pct: true },
  { clave: "p2p_drenaje_oferta_6h_pct", etiqueta: "micro.drenaje", pct: true },
  { clave: "p2p_merchants_pct_buy", etiqueta: "micro.merchants", pct: true },
  { clave: "p2p_outliers_pct_buy", etiqueta: "micro.outliers", pct: true },
  { clave: "p2p_outliers_pct_sell", etiqueta: "micro.outliersSell", pct: true },
  { clave: "p2p_spread_pct", etiqueta: "micro.spread", pct: true },
];

/** Microestructura P2P (ADR-0014): los insumos de las señales, en crudo. */
export function MicrostructurePanel() {
  const { t, idioma } = useI18n();
  const { vigentes } = useMarket();
  const disponibles = FILAS.filter((fila) => vigentes[fila.clave]);
  return (
    <div className="vmw-tarjeta" aria-label={t("micro.titulo")}>
      <div className="vmw-eyebrow">{t("micro.titulo")}</div>
      {disponibles.length === 0 ? (
        <NoDataState detalle={t("micro.sinDatos")} />
      ) : (
        <dl
          className="vmw-grid"
          style={
            { "--min": "150px", marginTop: "18px", gap: "18px 24px" } as CSSProperties
          }
        >
          {disponibles.map((fila) => {
            const vigente = vigentes[fila.clave];
            return (
              <div key={fila.clave}>
                <dt
                  style={{
                    fontSize: "var(--fs-meta)",
                    color: "var(--text-muted)",
                  }}
                >
                  {t(fila.etiqueta)}
                </dt>
                <dd
                  className="vmw-cifra"
                  style={{ margin: "4px 0 0", fontSize: "22px" }}
                >
                  {fila.pct
                    ? formatPct(vigente.value, 2, idioma)
                    : formatDecimal(vigente.value, { maxDecimales: 2, idioma })}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
