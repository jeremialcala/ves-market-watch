/**
 * Funciones tipadas por endpoint. Convenciones del contrato aplicadas aquí:
 * 404 de los «current» = «sin datos frescos» (null, nunca excepción — RF-5);
 * cualquier otro error llega como ApiError (problem+json); rango ≤ 90 días
 * validado en cliente antes de llamar (el 422 del servidor es el cinturón).
 */

import { inicioDiaVET, type PuntoIntradia } from "../lib/intradia";
import { client } from "./client";
import { ApiError, esProblem, type Problem } from "./problem";
import type { components } from "./types.gen";

type Schemas = components["schemas"];
export type TasaOficial = Schemas["OfficialRateCurrent"];
export type PaginaTasas = Schemas["OfficialRateHistoryPage"];
export type ReferenciaP2P = Schemas["P2PQuote"];
export type Indicadores = Schemas["Indicators"];
export type PaginaIndicadores = Schemas["IndicatorHistoryPage"];
export type ItemIndicador = Schemas["IndicatorHistoryItem"];
export type Profundidad = Schemas["MarketDepth"];
export type Senal = Schemas["Signal"];
export type PaginaSenales = Schemas["SignalPage"];
export type Salud = Schemas["Health"];

/** Lectura de los medidores del panel en una revisión (RF-6, ADR-0019). */
export type Analisis = Schemas["IndicatorAnalysis"];
export type LecturaMedidor = Schemas["AnalysisIndicator"];
export type ProximidadRegla = Schemas["RuleProximity"];
/** Vocabulario NEUTRO de idioma que clasifica el engine; la prosa la pone el
 *  diccionario del SPA. Tiparlo sobre el enum generado significa que si el
 *  engine añade una banda, la UI deja de compilar en vez de callarse. */
export type Banda = LecturaMedidor["band"];

export type Lado = "buy" | "sell";
export type Intervalo = "5m" | "1h" | "1d";

export const RANGO_MAX_DIAS = 90;
const PAGE_SIZE_MAX = 500;

function lanzar(error: unknown, response: Response): never {
  const problem: Problem = esProblem(error)
    ? error
    : { title: "Error del gateway", status: response.status };
  const retryAfter = response.headers.get("Retry-After");
  throw new ApiError(
    problem,
    retryAfter !== null ? Number(retryAfter) : undefined,
  );
}

function oNull<T>(resultado: {
  data?: T;
  error?: unknown;
  response: Response;
}): T | null {
  if (resultado.data !== undefined) {
    return resultado.data;
  }
  if (resultado.response.status === 404) {
    return null;
  }
  lanzar(resultado.error, resultado.response);
}

function oFalla<T>(resultado: {
  data?: T;
  error?: unknown;
  response: Response;
}): T {
  if (resultado.data !== undefined) {
    return resultado.data;
  }
  lanzar(resultado.error, resultado.response);
}

/** Reintento único ante 429 respetando Retry-After (cap 30 s) — para la
 * paginación de históricos, que es la única ráfaga legítima del cliente. */
async function conReintento429<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await fn();
  } catch (excepcion) {
    if (
      excepcion instanceof ApiError &&
      excepcion.status === 429 &&
      signal?.aborted !== true
    ) {
      const esperaMs = Math.min(excepcion.retryAfterS ?? 5, 30) * 1000;
      await new Promise((resolver) => setTimeout(resolver, esperaMs));
      return fn();
    }
    throw excepcion;
  }
}

// -- current -----------------------------------------------------------------

export async function tasaOficial(currency: string): Promise<TasaOficial | null> {
  return oNull(
    await client.GET("/rates/official/current", {
      params: { query: { currency } },
    }),
  );
}

export async function referenciaP2P(lado: Lado): Promise<ReferenciaP2P | null> {
  return oNull(
    await client.GET("/rates/p2p/current", { params: { query: { side: lado } } }),
  );
}

export async function indicadores(currency = "USD"): Promise<Indicadores | null> {
  return oNull(
    await client.GET("/indicators/current", { params: { query: { currency } } }),
  );
}

/** 404 = sin análisis vigente (o más viejo que la frescura P2P): el panel
 *  muestra los valores sin explicación, nunca una lectura rancia. */
export async function analisis(currency = "VES"): Promise<Analisis | null> {
  return oNull(
    await client.GET("/analysis/current", { params: { query: { currency } } }),
  );
}

export async function profundidad(lado: Lado): Promise<Profundidad | null> {
  return oNull(
    await client.GET("/market/depth", { params: { query: { side: lado } } }),
  );
}

export async function senalesRecientes(limite = 20): Promise<PaginaSenales> {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - RANGO_MAX_DIAS * 86_400_000);
  return oFalla(
    await client.GET("/signals", {
      params: {
        query: {
          from: desde.toISOString(),
          to: hasta.toISOString(),
          page_size: limite,
        },
      },
    }),
  );
}

export async function salud(): Promise<Salud> {
  const resultado = await client.GET("/health");
  // /health responde 200 (ok/degraded) o 503 (down) con el mismo schema.
  if (resultado.data !== undefined) {
    return resultado.data;
  }
  if (resultado.response.status === 503 && esProblem(resultado.error) === false) {
    return resultado.error as Salud;
  }
  lanzar(resultado.error, resultado.response);
}

// -- históricos (paginados, rango ≤ 90 días) ---------------------------------

export function validarRango(desde: Date, hasta: Date): void {
  if (hasta < desde) {
    throw new ApiError({
      title: "Rango invertido",
      status: 422,
      detail: "El fin del rango es anterior al inicio.",
    });
  }
  const dias = (hasta.getTime() - desde.getTime()) / 86_400_000;
  if (dias > RANGO_MAX_DIAS) {
    throw new ApiError({
      title: "Rango no procesable",
      status: 422,
      detail: `El rango solicitado excede el máximo de ${RANGO_MAX_DIAS} días.`,
    });
  }
}

export interface OpcionesPaginado {
  signal?: AbortSignal;
  alProgresar?: (paginas: number, items: number, hayMas: boolean) => void;
}

export async function historialTasa(
  currency: string,
  desde: Date,
  hasta: Date,
  { signal, alProgresar }: OpcionesPaginado = {},
): Promise<PaginaTasas["data"]> {
  validarRango(desde, hasta);
  const filas: PaginaTasas["data"] = [];
  for (let page = 1; ; page += 1) {
    const pagina = await conReintento429(
      async () =>
        oFalla(
          await client.GET("/rates/official/history", {
            params: {
              query: {
                from: desde.toISOString().slice(0, 10),
                to: hasta.toISOString().slice(0, 10),
                currency,
                page,
                page_size: PAGE_SIZE_MAX,
              },
            },
            signal,
          }),
        ),
      signal,
    );
    filas.push(...pagina.data);
    alProgresar?.(page, filas.length, pagina.pagination.has_more);
    if (!pagina.pagination.has_more) {
      return filas;
    }
  }
}

export interface FiltroIndicador {
  /** Nombre canónico — SIEMPRE filtrar en servidor para series de un
   * indicador: sin filtro se pagina el formato largo completo y se agota la
   * cuota (visto en vivo con bucket 5m × 90 días). Omitirlo es legítimo SOLO
   * cuando se quieren todas las series de una ventana acotada y el filtro de
   * `moneda` ya recorta la tabla — el caso del intradía (ver
   * `historialIntradia`, que acota a un día VET). */
  indicador?: string;
  moneda?: string;
}

export async function historialIndicadores(
  desde: Date,
  hasta: Date,
  intervalo: Intervalo,
  filtro: FiltroIndicador,
  { signal, alProgresar }: OpcionesPaginado = {},
): Promise<ItemIndicador[]> {
  validarRango(desde, hasta);
  const filas: ItemIndicador[] = [];
  for (let page = 1; ; page += 1) {
    const pagina = await conReintento429(
      async () =>
        oFalla(
          await client.GET("/indicators/history", {
            params: {
              query: {
                from: desde.toISOString(),
                to: hasta.toISOString(),
                interval: intervalo,
                ...(filtro.indicador !== undefined && {
                  indicator: filtro.indicador,
                }),
                ...(filtro.moneda !== undefined && { currency: filtro.moneda }),
                page,
                page_size: PAGE_SIZE_MAX,
              },
            },
            signal,
          }),
        ),
      signal,
    );
    filas.push(...pagina.data);
    alProgresar?.(page, filas.length, pagina.pagination.has_more);
    if (!pagina.pagination.has_more) {
      return filas;
    }
  }
}

// -- intradía (día operativo VET, todas las series) --------------------------

/** Moneda bajo la que el motor persiste los indicadores P2P. */
const MONEDA_P2P = "VES";

/**
 * Todas las series del día operativo VET, agrupadas por nombre de indicador.
 *
 * Se pide una pasada por moneda (VES para los `p2p_*`, la moneda BCV elegida
 * para los `official_rate*`) y NINGUNA filtra por indicador: es el caso en que
 * traer el formato largo es lo correcto, porque una ventana de un día devuelve
 * todas las series de una vez en lugar de ~20 requests filtrados. Lo que sí es
 * obligatorio es el filtro de moneda: sin él se paginarían las cinco monedas
 * BCV completas para dibujar solo una.
 */
export async function historialIntradia(
  monedaOficial: string,
  intervalo: Intervalo,
  ahora: Date,
  { signal, alProgresar }: OpcionesPaginado = {},
): Promise<Map<string, PuntoIntradia[]>> {
  const desde = inicioDiaVET(ahora);
  const monedas = [...new Set([MONEDA_P2P, monedaOficial])];
  const avance = monedas.map(() => ({ paginas: 0, items: 0, hayMas: false }));
  const reportar =
    (indice: number) =>
    (paginas: number, items: number, hayMas: boolean): void => {
      avance[indice] = { paginas, items, hayMas };
      alProgresar?.(
        avance.reduce((total, a) => total + a.paginas, 0),
        avance.reduce((total, a) => total + a.items, 0),
        avance.some((a) => a.hayMas),
      );
    };

  const grupos = await Promise.all(
    monedas.map((moneda, indice) =>
      historialIndicadores(
        desde,
        ahora,
        intervalo,
        { moneda },
        { signal, alProgresar: reportar(indice) },
      ),
    ),
  );

  const series = new Map<string, PuntoIntradia[]>();
  for (const fila of grupos.flat()) {
    const punto: PuntoIntradia = { t: Date.parse(fila.as_of), valor: fila.value };
    const puntos = series.get(fila.indicator);
    if (puntos === undefined) {
      series.set(fila.indicator, [punto]);
    } else {
      puntos.push(punto);
    }
  }
  // El gateway ordena por bucket DESC; la apertura tiene que quedar primero.
  for (const puntos of series.values()) {
    puntos.sort((a, b) => a.t - b.t);
  }
  return series;
}
