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
import { PanelRiesgos } from "../components/PanelRiesgos";
import { P2PReferencePanel } from "../components/P2PReferencePanel";
import { PresionLiquidez } from "../components/PresionLiquidez";
import { RuleDistance } from "../components/RuleDistance";

/**
 * Vista en vivo: alimentada por el marketStore (push WSS + resync REST) y, para
 * el contexto histórico, por `/indicators/history`.
 *
 * El orden lo manda una pregunta: **qué está pasando** (la lectura, a todo el
 * ancho), **con qué número** (la brecha), **qué está a punto de pasar** (la
 * distancia al disparo) y solo entonces el detalle. La microestructura ya no
 * está aquí — vive en Intradía, con el resto de indicadores del día.
 *
 * ### Los dos bloques que llegaron al disolver Análisis (2026-09-07)
 *
 * La vista de Análisis se quedó en dos bloques al retirar los escenarios, y
 * ninguno de los dos era análisis del mercado: uno es dato del libro y el otro
 * son autodiagnósticos de la plataforma. Cada uno vino a donde ya tenía
 * hermanos.
 *
 * - **Presión de liquidez** va pegada a `DepthChart`: la misma pregunta con
 *   distinto grano —cuánto hay a cada lado, y cómo se reparte por bandas—.
 *   Resumen y detalle, en ese orden.
 * - **Riesgos que vigilar** cierra la vista. No es un dato más: es la lista de
 *   lo que podría dejar en falso todo lo anterior, y por eso va al final y no
 *   compitiendo con la lectura. Dos de sus cuatro condiciones ya asomaban aquí
 *   —`oficial_rancia` y `confianza_baja` como afirmaciones del régimen—, pero
 *   sin nivel ni umbral, que es lo que convierte un número en lectura.
 */
export function DashboardView() {
  return (
    <main className="vmw-vista">
      <div className="vmw-contenedor">
        <MarketRegimeCard />

        {/* La brecha y lo que le falta al aviso, lado a lado: el número y su
            consecuencia se leen juntos. */}
        <section
          className="vmw-grid"
          style={{ "--min": "400px", gap: "24px" } as CSSProperties}
        >
          <GapPanel />
          {/* Los dos minis van DENTRO de esta columna, bajo la distancia al
              disparo: son el contexto de esa lectura, no una fila aparte. De
              paso, la columna deja de quedarse corta frente a la brecha. */}
          <div className="vmw-columna">
            <RuleDistance />
            <HeadlineStats />
          </div>
        </section>

        <GaugePanel />
        <GapDecomposition />
        <GapHeatmap />

        {/* La referencia y de qué está hecha, lado a lado. */}
        <section
          className="vmw-grid"
          style={{ "--min": "400px", gap: "24px" } as CSSProperties}
        >
          <P2PReferencePanel />
          <DataProvenance />
        </section>
        <OfficialRatePanel />

        {/* El libro: cuánto sostiene cada lado y cómo se reparte. */}
        <PresionLiquidez />
        <DepthChart />

        {/* Lo último, a propósito: lo que podría dejar en falso lo de arriba. */}
        <PanelRiesgos />
      </div>
    </main>
  );
}
