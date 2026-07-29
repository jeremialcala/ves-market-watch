import type { ReferenciaP2P } from "../api/endpoints";
import { formatDecimal } from "../lib/decimal";
import { UMBRAL_P2P_MS } from "../lib/freshness";
import { useMarket } from "../state/marketStore";
import { FreshnessBadge } from "./FreshnessBadge";
import { NoDataState } from "./NoDataState";

function Lado({ titulo, ref_ }: { titulo: string; ref_?: ReferenciaP2P }) {
  if (ref_ === undefined) {
    return (
      <div className="tarjeta">
        <div className="moneda">
          <span>{titulo}</span>
        </div>
        <NoDataState detalle="Sin referencia fresca." />
      </div>
    );
  }
  return (
    <div className="tarjeta">
      <div className="moneda">
        <span>{titulo}</span>
        {ref_.confidence === "low" ? (
          <span className="badge badge-low">confianza baja</span>
        ) : null}
      </div>
      <div className="valor">{formatDecimal(ref_.median, { maxDecimales: 2 })}</div>
      <div className="detalle">
        VWAP {formatDecimal(ref_.vwap, { maxDecimales: 2 })} · mejor{" "}
        {formatDecimal(ref_.best_price, { maxDecimales: 2 })}
      </div>
      <div className="detalle">
        liquidez {formatDecimal(ref_.volume, { maxDecimales: 0 })} USDT ·{" "}
        <FreshnessBadge asOf={ref_.as_of} umbralMs={UMBRAL_P2P_MS} />
      </div>
    </div>
  );
}

/** Referencia P2P (mediana) de ambos lados con confianza visible. */
export function P2PReferencePanel() {
  const { p2p } = useMarket();
  return (
    <section className="panel" aria-label="Referencia P2P">
      <h2>Referencia P2P USDT/VES</h2>
      <div className="tarjetas">
        <Lado titulo="Compra (buy)" ref_={p2p.buy} />
        <Lado titulo="Venta (sell)" ref_={p2p.sell} />
      </div>
    </section>
  );
}
