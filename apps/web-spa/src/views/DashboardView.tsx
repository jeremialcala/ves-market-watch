import type { CSSProperties } from "react";

import { DepthChart } from "../components/DepthChart";
import { GapDecomposition } from "../components/GapDecomposition";
import { GapHeatmap } from "../components/GapHeatmap";
import { GapPanel } from "../components/GapPanel";
import { GaugePanel } from "../components/GaugePanel";
import { MarketRegimeCard } from "../components/MarketRegimeCard";
import { MicrostructurePanel } from "../components/MicrostructurePanel";
import { OfficialRatePanel } from "../components/OfficialRatePanel";
import { P2PReferencePanel } from "../components/P2PReferencePanel";
import { SignalsFeed } from "../components/SignalsFeed";

/** Vista en vivo: alimentada por el marketStore (push WSS + resync REST) y,
 * para el contexto histórico, por `/indicators/history`. */
export function DashboardView() {
  return (
    <main className="vmw-vista">
      <div className="vmw-contenedor">
        <section
          className="vmw-grid"
          style={{ "--min": "420px", gap: "28px" } as CSSProperties}
        >
          <GapPanel />
          <MarketRegimeCard />
        </section>

        <GaugePanel />
        <GapDecomposition />
        <GapHeatmap />

        <section
          className="vmw-seccion vmw-grid"
          style={{ "--min": "400px", gap: "20px" } as CSSProperties}
        >
          <P2PReferencePanel />
          <MicrostructurePanel />
        </section>

        <OfficialRatePanel />
        <SignalsFeed />
        <DepthChart />
      </div>
    </main>
  );
}
