/**
 * Vista de histórico: series de la tasa oficial (por value_date) y de un
 * indicador canónico agregado por bucket (5m/1h/1d), con rango ≤ 90 días
 * validado en cliente, paginación transparente con progreso y cancelación.
 * Un solo eje por gráfico (dataviz); tooltips muestran el string exacto.
 *
 * El rediseño cambia el cromo (chips, selects y tarjetas del sistema) y deja
 * intacta la mecánica de paginación: es la parte cara y ya verificada.
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
import { NoDataState } from "../components/NoDataState";
import { useI18n } from "../i18n/contexto";
import type { Idioma } from "../i18n/idioma";
import { formatDecimal, toChartNumber } from "../lib/decimal";
import { MONEDAS_BCV } from "../state/resync";

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
const LOCALE: Record<Idioma, string> = { es: "es-VE", en: "en-US" };

function Grafico({
  puntos,
  titulo,
  idioma,
  vacio,
}: {
  puntos: Punto[];
  titulo: string;
  idioma: Idioma;
  vacio: string;
}) {
  if (puntos.length === 0) {
    return <NoDataState detalle={vacio} />;
  }
  const locale = LOCALE[idioma];
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={puntos} margin={{ left: 12, right: 12, top: 8 }}>
        <CartesianGrid stroke="var(--grid-chart)" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={["dataMin", "dataMax"]}
          scale="time"
          tickFormatter={(t: number) =>
            new Intl.DateTimeFormat(locale, {
              day: "2-digit",
              month: "2-digit",
            }).format(new Date(t))
          }
          tick={{ fill: "var(--text-dim)", fontSize: 11 }}
          stroke="var(--border)"
        />
        <YAxis
          tick={{ fill: "var(--text-dim)", fontSize: 11 }}
          stroke="var(--border)"
          width={78}
          domain={["auto", "auto"]}
          tickFormatter={(valor: number) =>
            Intl.NumberFormat(locale, { notation: "compact" }).format(valor)
          }
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            color: "var(--text)",
          }}
          labelFormatter={(t) =>
            new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(t as number))
          }
          formatter={(_valor, _nombre, item) => [
            formatDecimal((item.payload as Punto).valorStr, {
              maxDecimales: 4,
              idioma,
            }),
            titulo,
          ]}
        />
        <Line
          type="monotone"
          dataKey="valor"
          stroke="var(--series-buy)"
          strokeWidth={2.4}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function HistoryView() {
  const { t, idioma } = useI18n();
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
    setProgreso(t("generico.cargando"));

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
            alProgresar: (paginas, items) =>
              setProgreso(t("historico.progreso", { paginas, items })),
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
            : t("historico.error"),
        );
      }
    })();
    return () => abort.abort();
  }, [dias, moneda, indicador, intervalo, t]);

  return (
    <main className="vmw-vista">
      <div className="vmw-contenedor">
        <section className="vmw-controles" aria-label={t("historico.controles")}>
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="vmw-chip"
              aria-pressed={dias === preset}
              onClick={() => {
                setDias(preset);
                // 5m solo para rangos cortos: en 90 días serían ~26k buckets.
                if (preset > 7 && intervalo === "5m") {
                  setIntervalo("1h");
                }
              }}
            >
              {t(
                preset === 7
                  ? "historico.rango7"
                  : preset === 30
                    ? "historico.rango30"
                    : "historico.rango90",
              )}
            </button>
          ))}
          <select
            className="vmw-select"
            aria-label={t("historico.moneda")}
            value={moneda}
            onChange={(evento) => setMoneda(evento.target.value)}
          >
            {MONEDAS_BCV.map((codigo) => (
              <option key={codigo}>{codigo}</option>
            ))}
          </select>
          <select
            className="vmw-select"
            aria-label={t("historico.indicador")}
            value={indicador}
            onChange={(evento) => setIndicador(evento.target.value)}
          >
            {INDICADORES_CANONICOS.map((nombre) => (
              <option key={nombre}>{nombre}</option>
            ))}
          </select>
          <select
            className="vmw-select"
            aria-label={t("historico.bucket")}
            value={intervalo}
            onChange={(evento) => setIntervalo(evento.target.value as Intervalo)}
          >
            <option value="5m" disabled={dias > 7}>
              {t("historico.bucket5m")}
            </option>
            <option value="1h">{t("historico.bucket1h")}</option>
            <option value="1d">{t("historico.bucket1d")}</option>
          </select>
          <span className="vmw-nav__relleno" />
          {progreso !== null ? (
            <span
              role="status"
              style={{
                fontSize: "var(--fs-micro)",
                color: "var(--text-muted)",
              }}
            >
              {progreso}
            </span>
          ) : (
            <span className="vmw-seccion__bajada">{t("historico.limite")}</span>
          )}
        </section>
        {error !== null ? <p className="vmw-sin-datos">{error}</p> : null}

        <section
          className="vmw-tarjeta vmw-seccion"
          aria-label={t("historico.tasaTitulo", { moneda })}
        >
          <div className="vmw-seccion__cabecera">
            <h3 className="vmw-seccion__titulo" style={{ fontSize: "20px" }}>
              {t("historico.tasaTitulo", { moneda })}
            </h3>
            <span className="vmw-seccion__bajada">
              {t("historico.rangoLabel", { dias })}
            </span>
          </div>
          <Grafico
            puntos={tasas}
            titulo={`${moneda}/VES`}
            idioma={idioma}
            vacio={t("historico.sinSerie")}
          />
        </section>

        <section
          className="vmw-tarjeta vmw-seccion"
          aria-label={t("historico.serieTitulo", { indicador, bucket: intervalo })}
        >
          <div className="vmw-seccion__cabecera">
            <h3 className="vmw-seccion__titulo" style={{ fontSize: "20px" }}>
              {t("historico.serieTitulo", { indicador, bucket: intervalo })}
            </h3>
          </div>
          <Grafico
            puntos={serie}
            titulo={indicador}
            idioma={idioma}
            vacio={t("historico.sinSerie")}
          />
        </section>
      </div>
    </main>
  );
}
