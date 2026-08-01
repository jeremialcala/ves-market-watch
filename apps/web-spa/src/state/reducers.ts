/**
 * Reducers puros del estado de mercado: aplicar un push del WSS o un resync
 * REST produce un estado nuevo. Sin I/O — todo testeable sin infraestructura.
 *
 * Proyección de `indicators` (formato largo, ADR-0014) a las vistas del
 * dashboard con el MISMO criterio que el gateway: confianza low > 30 %
 * outliers; brecha del lado buy; volumes = liquidez por lado.
 */

import type { CuotaRateLimit } from "../api/client";
import type {
  Indicadores,
  Profundidad,
  ReferenciaP2P,
  Salud,
  Senal,
  TasaOficial,
} from "../api/endpoints";
import { compararDecimales } from "../lib/decimal";
import type {
  PayloadIndicadores,
  PayloadSenal,
  PayloadTasaOficial,
  PushEvento,
} from "../ws/messages";

export type EstadoConexion =
  | "desconectado"
  | "conectando"
  | "conectado"
  | "reconectando"
  | "detenido";

interface Vigente {
  value: string;
  as_of: string;
}

export interface EstadoMercado {
  tasas: Record<string, TasaOficial>;
  p2p: { buy?: ReferenciaP2P; sell?: ReferenciaP2P };
  indicadores: Indicadores | null;
  profundidad: { buy?: Profundidad; sell?: Profundidad };
  senales: Senal[];
  /** Último valor por indicador canónico (currency VES/USD, formato largo). */
  vigentes: Record<string, Vigente>;
  conexion: EstadoConexion;
  detalleConexion: string | null;
  cuota: CuotaRateLimit;
  salud: Salud | null;
  eventosVistos: string[];
  /** `occurred_at` del último push aceptado — la barra de estado muestra su
   * antigüedad («último evento hace 34 s»); `null` mientras no llegue ninguno. */
  ultimoEventoEn: string | null;
}

export const ESTADO_INICIAL: EstadoMercado = {
  tasas: {},
  p2p: {},
  indicadores: null,
  profundidad: {},
  senales: [],
  vigentes: {},
  conexion: "desconectado",
  detalleConexion: null,
  cuota: {},
  salud: null,
  eventosVistos: [],
  ultimoEventoEn: null,
};

const MAX_SENALES = 50;
const MAX_EVENTOS_VISTOS = 200;
const UMBRAL_OUTLIERS_LOW = "30";

// -- push --------------------------------------------------------------------

export function aplicarPush(
  estado: EstadoMercado,
  push: PushEvento,
): EstadoMercado {
  if (estado.eventosVistos.includes(push.event_id)) {
    return estado; // reentrega: idempotente
  }
  const visto = {
    eventosVistos: [push.event_id, ...estado.eventosVistos].slice(
      0,
      MAX_EVENTOS_VISTOS,
    ),
    ultimoEventoEn: push.occurred_at,
  };
  switch (push.topic) {
    case "rates.official":
      return {
        ...aplicarTasaOficial(estado, push.data as PayloadTasaOficial),
        ...visto,
      };
    case "indicators":
      return {
        ...aplicarIndicadores(estado, push.data as PayloadIndicadores),
        ...visto,
      };
    case "signals":
      return {
        ...aplicarSenal(estado, push.data as PayloadSenal, push.occurred_at),
        ...visto,
      };
    case "p2p.snapshot":
      // El crudo no alimenta la UI directamente (la profundidad se repone por
      // REST al recibirlo — efecto del StreamClient, no del reducer).
      return { ...estado, ...visto };
  }
}

function aplicarTasaOficial(
  estado: EstadoMercado,
  data: PayloadTasaOficial,
): EstadoMercado {
  const tasa: TasaOficial = {
    currency: data.currency,
    rate: data.rate,
    value_date: data.value_date,
    captured_at: data.captured_at,
    stale: false, // push en vivo: recién capturada
  };
  return { ...estado, tasas: { ...estado.tasas, [data.currency]: tasa } };
}

function aplicarIndicadores(
  estado: EstadoMercado,
  data: PayloadIndicadores,
): EstadoMercado {
  const vigentes = { ...estado.vigentes };
  for (const fila of data.indicators) {
    vigentes[fila.indicator] = { value: fila.value, as_of: data.as_of };
  }
  const intermedio = { ...estado, vigentes };
  return {
    ...intermedio,
    p2p: {
      buy: derivarReferencia(vigentes, "buy") ?? estado.p2p.buy,
      sell: derivarReferencia(vigentes, "sell") ?? estado.p2p.sell,
    },
    indicadores: derivarIndicadores(intermedio, data),
  };
}

function derivarReferencia(
  vigentes: Record<string, Vigente>,
  lado: "buy" | "sell",
): ReferenciaP2P | undefined {
  const v = (nombre: string) => vigentes[`${nombre}_${lado}`];
  const mejor = v("p2p_mejor_precio");
  const mediana = v("p2p_mediana");
  const vwap = v("p2p_vwap");
  const liquidez = v("p2p_liquidez");
  if (!mejor || !mediana || !vwap || !liquidez) {
    return undefined;
  }
  const outliers = v("p2p_outliers_pct");
  const low =
    outliers !== undefined &&
    compararDecimales(outliers.value, UMBRAL_OUTLIERS_LOW) === 1;
  return {
    side: lado,
    best_price: mejor.value,
    median: mediana.value,
    vwap: vwap.value,
    volume: liquidez.value,
    as_of: mediana.as_of,
    confidence: low ? "low" : "normal",
  };
}

function derivarIndicadores(
  estado: EstadoMercado,
  data: PayloadIndicadores,
): Indicadores | null {
  const previo = estado.indicadores;
  const v = (nombre: string) => estado.vigentes[nombre]?.value ?? null;
  const liquidezBuy = v("p2p_liquidez_buy");
  const liquidezSell = v("p2p_liquidez_sell");
  return {
    currency: previo?.currency ?? "USD",
    as_of: data.as_of,
    calc_version: data.calc_version,
    official_stale: data.official_stale,
    gap_abs: v("p2p_brecha_abs_buy"),
    gap_pct: v("p2p_brecha_pct_buy"),
    spread_pct: v("p2p_spread_pct"),
    volumes:
      liquidezBuy !== null && liquidezSell !== null
        ? { buy: liquidezBuy, sell: liquidezSell }
        : null,
  };
}

function aplicarSenal(
  estado: EstadoMercado,
  data: PayloadSenal,
  occurredAt: string,
): EstadoMercado {
  const senal: Senal = {
    type: data.type,
    direction: data.direction,
    currency: data.currency,
    as_of: data.as_of,
    emitted_at: occurredAt,
    calc_version: data.calc_version,
    triggered_by: data.triggered_by,
    evidence: data.evidence,
  };
  return {
    ...estado,
    senales: [senal, ...estado.senales].slice(0, MAX_SENALES),
  };
}

// -- resync ------------------------------------------------------------------

export interface SnapshotResync {
  tasas?: Record<string, TasaOficial>;
  p2p?: { buy?: ReferenciaP2P; sell?: ReferenciaP2P };
  indicadores?: Indicadores | null;
  profundidad?: { buy?: Profundidad; sell?: Profundidad };
  senales?: Senal[];
  salud?: Salud | null;
}

/** El resync REST es autoritativo: sobreescribe las vistas que trae. */
export function aplicarResync(
  estado: EstadoMercado,
  snapshot: SnapshotResync,
): EstadoMercado {
  return {
    ...estado,
    ...(snapshot.tasas !== undefined && { tasas: snapshot.tasas }),
    ...(snapshot.p2p !== undefined && { p2p: snapshot.p2p }),
    ...(snapshot.indicadores !== undefined && {
      indicadores: snapshot.indicadores,
    }),
    ...(snapshot.profundidad !== undefined && {
      profundidad: snapshot.profundidad,
    }),
    ...(snapshot.senales !== undefined && { senales: snapshot.senales }),
    ...(snapshot.salud !== undefined && { salud: snapshot.salud }),
  };
}
