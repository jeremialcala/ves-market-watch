/**
 * Profundidad P2P por bandas de 0,5 % — small multiples por lado (nunca doble
 * eje): barras horizontales finas, un color fijo por lado (slots categóricos
 * validados), tooltip con el string decimal exacto.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Profundidad } from "../api/endpoints";
import { formatDecimal, toChartNumber } from "../lib/decimal";
import { useMarket } from "../state/marketStore";
import { NoDataState } from "./NoDataState";

const COLOR_LADO = {
  buy: "var(--series-buy)",
  sell: "var(--series-sell)",
} as const;

function LadoChart({
  lado,
  datos,
}: {
  lado: "buy" | "sell";
  datos: Profundidad;
}) {
  const filas = datos.levels.map((nivel) => ({
    banda: formatDecimal(nivel.price_band, { maxDecimales: 1 }),
    volumen: toChartNumber(nivel.cum_volume),
    volumenStr: nivel.cum_volume,
  }));
  if (filas.length === 0) {
    return <NoDataState detalle="Sin niveles legibles en el último snapshot." />;
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={filas} layout="vertical" margin={{ left: 8, right: 12 }}>
        <CartesianGrid stroke="var(--grid-chart)" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
          tickFormatter={(valor: number) =>
            Intl.NumberFormat("es-VE", { notation: "compact" }).format(valor)
          }
          stroke="var(--border)"
        />
        <YAxis
          type="category"
          dataKey="banda"
          width={70}
          tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
          stroke="var(--border)"
        />
        <Tooltip
          cursor={{ fill: "var(--grid-chart)" }}
          contentStyle={{
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--text-primary)",
          }}
          formatter={(_valor, _nombre, item) => [
            `${formatDecimal(
              (item.payload as { volumenStr: string }).volumenStr,
              { maxDecimales: 0 },
            )} USDT`,
            "acumulado",
          ]}
        />
        <Bar
          dataKey="volumen"
          fill={COLOR_LADO[lado]}
          radius={[0, 4, 4, 0]}
          barSize={10}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DepthChart() {
  const { profundidad } = useMarket();
  return (
    <section className="panel panel-ancho" aria-label="Profundidad P2P">
      <h2>
        Profundidad P2P — volumen acumulado por banda de 0,5 %
        <span className="badge" style={{ borderColor: "var(--series-buy)" }}>
          compra (buy)
        </span>
        <span className="badge" style={{ borderColor: "var(--series-sell)" }}>
          venta (sell)
        </span>
      </h2>
      <div className="tarjetas" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {(["buy", "sell"] as const).map((lado) => {
          const datos = profundidad[lado];
          return (
            <div key={lado}>
              {datos === undefined ? (
                <NoDataState detalle={`Sin snapshot del lado ${lado}.`} />
              ) : (
                <LadoChart lado={lado} datos={datos} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
