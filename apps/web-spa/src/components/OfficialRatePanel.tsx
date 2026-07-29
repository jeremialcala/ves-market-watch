import { formatDecimal } from "../lib/decimal";
import { UMBRAL_OFICIAL_MS } from "../lib/freshness";
import { useMarket } from "../state/marketStore";
import { MONEDAS_BCV } from "../state/resync";
import { FreshnessBadge } from "./FreshnessBadge";
import { NoDataState } from "./NoDataState";

/** Tasa oficial BCV multi-moneda con bandera stale (ADR-0007). */
export function OfficialRatePanel() {
  const { tasas } = useMarket();
  const disponibles = MONEDAS_BCV.filter((moneda) => tasas[moneda]);
  return (
    <section className="panel" aria-label="Tasa oficial BCV">
      <h2>Tasa oficial BCV</h2>
      {disponibles.length === 0 ? (
        <NoDataState detalle="Sin tasas oficiales registradas todavía." />
      ) : (
        <div className="tarjetas">
          {disponibles.map((moneda) => {
            const tasa = tasas[moneda];
            return (
              <div className="tarjeta" key={moneda}>
                <div className="moneda">
                  <span>{moneda}/VES</span>
                  {tasa.stale ? (
                    <span className="badge badge-stale">stale</span>
                  ) : null}
                </div>
                <div className="valor">
                  {formatDecimal(tasa.rate, { maxDecimales: 4 })}
                </div>
                <div className="detalle">
                  vigente {tasa.value_date} ·{" "}
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
