import { DepthChart } from "../components/DepthChart";
import { GapPanel } from "../components/GapPanel";
import { MicrostructurePanel } from "../components/MicrostructurePanel";
import { OfficialRatePanel } from "../components/OfficialRatePanel";
import { P2PReferencePanel } from "../components/P2PReferencePanel";
import { SignalsFeed } from "../components/SignalsFeed";

/** Vista en vivo: alimentada por el marketStore (push WSS + resync REST). */
export function DashboardView() {
  return (
    <main className="tablero">
      <GapPanel />
      <P2PReferencePanel />
      <OfficialRatePanel />
      <MicrostructurePanel />
      <SignalsFeed />
      <DepthChart />
    </main>
  );
}
