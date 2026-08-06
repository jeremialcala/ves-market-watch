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

import {
  historialIntradia,
  seriesDeVentana,
  type Intervalo,
} from "../api/endpoints";
import { ApiError } from "../api/problem";
import { NoDataState } from "../components/NoDataState";
import { SessionMovers } from "../components/SessionMovers";
import { SessionReading } from "../components/SessionReading";
import type { Clave } from "../i18n/dict";
import { useI18n } from "../i18n/contexto";
import { formatDecimal, toChartNumber } from "../lib/decimal";
import {
  grupoDe,
  horaVET,
  ladoDe,
  ladoDeGrupo,
  ORDEN_GRUPOS,
  presentacionDe,
  resumenIntradia,
  type Grupo,
  type Lado,
  type PuntoIntradia,
} from "../lib/intradia";
import { MONEDAS_BCV } from "../state/resync";

/** Slots categóricos 1/2/3 de la paleta del proyecto. */
const COLOR_LADO = {
  compra: "var(--series-buy)",
  venta: "var(--series-sell)",
  "sin-lado": "var(--series-aqua)",
} as const;

/** Los títulos de grupo y de lado viven en el diccionario: la parrilla se lee
 * igual en inglés (el nombre canónico del indicador nunca se traduce). */
const CLAVE_GRUPO: Record<Grupo, Clave> = {
  oficial: "intradia.grupoOficial",
  compra: "intradia.grupoCompra",
  venta: "intradia.grupoVenta",
  microestructura: "intradia.grupoMicro",
};

const CLAVE_LADO: Record<Lado, Clave> = {
  compra: "intradia.ladoCompra",
  venta: "intradia.ladoVenta",
  "sin-lado": "intradia.ladoSinLado",
};

const GLIFO_DIRECCION = { "-1": "▼", "0": "●", "1": "▲" } as const;
const COLOR_DIRECCION = {
  "-1": "var(--dir-bajista)",
  "0": "var(--dir-neutral)",
  "1": "var(--dir-alcista)",
} as const;

/** El intradía se refresca al ritmo del bucket más fino (5 min). */
const REFRESCO_MS = 300_000;

/** Ventana con la que «qué se movió» normaliza el movimiento de la sesión. */
const DIAS_REFERENCIA = 7;

/**
 * La referencia se pide SIEMPRE en bucket de 1 h, ignorando el selector.
 *
 * Con 5 min son ~2 000 buckets por serie y 7 días salen por encima de 40 000
 * filas: se vio en vivo paginando por la página 33 mientras la sección seguía
 * sin pintarse. A 1 h son ~170 puntos por serie, de sobra para una σ, y la
 * consulta cabe en unas pocas páginas.
 */
const INTERVALO_REFERENCIA = "1h" as const;

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
  const { t, idioma } = useI18n();
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
            background: "var(--surface-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            color: "var(--text)",
          }}
          labelFormatter={(t) => `${horaVET(t as number)} VET`}
          formatter={(_valor, _nombre, item) => [
            formatDecimal((item.payload as { valorStr: string }).valorStr, {
              maxDecimales: decimales,
              idioma,
            }),
            t("intradia.valor"),
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
  const { t, idioma } = useI18n();
  const { etiqueta, unidad, decimales } = presentacionDe(indicador);
  const resumen = resumenIntradia(puntos);
  if (resumen === null) {
    return (
      <figure className="vmw-tarjeta vmw-tarjeta--sm" style={{ margin: 0 }}>
        <figcaption className="intradia-titulo">
          {etiqueta}
          {unidad !== "" ? <span className="intradia-unidad">{unidad}</span> : null}
        </figcaption>
        <NoDataState detalle={t("intradia.sinHoy")} />
      </figure>
    );
  }
  const clave = String(resumen.direccion) as "-1" | "0" | "1";
  const valorFmt = formatDecimal(resumen.ultimo, {
    maxDecimales: decimales,
    idioma,
  });
  const deltaFmt = formatDecimal(resumen.deltaAbs, {
    maxDecimales: decimales,
    idioma,
  });
  const aperturaFmt = formatDecimal(resumen.apertura, {
    maxDecimales: decimales,
    idioma,
  });
  const pctFmt =
    resumen.deltaPct === null
      ? "—"
      : `${formatDecimal(resumen.deltaPct, { maxDecimales: 2, idioma })} %`;
  const signoTexto = resumen.direccion > 0 ? "+" : "";

  return (
    <figure className="vmw-tarjeta vmw-tarjeta--sm" style={{ margin: 0 }}>
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
        aria-label={t("intradia.descripcionPanel", {
          etiqueta,
          apertura: aperturaFmt,
          ultimo: valorFmt,
          delta: `${signoTexto}${deltaFmt}`,
          pct: `${signoTexto}${pctFmt}`,
        })}
      >
        <Chispa
          puntos={puntos}
          apertura={resumen.apertura}
          color={COLOR_LADO[ladoDe(indicador)]}
          decimales={decimales}
        />
      </div>
      <p className="intradia-apertura">
        {t("intradia.apertura", { valor: aperturaFmt })}
      </p>
    </figure>
  );
}

export function IntradayView() {
  const { t } = useI18n();
  const [moneda, setMoneda] = useState("USD");
  const [intervalo, setIntervalo] = useState<Intervalo>("5m");
  const [series, setSeries] = useState<Map<string, PuntoIntradia[]>>(new Map());
  const [referencia, setReferencia] = useState<Map<string, PuntoIntradia[]>>(
    new Map(),
  );
  const [progreso, setProgreso] = useState<string | null>(null);
  const [actualizado, setActualizado] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cargar = useCallback(() => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setError(null);
    setProgreso(t("generico.cargando"));
    void (async () => {
      try {
        const resultado = await historialIntradia(moneda, intervalo, new Date(), {
          signal: abort.signal,
          alProgresar: (paginas, items) =>
            setProgreso(t("historico.progreso", { paginas, items })),
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
          excepcion instanceof ApiError ? excepcion.message : t("intradia.error"),
        );
      }
    })();
  }, [moneda, intervalo, t]);

  useEffect(() => {
    cargar();
    const temporizador = setInterval(cargar, REFRESCO_MS);
    return () => {
      clearInterval(temporizador);
      abortRef.current?.abort();
    };
  }, [cargar]);

  /*
   * La ventana de referencia va en su propio efecto y NO en el refresco de 5
   * minutos: son ~3 400 filas por moneda y una σ de 7 días no cambia entre un
   * bucket y el siguiente. Se recarga al cambiar de moneda o de intervalo, que
   * es cuando deja de valer.
   *
   * Si falla, no rompe la vista: sin referencia la sección de movimientos
   * simplemente no se pinta —no hay con qué normalizar—, y la parrilla sigue.
   */
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      const hasta = new Date();
      const desde = new Date(
        hasta.getTime() - DIAS_REFERENCIA * 24 * 60 * 60 * 1000,
      );
      try {
        const ventana = await seriesDeVentana(
          moneda,
          INTERVALO_REFERENCIA,
          desde,
          hasta,
          { signal: abort.signal },
        );
        if (!abort.signal.aborted) {
          setReferencia(ventana);
        }
      } catch {
        if (!abort.signal.aborted) {
          setReferencia(new Map());
        }
      }
    })();
    return () => abort.abort();
  }, [moneda]);

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

  return (
    <main className="vmw-vista">
      <div className="vmw-contenedor">
        <section className="vmw-controles" aria-label={t("intradia.controles")}>
          <select
            className="vmw-select"
            aria-label={t("intradia.monedaOficial")}
            value={moneda}
            onChange={(evento) => setMoneda(evento.target.value)}
          >
            {MONEDAS_BCV.map((codigo) => (
              <option key={codigo}>{codigo}</option>
            ))}
          </select>
          <select
            className="vmw-select"
            aria-label={t("historico.bucket")}
            value={intervalo}
            onChange={(evento) => setIntervalo(evento.target.value as Intervalo)}
          >
            <option value="5m">{t("intradia.bucket5m")}</option>
            <option value="1h">{t("historico.bucket1h")}</option>
          </select>
          <button type="button" className="vmw-chip" onClick={cargar}>
            {t("intradia.actualizar")}
          </button>
          <span className="vmw-nav__relleno" />
          {progreso !== null ? (
            <span
              role="status"
              style={{ fontSize: "var(--fs-micro)", color: "var(--text-muted)" }}
            >
              {progreso}
            </span>
          ) : null}
          {progreso === null && actualizado !== null ? (
            <span
              role="status"
              style={{ fontSize: "var(--fs-micro)", color: "var(--text-dim)" }}
            >
              {t("intradia.actualizado", { hora: horaVET(actualizado) })}
            </span>
          ) : null}
        </section>
        {/* Primer bloque de la vista, justo bajo los controles. Absorbe la
            frase de día operativo que antes colgaba suelta aquí: la apertura y
            lo transcurrido son contexto de esta lectura, no una nota al margen. */}
        <SessionReading series={series} />
        <SessionMovers sesion={series} historia={referencia} />
        {error !== null ? <p className="vmw-sin-datos">{error}</p> : null}

        {series.size === 0 && progreso === null && error === null ? (
          <div className="vmw-tarjeta vmw-seccion">
            <NoDataState detalle={t("intradia.sinDia")} />
          </div>
        ) : null}

        {ORDEN_GRUPOS.filter((grupo) => porGrupo.has(grupo)).map((grupo) => (
          <section
            key={grupo}
            className="vmw-seccion"
            aria-label={t(CLAVE_GRUPO[grupo])}
          >
            <div className="vmw-seccion__cabecera">
              <h3 className="vmw-seccion__titulo">{t(CLAVE_GRUPO[grupo])}</h3>
              <span
                className="vmw-badge"
                style={{ borderColor: COLOR_LADO[ladoDeGrupo(grupo)] }}
              >
                {t(CLAVE_LADO[ladoDeGrupo(grupo)])}
              </span>
            </div>
            <div className="vmw-grid" style={{ "--min": "210px", gap: "0.75rem" } as React.CSSProperties}>
              {(porGrupo.get(grupo) ?? []).map(([nombre, puntos]) => (
                <PanelIndicador key={nombre} indicador={nombre} puntos={puntos} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
