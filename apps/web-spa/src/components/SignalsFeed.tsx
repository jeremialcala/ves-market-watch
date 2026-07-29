import { useState } from "react";

import type { Senal } from "../api/endpoints";
import { haceRelativo } from "../lib/freshness";
import { useMarket } from "../state/marketStore";
import { NoDataState } from "./NoDataState";
import { SignalEvidenceModal } from "./SignalEvidenceModal";

const FLECHA: Record<Senal["direction"], string> = {
  alcista: "▲",
  bajista: "▼",
  neutral: "•",
};

/** Últimas señales emitidas; clic abre la evidencia (trazabilidad T10). */
export function SignalsFeed() {
  const { senales } = useMarket();
  const [abierta, setAbierta] = useState<Senal | null>(null);
  return (
    <section className="panel" aria-label="Señales">
      <h2>Señales</h2>
      {senales.length === 0 ? (
        <NoDataState detalle="Sin señales en las últimas horas — el mercado no ha disparado ninguna regla." />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {senales.map((senal) => (
            <li key={`${senal.type}-${senal.emitted_at}`}>
              <button
                type="button"
                className="senal"
                data-direction={senal.direction}
                onClick={() => setAbierta(senal)}
                title="Ver evidencia de la señal"
              >
                <span aria-hidden="true">{FLECHA[senal.direction]}</span>
                <span className="tipo">{senal.type.replaceAll("_", " ")}</span>
                <span className="detalle">
                  {senal.direction} · {senal.currency}
                </span>
                <span className="cuando">{haceRelativo(senal.emitted_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {abierta !== null ? (
        <SignalEvidenceModal senal={abierta} onCerrar={() => setAbierta(null)} />
      ) : null}
    </section>
  );
}
