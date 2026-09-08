import { PanelRiesgos } from "../components/PanelRiesgos";
import { NoDataState } from "../components/NoDataState";
import { useI18n } from "../i18n/contexto";
import { formatDecimal, formatPct, toChartNumber } from "../lib/decimal";
import { useMarket } from "../state/marketStore";

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
 * Vista «Análisis comprensivo».
 *
 * **Ya no queda nada de ejemplo aquí.** Los riesgos pasaron a dato servido el
 * 2026-09-07 y los **escenarios se retiraron** el mismo día: afirmaban una
 * probabilidad y un rango de la brecha a 72 h, y eso no es que faltara
 * calcularlo — es que no se puede construir. El régimen sobre el que
 * pretendían condicionar dura menos de una hora contra ese horizonte, así que
 * acumular más meses tampoco lo arreglaría
 * (`docs/01-requirements/analisis-comprensivo.md`).
 *
 * Lo que queda son las dos cosas que sí se miden: cuánta liquidez sostiene cada
 * lado del libro, y qué riesgos vigila la plataforma sobre sí misma.
 */
export function AnalysisView() {
  const { t, idioma } = useI18n();
  const { indicadores } = useMarket();

  return (
    <main className="vmw-vista">
      <div className="vmw-contenedor">
        <div className="vmw-eyebrow" style={{ color: "var(--teal)" }}>
          <span>{t("analisis.kicker")}</span>
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
