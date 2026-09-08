/**
 * Presión de liquidez: cuánto volumen sostiene cada lado del libro.
 *
 * Vivía en la vista de Análisis, que se disolvió el 2026-09-07. Su sitio es
 * **junto a la profundidad**, porque las dos responden a la misma pregunta con
 * distinto grano: aquí, cuánto hay en total a cada lado; en `DepthChart`, cómo
 * se reparte ese volumen por bandas de 0,5 % alrededor del precio. Resumen y
 * detalle, en ese orden.
 *
 * Sale de `p2p_liquidez_{buy,sell}` vigentes, que el store proyecta como
 * `volumes`. Este componente es su **único** consumidor en el producto.
 */

import { useI18n } from "../i18n/contexto";
import { formatDecimal, formatPct, toChartNumber } from "../lib/decimal";
import { useMarket } from "../state/marketStore";
import { NoDataState } from "./NoDataState";

function Barra() {
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

/** El bloque completo, con su cabecera: se monta como hermano de `DepthChart`,
 *  que también trae la suya. */
export function PresionLiquidez() {
  const { t, idioma } = useI18n();
  const { indicadores } = useMarket();

  return (
    <section className="vmw-seccion" aria-label={t("analisis.liquidezTitulo")}>
      <div className="vmw-seccion__cabecera">
        <h3 className="vmw-seccion__titulo">{t("analisis.liquidezTitulo")}</h3>
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
      <Barra />
    </section>
  );
}
