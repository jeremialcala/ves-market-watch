/**
 * Intradía — TODOS los indicadores del día operativo VET en una parrilla de
 * small multiples (skill dataviz):
 *
 * - Una serie por panel ⇒ ningún panel lleva leyenda: el título lo nombra.
 *   Un solo eje por gráfico; jamás doble escala (los indicadores viven en
 *   unidades distintas, por eso son paneles separados y no un gráfico común).
 * - El color codifica UNA sola cosa, el lado del mercado (azul compra, naranja
 *   venta, aqua sin lado) — nunca el ranking ni el signo de la Δ. Los tres
 *   slots están validados all-pairs en claro y oscuro (small multiples usan la
 *   lista completa de pares, que topa en tres slots).
 * - El aqua queda bajo 3:1 sobre la superficie clara: aplica la regla de
 *   relieve, y por eso cada panel lleva SIEMPRE etiqueta y valor visibles.
 * - El signo de la Δ va en glifo (▲ ▼ ●) + texto, nunca en color solo; el
 *   número se escribe en tinta, no en el color de la serie.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { historialIntradia, type Intervalo } from "../api/endpoints";
import { ApiError } from "../api/problem";
import { NoDataState } from "../components/NoDataState";
import { formatDecimal, toChartNumber } from "../lib/decimal";
import {
  etiquetaDiaVET,
  ETIQUETA_LADO,
  grupoDe,
  horaVET,
  ladoDe,
  ladoDeGrupo,
  ORDEN_GRUPOS,
  presentacionDe,
  resumenIntradia,
  TITULO_GRUPO,
  type Grupo,
  type PuntoIntradia,
} from "../lib/intradia";
import { MONEDAS_BCV } from "../state/resync";

/** Slots categóricos 1/2/3 de la paleta del proyecto. */
const COLOR_LADO = {
  compra: "var(--series-buy)",
  venta: "var(--series-sell)",
  "sin-lado": "var(--series-aqua)",
} as const;

const GLIFO_DIRECCION = { "-1": "▼", "0": "●", "1": "▲" } as const;
const COLOR_DIRECCION = {
  "-1": "var(--dir-bajista)",
  "0": "var(--dir-neutral)",
  "1": "var(--dir-alcista)",
} as const;

/** El intradía se refresca al ritmo del bucket más fino (5 min). */
const REFRESCO_MS = 300_000;

function Chispa({
  puntos,
  apertura,
  color,
  decimales,
}: {
  puntos: readonly PuntoIntradia[];
  apertura: string;
  color: string;
  decimales: number;
}) {
  const datos = puntos.map((punto) => ({
    t: punto.t,
    valor: toChartNumber(punto.valor),
    valorStr: punto.valor,
  }));
  return (
    <ResponsiveContainer width="100%" height={64}>
      <LineChart data={datos} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
        <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} hide />
        <YAxis domain={["auto", "auto"]} hide />
        {/* La apertura es la referencia de la que se mide la Δ del día. */}
        <ReferenceLine
          y={toChartNumber(apertura)}
          stroke="var(--text-muted)"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--text-primary)",
          }}
          labelFormatter={(t) => `${horaVET(t as number)} VET`}
          formatter={(_valor, _nombre, item) => [
            formatDecimal((item.payload as { valorStr: string }).valorStr, {
              maxDecimales: decimales,
            }),
            "valor",
          ]}
        />
        <Line
          type="monotone"
          dataKey="valor"
          stroke={color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function PanelIndicador({
  indicador,
  puntos,
}: {
  indicador: string;
  puntos: readonly PuntoIntradia[];
}) {
  const { etiqueta, unidad, decimales } = presentacionDe(indicador);
  const resumen = resumenIntradia(puntos);
  if (resumen === null) {
    return (
      <figure className="tarjeta-intradia">
        <figcaption className="intradia-titulo">
          {etiqueta}
          {unidad !== "" ? <span className="intradia-unidad">{unidad}</span> : null}
        </figcaption>
        <NoDataState detalle="Sin datos hoy." />
      </figure>
    );
  }
  const clave = String(resumen.direccion) as "-1" | "0" | "1";
  const valorFmt = formatDecimal(resumen.ultimo, { maxDecimales: decimales });
  const deltaFmt = formatDecimal(resumen.deltaAbs, { maxDecimales: decimales });
  const pctFmt =
    resumen.deltaPct === null
      ? "—"
      : `${formatDecimal(resumen.deltaPct, { maxDecimales: 2 })} %`;
  const signoTexto = resumen.direccion > 0 ? "+" : "";

  return (
    <figure className="tarjeta-intradia">
      <figcaption className="intradia-titulo" title={indicador}>
        {etiqueta}
        {unidad !== "" ? <span className="intradia-unidad">{unidad}</span> : null}
      </figcaption>
      <p className="intradia-valor">{valorFmt}</p>
      <p className="intradia-delta">
        <span aria-hidden="true" style={{ color: COLOR_DIRECCION[clave] }}>
          {GLIFO_DIRECCION[clave]}
        </span>{" "}
        {signoTexto}
        {deltaFmt} ({signoTexto}
        {pctFmt})
      </p>
      <div
        role="img"
        aria-label={`${etiqueta}: apertura ${formatDecimal(resumen.apertura, {
          maxDecimales: decimales,
        })}, último ${valorFmt}, variación ${signoTexto}${deltaFmt} (${signoTexto}${pctFmt})`}
      >
        <Chispa
          puntos={puntos}
          apertura={resumen.apertura}
          color={COLOR_LADO[ladoDe(indicador)]}
          decimales={decimales}
        />
      </div>
      <p className="intradia-apertura">
        apertura {formatDecimal(resumen.apertura, { maxDecimales: decimales })}
      </p>
    </figure>
  );
}

export function IntradayView() {
  const [moneda, setMoneda] = useState("USD");
  const [intervalo, setIntervalo] = useState<Intervalo>("5m");
  const [series, setSeries] = useState<Map<string, PuntoIntradia[]>>(new Map());
  const [progreso, setProgreso] = useState<string | null>(null);
  const [actualizado, setActualizado] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cargar = useCallback(() => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setError(null);
    setProgreso("cargando…");
    void (async () => {
      try {
        const resultado = await historialIntradia(moneda, intervalo, new Date(), {
          signal: abort.signal,
          alProgresar: (paginas, items, hayMas) =>
            setProgreso(
              hayMas
                ? `página ${paginas} · ${items} puntos…`
                : `${items} puntos en ${paginas} página(s)`,
            ),
        });
        if (abort.signal.aborted) {
          return;
        }
        setSeries(resultado);
        setActualizado(Date.now());
        setProgreso(null);
      } catch (excepcion) {
        if (abort.signal.aborted) {
          return;
        }
        setProgreso(null);
        setError(
          excepcion instanceof ApiError
            ? excepcion.message
            : "No se pudo cargar el intradía.",
        );
      }
    })();
  }, [moneda, intervalo]);

  useEffect(() => {
    cargar();
    const temporizador = setInterval(cargar, REFRESCO_MS);
    return () => {
      clearInterval(temporizador);
      abortRef.current?.abort();
    };
  }, [cargar]);

  const porGrupo = new Map<Grupo, Array<[string, PuntoIntradia[]]>>();
  for (const nombre of [...series.keys()].sort()) {
    const grupo = grupoDe(nombre);
    const entrada: [string, PuntoIntradia[]] = [nombre, series.get(nombre) ?? []];
    const entradas = porGrupo.get(grupo);
    if (entradas === undefined) {
      porGrupo.set(grupo, [entrada]);
    } else {
      entradas.push(entrada);
    }
  }
  const diaVET = etiquetaDiaVET(new Date());

  return (
    <main className="tablero">
      <section className="panel panel-ancho" aria-label="Controles de intradía">
        <div className="controles">
          <select
            aria-label="Moneda de la tasa oficial"
            value={moneda}
            onChange={(evento) => setMoneda(evento.target.value)}
          >
            {MONEDAS_BCV.map((codigo) => (
              <option key={codigo}>{codigo}</option>
            ))}
          </select>
          <select
            aria-label="Intervalo"
            value={intervalo}
            onChange={(evento) => setIntervalo(evento.target.value as Intervalo)}
          >
            <option value="5m">5 min</option>
            <option value="1h">1 hora</option>
          </select>
          <button type="button" onClick={cargar}>
            Actualizar
          </button>
          {progreso !== null ? (
            <span className="barra-progreso" role="status">
              {progreso}
            </span>
          ) : null}
          {progreso === null && actualizado !== null ? (
            <span className="intradia-sello" role="status">
              actualizado {horaVET(actualizado)} VET
            </span>
          ) : null}
        </div>
        <p className="intradia-dia">
          Día operativo (VET): {diaVET} — la Δ de cada panel se mide contra la
          apertura del día.
        </p>
        {error !== null ? <p className="sin-datos">{error}</p> : null}
      </section>

      {series.size === 0 && progreso === null && error === null ? (
        <section className="panel panel-ancho">
          <NoDataState detalle="Todavía no hay indicadores para el día operativo en curso." />
        </section>
      ) : null}

      {ORDEN_GRUPOS.filter((grupo) => porGrupo.has(grupo)).map((grupo) => (
        <section
          key={grupo}
          className="panel panel-ancho"
          aria-label={TITULO_GRUPO[grupo]}
        >
          <h2>
            {TITULO_GRUPO[grupo]}
            <span
              className="badge"
              style={{ borderColor: COLOR_LADO[ladoDeGrupo(grupo)] }}
            >
              {ETIQUETA_LADO[ladoDeGrupo(grupo)]}
            </span>
          </h2>
          <div className="parrilla-intradia">
            {(porGrupo.get(grupo) ?? []).map(([nombre, puntos]) => (
              <PanelIndicador key={nombre} indicador={nombre} puntos={puntos} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
