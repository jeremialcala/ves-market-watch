import type { CSSProperties } from "react";

import type { ReferenciaP2P } from "../api/endpoints";
import type { Clave } from "../i18n/dict";
import { useI18n } from "../i18n/contexto";
import { formatDecimal } from "../lib/decimal";
import { UMBRAL_P2P_MS } from "../lib/freshness";
import { useMarket } from "../state/marketStore";
import { FreshnessBadge } from "./FreshnessBadge";
import { NoDataState } from "./NoDataState";

function Lado({ titulo, ref_ }: { titulo: Clave; ref_?: ReferenciaP2P }) {
  const { t, idioma } = useI18n();
  if (ref_ === undefined) {
    return (
      <div className="vmw-tarjeta vmw-tarjeta--sm">
        <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-muted)" }}>
          {t(titulo)}
        </div>
        <NoDataState detalle={t("p2p.sinLado")} />
      </div>
    );
  }
  return (
    <div className="vmw-tarjeta vmw-tarjeta--sm">
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "8px",
          fontSize: "var(--fs-meta)",
          color: "var(--text-muted)",
        }}
      >
        <span>{t(titulo)}</span>
        {ref_.confidence === "low" ? (
          <span className="vmw-badge vmw-badge--alerta">
            {t("p2p.confianzaBaja")}
          </span>
        ) : null}
      </div>
      <div className="vmw-cifra" style={{ marginTop: "8px", fontSize: "30px" }}>
        {formatDecimal(ref_.median, { maxDecimales: 2, idioma })}
      </div>
      <div
        style={{
          marginTop: "8px",
          fontSize: "var(--fs-micro)",
          lineHeight: 1.6,
          color: "var(--text-muted)",
        }}
      >
        <div>
          {t("p2p.detalle", {
            vwap: formatDecimal(ref_.vwap, { maxDecimales: 2, idioma }),
            mejor: formatDecimal(ref_.best_price, { maxDecimales: 2, idioma }),
          })}
        </div>
        <div>
          {t("p2p.liquidez", {
            valor: formatDecimal(ref_.volume, { maxDecimales: 0, idioma }),
          })}{" "}
          <FreshnessBadge asOf={ref_.as_of} umbralMs={UMBRAL_P2P_MS} />
        </div>
      </div>
    </div>
  );
}

/** Referencia P2P (mediana) de ambos lados con confianza visible. */
export function P2PReferencePanel() {
  const { t } = useI18n();
  const { p2p } = useMarket();
  return (
    <div className="vmw-tarjeta vmw-tarjeta--reparte" aria-label={t("p2p.titulo")}>
      <div className="vmw-eyebrow">{t("p2p.titulo")}</div>
      <div
        className="vmw-grid vmw-crece"
        style={{ "--min": "180px", marginTop: "18px" } as CSSProperties}
      >
        <Lado titulo="p2p.compra" ref_={p2p.buy} />
        <Lado titulo="p2p.venta" ref_={p2p.sell} />
      </div>
    </div>
  );
}
