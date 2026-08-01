import { Stat } from "../ds/components";
import { useI18n } from "../i18n/contexto";
import { formatDecimal, formatPct } from "../lib/decimal";
import { useMarket } from "../state/marketStore";
import { DemoBadge } from "./DemoBadge";

/**
 * Tarjeta de «régimen de mercado» del diseño.
 *
 * DEMO: el régimen, su lectura y la barra de confianza NO los calcula la
 * plataforma — no hay endpoint ni indicador que los sirva. Se implementan
 * porque el diseño los pide, marcados con `DemoBadge` para que no se confundan
 * con el dato real (RF-5). Los dos `Stat` de al lado sí son reales.
 */
export function MarketRegimeCard() {
  const { t, idioma } = useI18n();
  const { vigentes } = useMarket();
  const ratio = vigentes["p2p_ratio_oferta_demanda"];
  const outliers = vigentes["p2p_outliers_pct_buy"];

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <div className="vmw-tarjeta" style={{ padding: "24px 26px" }}>
        <div className="vmw-eyebrow">
          <span>{t("regimen.titulo")}</span>
          <DemoBadge />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginTop: "12px",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "var(--radius-pill)",
              background: "var(--teal)",
              boxShadow: "var(--glow-dot)",
              color: "var(--teal)",
            }}
          />
          <span
            className="vmw-cifra"
            style={{ fontSize: "clamp(22px, 3vw, 27px)" }}
          >
            {t("regimen.ejemploTitulo")}
          </span>
        </div>
        <p className="vmw-nota" style={{ marginTop: "12px" }}>
          {t("regimen.ejemploTexto")}
        </p>
        <div style={{ marginTop: "18px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "var(--fs-caption)",
              color: "var(--text-dim)",
            }}
          >
            <span>{t("regimen.confianza")}</span>
            <span>{t("regimen.ejemploConfianza")}</span>
          </div>
          <div className="vmw-barra" style={{ marginTop: "8px" }}>
            <div
              className="vmw-barra__relleno"
              style={{
                width: "68%",
                background: "linear-gradient(90deg, var(--teal), var(--sage))",
              }}
            />
          </div>
        </div>
      </div>

      <div className="vmw-grid" style={{ "--min": "180px" } as React.CSSProperties}>
        <div className="vmw-tarjeta--sm vmw-tarjeta">
          <div className="vmw-eyebrow">{t("micro.outliers")}</div>
          <Stat
            tone="sage"
            style={{ marginTop: "10px" }}
            value={
              outliers !== undefined
                ? formatPct(outliers.value, 2, idioma)
                : "—"
            }
            label={t("micro.outliersNota")}
          />
        </div>
        <div className="vmw-tarjeta--sm vmw-tarjeta">
          <div className="vmw-eyebrow">{t("micro.ratio")}</div>
          <Stat
            tone="teal"
            style={{ marginTop: "10px" }}
            value={
              ratio !== undefined
                ? formatDecimal(ratio.value, { maxDecimales: 2, idioma })
                : "—"
            }
            label={t("micro.ratioNota")}
          />
        </div>
      </div>
    </div>
  );
}
