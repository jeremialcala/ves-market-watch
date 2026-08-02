import type { CSSProperties } from "react";

import { DataProvenance } from "../components/DataProvenance";
import { DepthChart } from "../components/DepthChart";
import { GapDecomposition } from "../components/GapDecomposition";
import { GapHeatmap } from "../components/GapHeatmap";
import { GapPanel } from "../components/GapPanel";
import { GaugePanel } from "../components/GaugePanel";
import {
  HeadlineStats,
  MarketRegimeCard,
} from "../components/MarketRegimeCard";
import { OfficialRatePanel } from "../components/OfficialRatePanel";
import { P2PReferencePanel } from "../components/P2PReferencePanel";
import { RuleDistance } from "../components/RuleDistance";
import { SignalsFeed } from "../components/SignalsFeed";

/**
 * Vista en vivo: alimentada por el marketStore (push WSS + resync REST) y, para
 * el contexto histórico, por `/indicators/history`.
 *
 * El orden lo manda una pregunta: **qué está pasando** (la lectura, a todo el
 * ancho), **con qué número** (la brecha), **qué está a punto de pasar** (la
 * distancia al disparo) y solo entonces el detalle. La microestructura ya no
 * está aquí — vive en Intradía, con el resto de indicadores del día.
 */
export function DashboardView() {
  return (
    <main className="vmw-vista">
      <div className="vmw-contenedor">
        <MarketRegimeCard />

        <section
          className="vmw-grid"
          style={{ "--min": "420px", gap: "28px" } as CSSProperties}
        >
          <GapPanel />
          <HeadlineStats />
        </section>

        <RuleDistance />
        <GaugePanel />
        <GapDecomposition />
        <GapHeatmap />
        <P2PReferencePanel />
        <DataProvenance />
        <OfficialRatePanel />
        <SignalsFeed />
        <DepthChart />
      </div>
    </main>
  );
}
