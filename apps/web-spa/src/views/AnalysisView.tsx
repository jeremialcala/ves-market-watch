import type { CSSProperties } from "react";

import { DemoBadge } from "../components/DemoBadge";
import { PanelRiesgos } from "../components/PanelRiesgos";
import { NoDataState } from "../components/NoDataState";
import type { Clave } from "../i18n/dict";
import { useI18n } from "../i18n/contexto";
import { formatDecimal, formatPct, toChartNumber } from "../lib/decimal";
import { useMarket } from "../state/marketStore";

interface Escenario {
  nombre: Clave;
  prob: string;
  rango: string;
  texto: Clave;
  disparador: Clave;
  color: string;
  borde: string;
}

/** DEMO: escenarios y probabilidades no salen de ningún endpoint. */
const ESCENARIOS: readonly Escenario[] = [
  {
    nombre: "analisis.escBase",
    prob: "62 %",
    rango: "12,5 – 14,2 %",
    texto: "analisis.escBaseTexto",
    disparador: "analisis.escBaseDisparador",
    color: "var(--teal)",
    borde: "var(--teal-line)",
  },
  {
    nombre: "analisis.escCorrida",
    prob: "24 %",
    rango: "15,0 – 18,5 %",
    texto: "analisis.escCorridaTexto",
    disparador: "analisis.escCorridaDisparador",
    color: "var(--coral)",
    borde: "var(--coral-line)",
  },
  {
    nombre: "analisis.escConvergencia",
    prob: "14 %",
    rango: "9,0 – 12,0 %",
    texto: "analisis.escConvergenciaTexto",
    disparador: "analisis.escConvergenciaDisparador",
    color: "var(--sage)",
    borde: "var(--sage-line)",
  },
];

/** Presión de liquidez: esta sí es REAL — sale de la liquidez por lado que ya
 * proyecta el store desde los indicadores vigentes. */
function PresionLiquidez() {
  const { t, idioma } = useI18n();
  const { indicadores } = useMarket();
  const volumenes = indicadores?.volumes ?? null;

  if (volumenes === null) {
    return (
      <div className="vmw-tarjeta">
        <NoDataState detalle={t("analisis.sinLiquidez")} />
      </div>
    );
  }
  const asks = toChartNumber(volumenes.buy);
  const bids = toChartNumber(volumenes.sell);
  const total = asks + bids;
  const pctAsks = total > 0 ? (asks / total) * 100 : 50;

  return (
    <div className="vmw-tarjeta" style={{ padding: "30px 32px" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px 16px",
          justifyContent: "space-between",
          fontSize: "var(--fs-meta)",
          color: "var(--text-muted)",
        }}
      >
        <span>
          {t("analisis.asks", {
            valor: formatDecimal(volumenes.buy, { maxDecimales: 0, idioma }),
          })}
        </span>
        <span>{t("analisis.desbalance")}</span>
        <span>
          {t("analisis.bids", {
            valor: formatDecimal(volumenes.sell, { maxDecimales: 0, idioma }),
          })}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          height: "34px",
          marginTop: "12px",
          borderRadius: "var(--radius-pill)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pctAsks.toFixed(1)}%`,
            background: "var(--teal)",
            opacity: 0.85,
          }}
        />
        <div
          style={{
            width: `${(100 - pctAsks).toFixed(1)}%`,
            background: "var(--coral)",
            opacity: 0.85,
          }}
        />
      </div>
      <p className="vmw-nota" style={{ marginTop: "26px" }}>
        {t("analisis.liquidezLectura", {
          asks: formatDecimal(volumenes.buy, { maxDecimales: 0, idioma }),
          bids: formatDecimal(volumenes.sell, { maxDecimales: 0, idioma }),
        })}
      </p>
    </div>
  );
}

/**
 * Vista «Análisis comprensivo» del diseño.
 *
 * Los escenarios (con sus probabilidades) y los riesgos son DEMO: ningún
 * endpoint los produce. Van con sello para que se distingan del dato real, y
 * la bajada de la vista lo dice antes de que se lea un solo número.
 */
export function AnalysisView() {
  const { t, idioma } = useI18n();
  const { indicadores } = useMarket();

  return (
    <main className="vmw-vista">
      <div className="vmw-contenedor">
        <div className="vmw-eyebrow" style={{ color: "var(--teal)" }}>
          <span>{t("analisis.kicker")}</span>
          <DemoBadge />
        </div>
        <h1
          className="vmw-cifra"
          style={{
            margin: "14px 0 0",
            maxWidth: "860px",
            fontSize: "clamp(30px, 5vw, 46px)",
            lineHeight: 1.1,
            textWrap: "pretty",
          }}
        >
          {t("analisis.titulo")}
        </h1>
        <p
          className="vmw-nota"
          style={{ marginTop: "18px", maxWidth: "720px", fontSize: "17px" }}
        >
          {t("analisis.bajada")}
        </p>

        <section
          className="vmw-grid"
          style={{ "--min": "320px", gap: "20px", marginTop: "40px" } as CSSProperties}
        >
          {ESCENARIOS.map((escenario) => (
            <div
              className="vmw-tarjeta"
              key={escenario.nombre}
              style={{ borderColor: escenario.borde }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "10px",
                }}
              >
                <span className="vmw-eyebrow" style={{ color: escenario.color }}>
                  {t(escenario.nombre)}
                </span>
                <span className="vmw-cifra" style={{ fontSize: "22px" }}>
                  {escenario.prob}
                </span>
              </div>
              <div
                className="vmw-cifra"
                style={{ marginTop: "16px", fontSize: "30px" }}
              >
                {escenario.rango}
              </div>
              <div
                style={{
                  marginTop: "4px",
                  fontSize: "var(--fs-micro)",
                  color: "var(--text-dim)",
                }}
              >
                {t("analisis.brecha72")}
              </div>
              <p className="vmw-nota" style={{ marginTop: "16px" }}>
                {t(escenario.texto)}
              </p>
              <div
                style={{
                  marginTop: "16px",
                  paddingTop: "14px",
                  borderTop: "1px solid var(--border)",
                  fontSize: "var(--fs-meta)",
                  color: "var(--text)",
                }}
              >
                {t(escenario.disparador)}
              </div>
            </div>
          ))}
        </section>

        <section className="vmw-seccion">
          <div className="vmw-seccion__cabecera">
            <h3 className="vmw-seccion__titulo">
              {t("analisis.liquidezTitulo")}
            </h3>
            {indicadores !== null ? (
              <span className="vmw-seccion__bajada">
                {t("brecha.spread", {
                  valor:
                    indicadores.spread_pct !== null &&
                    indicadores.spread_pct !== undefined
                      ? formatPct(indicadores.spread_pct, 2, idioma)
                      : "—",
                })}
              </span>
            ) : null}
          </div>
          <PresionLiquidez />
        </section>

        <section className="vmw-seccion">
          <div className="vmw-seccion__cabecera">
            <h3 className="vmw-seccion__titulo">
              {t("analisis.riesgosTitulo")}
            </h3>
          </div>
          <PanelRiesgos />
        </section>
      </div>
    </main>
  );
}
