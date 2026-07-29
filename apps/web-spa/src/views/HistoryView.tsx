/**
 * Vista de histórico: series de la tasa oficial (por value_date) y de un
 * indicador canónico agregado por bucket (5m/1h/1d), con rango ≤ 90 días
 * validado en cliente, paginación transparente con progreso y cancelación.
 * Un solo eje por gráfico (dataviz); tooltips muestran el string exacto.
 */

import { useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  historialIndicadores,
  historialTasa,
  RANGO_MAX_DIAS,
  type Intervalo,
} from "../api/endpoints";
import { ApiError } from "../api/problem";
import { formatDecimal, toChartNumber } from "../lib/decimal";
import { MONEDAS_BCV } from "../state/resync";
import { NoDataState } from "../components/NoDataState";

interface Punto {
  t: number;
  etiqueta: string;
  valor: number;
  valorStr: string;
}

const INDICADORES_CANONICOS = [
  "official_rate",
  "p2p_mediana_buy",
  "p2p_mediana_sell",
  "p2p_brecha_pct_buy",
  "p2p_spread_pct",
  "p2p_ratio_oferta_demanda",
  "p2p_momentum_bid_3h_pct",
  "p2p_drenaje_oferta_6h_pct",
  "p2p_liquidez_buy",
  "p2p_liquidez_sell",
];

const PRESETS = [7, 30, 90] as const;

function formatoFechaCorta(t: number): string {
  return new Intl.DateTimeFormat("es-VE", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(t));
}

function Grafico({ puntos, titulo }: { puntos: Punto[]; titulo: string }) {
  if (puntos.length === 0) {
    return <NoDataState detalle="Sin datos en el rango seleccionado." />;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={puntos} margin={{ left: 12, right: 12, top: 8 }}>
        <CartesianGrid stroke="var(--grid-chart)" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={["dataMin", "dataMax"]}
          scale="time"
          tickFormatter={formatoFechaCorta}
          tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
          stroke="var(--border)"
        />
        <YAxis
          tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
          stroke="var(--border)"
          width={78}
          domain={["auto", "auto"]}
          tickFormatter={(valor: number) =>
            Intl.NumberFormat("es-VE", { notation: "compact" }).format(valor)
          }
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--text-primary)",
          }}
          labelFormatter={(t) =>
            new Intl.DateTimeFormat("es-VE", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(t as number))
          }
          formatter={(_valor, _nombre, item) => [
            formatDecimal((item.payload as Punto).valorStr, { maxDecimales: 4 }),
            titulo,
          ]}
        />
        <Line
          type="monotone"
          dataKey="valor"
          stroke="var(--series-buy)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function HistoryView() {
  const [dias, setDias] = useState<number>(30);
  const [moneda, setMoneda] = useState("USD");
  const [indicador, setIndicador] = useState("p2p_brecha_pct_buy");
  const [intervalo, setIntervalo] = useState<Intervalo>("1h");
  const [tasas, setTasas] = useState<Punto[]>([]);
  const [serie, setSerie] = useState<Punto[]>([]);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    const hasta = new Date();
    const desde = new Date(
      hasta.getTime() - Math.min(dias, RANGO_MAX_DIAS) * 86_400_000,
    );
    setError(null);
    setProgreso("cargando…");

    // Filtro SIEMPRE en servidor (sin él se pagina el formato largo completo
    // y se agota la cuota): los p2p_* viven bajo VES; official_rate* bajo la
    // moneda BCV seleccionada.
    const filtro = indicador.startsWith("official_rate")
      ? { indicador, moneda }
      : { indicador, moneda: "VES" };

    void (async () => {
      try {
        const [filasTasa, filasIndicador] = await Promise.all([
          historialTasa(moneda, desde, hasta, { signal: abort.signal }),
          historialIndicadores(desde, hasta, intervalo, filtro, {
            signal: abort.signal,
            alProgresar: (paginas, items, hayMas) =>
              setProgreso(
                hayMas
                  ? `página ${paginas} · ${items} puntos…`
                  : `${items} puntos en ${paginas} página(s)`,
              ),
          }),
        ]);
        if (abort.signal.aborted) {
          return;
        }
        setTasas(
          filasTasa
            .map((fila) => ({
              t: Date.parse(fila.value_date),
              etiqueta: fila.value_date,
              valor: toChartNumber(fila.rate),
              valorStr: fila.rate,
            }))
            .sort((a, b) => a.t - b.t),
        );
        setSerie(
          filasIndicador
            .map((fila) => ({
              t: Date.parse(fila.as_of),
              etiqueta: fila.as_of,
              valor: toChartNumber(fila.value),
              valorStr: fila.value,
            }))
            .sort((a, b) => a.t - b.t),
        );
        setProgreso(null);
      } catch (excepcion) {
        if (abort.signal.aborted) {
          return;
        }
        setProgreso(null);
        setError(
          excepcion instanceof ApiError
            ? excepcion.message
            : "No se pudo cargar el histórico.",
        );
      }
    })();
    return () => abort.abort();
  }, [dias, moneda, indicador, intervalo]);

  return (
    <main className="tablero">
      <section className="panel panel-ancho" aria-label="Controles de histórico">
        <div className="controles">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={dias === preset}
              style={dias === preset ? { fontWeight: 700 } : undefined}
              onClick={() => {
                setDias(preset);
                // 5m solo para rangos cortos: en 90 días serían ~26k buckets.
                if (preset > 7 && intervalo === "5m") {
                  setIntervalo("1h");
                }
              }}
            >
              {preset} días
            </button>
          ))}
          <select
            aria-label="Moneda"
            value={moneda}
            onChange={(evento) => setMoneda(evento.target.value)}
          >
            {MONEDAS_BCV.map((codigo) => (
              <option key={codigo}>{codigo}</option>
            ))}
          </select>
          <select
            aria-label="Indicador"
            value={indicador}
            onChange={(evento) => setIndicador(evento.target.value)}
          >
            {INDICADORES_CANONICOS.map((nombre) => (
              <option key={nombre}>{nombre}</option>
            ))}
          </select>
          <select
            aria-label="Intervalo"
            value={intervalo}
            onChange={(evento) => setIntervalo(evento.target.value as Intervalo)}
          >
            <option value="5m" disabled={dias > 7}>
              5 min (rangos ≤ 7 días)
            </option>
            <option value="1h">1 hora</option>
            <option value="1d">1 día</option>
          </select>
          {progreso !== null ? (
            <span className="barra-progreso" role="status">
              {progreso}
            </span>
          ) : null}
        </div>
        {error !== null ? <p className="sin-datos">{error}</p> : null}
      </section>
      <section className="panel panel-ancho" aria-label="Histórico de tasa oficial">
        <h2>Tasa oficial {moneda}/VES por fecha-valor</h2>
        <Grafico puntos={tasas} titulo={`oficial ${moneda}`} />
      </section>
      <section className="panel panel-ancho" aria-label="Histórico del indicador">
        <h2>
          {indicador} · bucket {intervalo}
        </h2>
        <Grafico puntos={serie} titulo={indicador} />
      </section>
    </main>
  );
}
