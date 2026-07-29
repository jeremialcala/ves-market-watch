import { formatDecimal, formatPct } from "../lib/decimal";
import { UMBRAL_P2P_MS } from "../lib/freshness";
import { useMarket } from "../state/marketStore";
import { FreshnessBadge } from "./FreshnessBadge";
import { NoDataState } from "./NoDataState";

/** Headline del tablero: la brecha BCV↔P2P como stat tile (no gráfico). */
export function GapPanel() {
  const { indicadores } = useMarket();
  if (indicadores === null) {
    return (
      <section className="panel" aria-label="Brecha cambiaria">
        <h2>Brecha BCV ↔ P2P</h2>
        <NoDataState detalle="Sin indicadores calculados todavía." />
      </section>
    );
  }
  const { gap_pct, gap_abs, spread_pct, official_stale } = indicadores;
  return (
    <section className="panel" aria-label="Brecha cambiaria">
      <h2>
        Brecha BCV ↔ P2P (lado buy)
        {official_stale ? (
          <span className="badge badge-stale">oficial stale</span>
        ) : null}
        <FreshnessBadge asOf={indicadores.as_of} umbralMs={UMBRAL_P2P_MS} />
      </h2>
      {gap_pct === null || gap_pct === undefined ? (
        <NoDataState detalle="Sin snapshot P2P reciente que alimente la brecha — se muestra en cuanto llegue (—)." />
      ) : (
        <div className="kpi">
          <span className="numero">{formatPct(gap_pct)}</span>
          <span className="sufijo">
            {gap_abs !== null && gap_abs !== undefined
              ? `${formatDecimal(gap_abs, { maxDecimales: 2 })} VES sobre la oficial`
              : "—"}
          </span>
        </div>
      )}
      <div className="detalle">
        Spread BUY↔SELL:{" "}
        {spread_pct !== null && spread_pct !== undefined
          ? formatPct(spread_pct)
          : "—"}{" "}
        · calc v{indicadores.calc_version}
      </div>
    </section>
  );
}
