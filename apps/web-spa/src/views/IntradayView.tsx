/**
 * Intradía — TODOS los indicadores del día operativo VET.
 *
 * La vista se lee de arriba abajo: la lectura del ruleset, qué se movió, las
 * métricas y la cronología. Cada bloque decide qué codifica su color, y eso hay
 * que saberlo para leerlos juntos:
 *
 * - `SideBySide` — compra y venta **enfrentadas**, porque la pregunta útil es en
 *   qué se diferencian. El lado lo dice la COLUMNA, así que el color pasa a la
 *   dirección de la Δ y el signo va siempre escrito.
 * - `MicroCards` — las cuatro de microestructura son CONDICIONES del ruleset y
 *   no tienen lado: el color es del ESTADO (coral cumple, teal no).
 * - **La parrilla** —hoy solo oficial— es la que conserva la convención
 *   original: el color codifica UNA sola cosa, el lado del mercado (azul
 *   compra, naranja venta, aqua sin lado), nunca el ranking ni el signo de la Δ.
 *   Los tres slots están validados all-pairs en claro y oscuro (small multiples
 *   usan la lista completa de pares, que topa en tres slots).
 *
 * Lo que NO cambia en ningún bloque (skill dataviz):
 *
 * - Una serie por panel ⇒ ningún panel lleva leyenda: el título lo nombra.
 *   Un solo eje por gráfico; jamás doble escala (los indicadores viven en
 *   unidades distintas, por eso son paneles separados y no un gráfico común).
 * - El aqua queda bajo 3:1 sobre la superficie clara: aplica la regla de
 *   relieve, y por eso cada panel lleva SIEMPRE etiqueta y valor visibles.
 * - **Todo formato de Δ pasa por `lib/delta.ts`**, sin excepciones: menos
 *   tipográfico U+2212, «+» solo en positivos, porcentaje omitido cuando la
 *   apertura no llega a 0,5 y unidad pegada a la cifra. Los triángulos de
 *   dirección se retiraron: eran un tercer canal que repetía lo que ya dicen el
 *   signo escrito y el color, y había que traducirlos mentalmente. Un test de
 *   `delta.test.ts` comprueba que no vuelvan —por eso aquí no se escriben—.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import {
  historialIntradia,
  seriesDeVentana,
  type Intervalo,
} from "../api/endpoints";
import { ApiError } from "../api/problem";
import { ChispaConTooltip } from "../components/ChispaConTooltip";
import { MicroCards } from "../components/MicroCards";
import { NombreSerie } from "../components/NombreSerie";
import { NoDataState } from "../components/NoDataState";
import { SessionMovers } from "../components/SessionMovers";
import { SideBySide } from "../components/SideBySide";
import { SessionReading } from "../components/SessionReading";
import { SessionTimeline } from "../components/SessionTimeline";
import type { Clave } from "../i18n/dict";
import { useI18n } from "../i18n/contexto";
import { toChartNumber } from "../lib/decimal";
import { formatearDelta, valorConUnidad } from "../lib/delta";
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
import { useMarket } from "../state/marketStore";
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

/**
 * Los grupos que siguen siendo parrilla de small multiples.
 *
 * Compra y venta se fueron a `SideBySide` (la pregunta útil es en qué se
 * diferencian) y microestructura a `MicroCards` (no son cifras del día sino
 * condiciones del ruleset). Queda oficial, que sí es una serie por sí misma.
 */
const GRUPOS_PARRILLA: Grupo[] = ORDEN_GRUPOS.filter(
  (grupo) => grupo === "oficial",
);

/** El intradía se refresca al ritmo del bucket más fino (5 min). */
const REFRESCO_MS = 300_000;

/**
 * Granularidades ofrecidas, en orden de grano.
 *
 * Los tres valores existen en el contrato (`components.parameters.Interval`) y
 * `Intervalo` se deriva de él: una opción que el gateway no acepte no compila.
 */
const BUCKETS: { valor: Intervalo; clave: Clave }[] = [
  { valor: "5m", clave: "intradia.bucket5m" },
  { valor: "15m", clave: "intradia.bucket15m" },
  { valor: "1h", clave: "intradia.bucket1h" },
];

/**
 * Indicador de frescura. Sustituye al botón «Actualizar»: la vista ya se
 * recarga sola cada 5 min, así que lo que falta no es un botón sino saber si
 * eso está pasando.
 *
 * El punto **no late en salvia salvo que haya dato fresco de verdad**. Un
 * latido verde mientras la carga falla afirma que hay vida donde no la hay, y
 * es precisamente el momento en que alguien mira este punto.
 */
function Frescura({
  progreso,
  actualizado,
  fallando,
}: {
  progreso: string | null;
  actualizado: number | null;
  fallando: boolean;
}) {
  const { t } = useI18n();
  const vivo = !fallando && progreso === null && actualizado !== null;
  const texto =
    progreso !== null
      ? progreso
      : actualizado === null
        ? t("intradia.sinRefrescoAun")
        : t(vivo ? "intradia.enVivo" : "intradia.frescuraDetenida", {
            hora: horaVET(actualizado),
          });

  return (
    <p className="vmw-frescura" role="status">
      <span
        className="vmw-frescura__punto"
        data-vivo={vivo ? "si" : "no"}
        aria-hidden="true"
      />
      {texto}
    </p>
  );
}

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

/**
 * Panel de la parrilla. El tooltip **ya no es el de Recharts**: se pintaba
 * dentro del flujo de la tarjeta, tapaba la línea de apertura y empujaba el
 * layout al aparecer. Ahora usa el mismo de los demás sparklines.
 *
 * Se ancla ARRIBA y no sobre el punto porque la escala vertical la calcula
 * Recharts, no nosotros: colocarlo a una `y` que no hemos calculado lo pondría
 * junto a un punto distinto del que señala.
 */
function Chispa({
  puntos,
  apertura,
  color,
  unidad,
  decimales,
}: {
  puntos: readonly PuntoIntradia[];
  apertura: string;
  color: string;
  unidad: string;
  decimales: number;
}) {
  const datos = puntos.map((punto) => ({
    t: punto.t,
    valor: toChartNumber(punto.valor),
    valorStr: punto.valor,
  }));
  return (
    <ChispaConTooltip
      puntos={puntos}
      ancho={100}
      alto={64}
      color={color}
      unidad={unidad}
      decimales={decimales}
      anclarArriba
    >
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
    </ChispaConTooltip>
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
  const { etiqueta: claveEtiqueta, unidad, decimales } = presentacionDe(indicador);
  const etiqueta = claveEtiqueta === null ? indicador : t(claveEtiqueta);
  const resumen = resumenIntradia(puntos);
  if (resumen === null) {
    return (
      <figure className="vmw-tarjeta vmw-tarjeta--sm" style={{ margin: 0 }}>
        <figcaption className="intradia-titulo">
          <NombreSerie indicador={indicador} claseEtiqueta="intradia-etiqueta" />
        </figcaption>
        <NoDataState detalle={t("intradia.sinHoy")} />
      </figure>
    );
  }
  const num = (v: string) => valorConUnidad(v, { unidad, decimales, idioma });
  const valorFmt = num(resumen.ultimo);
  const aperturaFmt = num(resumen.apertura);
  const delta = formatearDelta(resumen, {
    unidad,
    decimales,
    idioma,
    sinCambio: t("delta.sinCambio"),
  });

  return (
    <figure className="vmw-tarjeta vmw-tarjeta--sm" style={{ margin: 0 }}>
      <figcaption className="intradia-titulo">
        <NombreSerie indicador={indicador} claseEtiqueta="intradia-etiqueta" />
      </figcaption>
      <p className="intradia-valor">{valorFmt}</p>
      {/* Sin glifo: la direccion la dan el signo escrito y el color, y un
          tercer canal solo obligaba a traducir el triangulo mentalmente. */}
      <p className="intradia-delta" style={{ color: delta.color }}>
        {delta.texto}
      </p>
      <div
        role="img"
        aria-label={t("intradia.descripcionPanel", {
          etiqueta,
          apertura: aperturaFmt,
          ultimo: valorFmt,
          delta: delta.texto,
        })}
      >
        <Chispa
          puntos={puntos}
          apertura={resumen.apertura}
          color={COLOR_LADO[ladoDe(indicador)]}
          unidad={unidad}
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
  const { analisis } = useMarket();
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
        <section
          className="vmw-controles vmw-controles--intradia"
          aria-label={t("intradia.controles")}
        >
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
          {/* Tres opciones excluyentes = UNA elección, y así se anuncia: un
              `radiogroup`, no tres botones sueltos sin relación entre sí. */}
          <div
            className="vmw-bucket"
            role="radiogroup"
            aria-label={t("intradia.granularidad")}
          >
            {BUCKETS.map(({ valor, clave }) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={intervalo === valor}
                className="vmw-bucket__opcion"
                onClick={() => setIntervalo(valor)}
              >
                {t(clave)}
              </button>
            ))}
          </div>
          <Frescura
            progreso={progreso}
            actualizado={actualizado}
            fallando={error !== null}
          />
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

        {/* Cierra la vista: lo que pasó, después de los indicadores que lo
            explican. */}
        {/* Compra y venta ya NO son dos parrillas: la pregunta útil es en qué
            se diferencian, y eso pide la misma fila. Oficial y microestructura
            no tienen contraparte, así que siguen como parrilla. */}
        <SideBySide series={series} />

        {/* Las cuatro de microestructura son CONDICIONES del ruleset, no cifras
            del día: el estado de cada una manda sobre su tarjeta. */}
        <MicroCards
          indicadores={porGrupo.get("microestructura") ?? []}
          analisis={analisis}
        />

        {GRUPOS_PARRILLA.filter((grupo) => porGrupo.has(grupo)).map((grupo) => (
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

        <SessionTimeline
          sesion={series}
          referencia={referencia}
          analisis={analisis}
        />
      </div>
    </main>
  );
}
