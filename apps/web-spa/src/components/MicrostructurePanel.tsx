import { formatDecimal, formatPct } from "../lib/decimal";
import { useMarket } from "../state/marketStore";
import { NoDataState } from "./NoDataState";

const FILAS: { clave: string; etiqueta: string; pct: boolean }[] = [
  { clave: "p2p_ratio_oferta_demanda", etiqueta: "Ratio oferta/demanda", pct: false },
  { clave: "p2p_momentum_bid_3h_pct", etiqueta: "Momentum bid 3 h", pct: true },
  { clave: "p2p_drenaje_oferta_6h_pct", etiqueta: "Drenaje oferta 6 h", pct: true },
  { clave: "p2p_merchants_pct_buy", etiqueta: "Merchants (buy)", pct: true },
  { clave: "p2p_outliers_pct_buy", etiqueta: "Outliers (buy)", pct: true },
  { clave: "p2p_outliers_pct_sell", etiqueta: "Outliers (sell)", pct: true },
];

/** Microestructura P2P (ADR-0014): los insumos de las señales, en crudo. */
export function MicrostructurePanel() {
  const { vigentes } = useMarket();
  const disponibles = FILAS.filter((fila) => vigentes[fila.clave]);
  return (
    <section className="panel" aria-label="Microestructura P2P">
      <h2>Microestructura P2P</h2>
      {disponibles.length === 0 ? (
        <NoDataState detalle="Sin microestructura todavía (llega con los snapshots P2P)." />
      ) : (
        <dl className="metricas">
          {disponibles.map((fila) => {
            const vigente = vigentes[fila.clave];
            return (
              <div className="metrica" key={fila.clave}>
                <dt>{fila.etiqueta}</dt>
                <dd>
                  {fila.pct
                    ? formatPct(vigente.value)
                    : formatDecimal(vigente.value, { maxDecimales: 2 })}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}
