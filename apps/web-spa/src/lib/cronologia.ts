/**
 * Los eventos de la sesión, derivados del dato — no un log que alguien escriba.
 *
 * Cuatro clases, y cada una es un hecho comprobable contra las series del día:
 *
 * - `apertura`: el primer bucket del día operativo.
 * - `umbral`: una condición del ruleset que cambia de estado durante la sesión y
 *   **el estado nuevo aguanta** (ver `PERMANENCIA_MS`). Los umbrales NO se
 *   inventan aquí: son los que publica `rule_proximity`.
 * - `liquidez`: un salto de bucket a bucket que supera 2σ de los saltos de esa
 *   misma serie en la ventana de referencia. σ sobre los SALTOS y no sobre los
 *   valores: lo que se está midiendo es si este movimiento es grande *para lo
 *   que se mueve normalmente*, no si el nivel es alto.
 * - `recalculo`: el `as_of` del último análisis publicado.
 *
 * Lo que NO hay: nada que no se pueda señalar en una serie. Sin eventos, la
 * sección no se pinta — una cronología vacía adornada de «sin novedad» invita a
 * creer que se vigiló algo.
 */

import { restarDecimales, toChartNumber } from "./decimal";
import type { PuntoIntradia } from "./intradia";
import { desviacionTipica } from "./movimiento";

export type ClaseEvento = "apertura" | "umbral" | "liquidez" | "recalculo";

export interface EventoSesion {
  /** Epoch ms del bucket en que ocurre. */
  t: number;
  clase: ClaseEvento;
  /** Nombre canónico del indicador implicado, cuando lo hay. */
  indicador?: string;
  /** Valores EXACTOS del contrato para la línea de cifras. */
  valor?: string;
  umbral?: string;
  delta?: string;
  /** Un cruce puede pasar a cumplir o a dejar de cumplir. */
  cumple?: boolean;
  /** Regla a la que pertenece la condición cruzada. */
  regla?: string;
  /** Múltiplo de σ del salto, para poder decir cuán grande fue. */
  sigmas?: number;
}

/** Un salto de liquidez entra en la cronología a partir de este múltiplo. */
export const SIGMAS_SALTO = 2;

/**
 * Histéresis de los cruces: el estado nuevo tiene que aguantar 15 minutos.
 *
 * Sin esto, un indicador que oscila junto a su umbral genera un evento por cada
 * temblor. Medido sobre una sesión real: 21 cruces crudos en cuatro condiciones,
 * de los que 8 sobreviven — el resto eran idas y vueltas de uno o dos buckets.
 * La cronología pasaba de 50 líneas, 48 de ellas cuatro indicadores temblando.
 *
 * Va en TIEMPO y no en número de buckets para que signifique lo mismo con
 * bucket de 5 min que de 1 h. Se probó antes una banda de amplitud —el clásico
 * Schmitt— sobre la σ de 7 días, y no vale aquí: en el ratio esa σ es 0,58
 * frente a un umbral de 0,3, así que la banda se comía el umbral entero. La σ
 * larga mide cambios de régimen, no el temblor local.
 */
export const PERMANENCIA_MS = 15 * 60_000;

const LIQUIDEZ = ["p2p_liquidez_buy", "p2p_liquidez_sell"];

type Operador = "gt" | "gte" | "lt" | "lte";

interface CondicionRuleset {
  indicator: string;
  op: Operador;
  threshold: string;
}

interface AnalisisMinimo {
  as_of: string;
  rule_proximity: readonly {
    readonly rule: string;
    readonly conditions: readonly CondicionRuleset[];
  }[];
}

function cumpleCondicion(valor: number, op: Operador, umbral: number): boolean {
  switch (op) {
    case "gt":
      return valor > umbral;
    case "gte":
      return valor >= umbral;
    case "lt":
      return valor < umbral;
    case "lte":
      return valor <= umbral;
  }
}

/**
 * Eventos de la sesión, en orden cronológico.
 *
 * `analisis` puede faltar (sin él no hay umbrales ni recálculo que señalar) y
 * `referencia` también (sin ella no se puede decir que un salto sea grande).
 * Cada ausencia quita SUS eventos, no la cronología entera.
 */
export function eventosDeSesion(
  sesion: ReadonlyMap<string, readonly PuntoIntradia[]>,
  referencia: ReadonlyMap<string, readonly PuntoIntradia[]>,
  analisis: AnalisisMinimo | null,
): EventoSesion[] {
  const eventos: EventoSesion[] = [];

  const apertura = primerBucket(sesion);
  if (apertura === null) {
    return [];
  }
  eventos.push({ t: apertura, clase: "apertura" });

  eventos.push(...crucesDeUmbral(sesion, analisis));
  eventos.push(...saltosDeLiquidez(sesion, referencia));

  if (analisis !== null) {
    const t = Date.parse(analisis.as_of);
    // Un recálculo anterior a la apertura no es de esta sesión.
    if (Number.isFinite(t) && t >= apertura) {
      eventos.push({ t, clase: "recalculo" });
    }
  }

  // Desempate por clase y por indicador: dos eventos en el mismo bucket no
  // pueden cambiar de orden entre refrescos.
  return eventos.sort(
    (a, b) =>
      a.t - b.t ||
      a.clase.localeCompare(b.clase) ||
      (a.indicador ?? "").localeCompare(b.indicador ?? ""),
  );
}

/**
 * ¿El estado del bucket `i` se sostiene durante `PERMANENCIA_MS`?
 *
 * Con la serie aún demasiado corta para saberlo —el cruce es de hace un
 * momento— la respuesta es NO: puede ser ruido, y aparecerá en el refresco
 * siguiente si aguantó. Un evento que se pinta y desaparece es peor que uno que
 * llega tarde.
 */
function aguanta(
  puntos: readonly PuntoIntradia[],
  i: number,
  estado: (indice: number) => boolean,
): boolean {
  const nuevo = estado(i);
  const limite = puntos[i].t + PERMANENCIA_MS;
  let j = i + 1;
  for (; j < puntos.length && puntos[j].t < limite; j += 1) {
    if (estado(j) !== nuevo) {
      return false;
    }
  }
  // Se agotó la serie antes del plazo: todavía no se puede afirmar.
  return puntos[puntos.length - 1].t >= limite;
}

function primerBucket(
  sesion: ReadonlyMap<string, readonly PuntoIntradia[]>,
): number | null {
  let primero: number | null = null;
  for (const puntos of sesion.values()) {
    const t = puntos[0]?.t;
    if (t !== undefined && (primero === null || t < primero)) {
      primero = t;
    }
  }
  return primero;
}

/**
 * Cada vez que una condición del ruleset cambia de estado dentro de la sesión.
 *
 * Los umbrales son los del análisis vigente. Si el ruleset cambiara a mitad de
 * sesión, los cruces se recalcularían con los nuevos — es lo honesto que se
 * puede hacer sin un histórico de rulesets, y por eso la línea de cifras nombra
 * el umbral contra el que se midió.
 */
function crucesDeUmbral(
  sesion: ReadonlyMap<string, readonly PuntoIntradia[]>,
  analisis: AnalisisMinimo | null,
): EventoSesion[] {
  if (analisis === null) {
    return [];
  }
  const eventos: EventoSesion[] = [];
  const vistas = new Set<string>();

  for (const regla of analisis.rule_proximity) {
    for (const condicion of regla.conditions) {
      /*
       * Se deduplica por (indicador, op, umbral) y NO por indicador: un mismo
       * indicador tiene condiciones distintas en reglas distintas —el ratio
       * lleva `lt 0.2`, `lt 0.3` y `gt 2`— y son cruces diferentes. Deduplicar
       * por indicador habría escondido dos de cada tres.
       */
      const firma = `${condicion.indicator}|${condicion.op}|${condicion.threshold}`;
      if (vistas.has(firma)) {
        continue;
      }
      vistas.add(firma);

      const puntos = sesion.get(condicion.indicator) ?? [];
      const umbral = toChartNumber(condicion.threshold);
      const estado = (i: number) =>
        cumpleCondicion(toChartNumber(puntos[i].valor), condicion.op, umbral);

      let confirmado: boolean | null = null;
      for (let i = 0; i < puntos.length; i += 1) {
        const ahora = estado(i);
        if (confirmado === null) {
          confirmado = ahora;
          continue;
        }
        if (ahora === confirmado || !aguanta(puntos, i, estado)) {
          continue;
        }
        confirmado = ahora;
        eventos.push({
          // El instante es el del CRUCE, no el de su confirmación: lo que se
          // señala es cuándo pasó, no cuándo se pudo asegurar.
          t: puntos[i].t,
          clase: "umbral",
          indicador: condicion.indicator,
          valor: puntos[i].valor,
          umbral: condicion.threshold,
          cumple: ahora,
          regla: regla.rule,
        });
      }
    }
  }
  return eventos;
}

/** Saltos de liquidez que superan 2σ de los saltos de la ventana de referencia. */
function saltosDeLiquidez(
  sesion: ReadonlyMap<string, readonly PuntoIntradia[]>,
  referencia: ReadonlyMap<string, readonly PuntoIntradia[]>,
): EventoSesion[] {
  const eventos: EventoSesion[] = [];

  for (const indicador of LIQUIDEZ) {
    const puntos = sesion.get(indicador) ?? [];
    const sigma = desviacionTipica(saltos(referencia.get(indicador) ?? []));
    if (sigma === null || sigma === 0 || puntos.length < 2) {
      continue;
    }
    for (let i = 1; i < puntos.length; i += 1) {
      const delta = restarDecimales(puntos[i].valor, puntos[i - 1].valor);
      const sigmas = Math.abs(toChartNumber(delta)) / sigma;
      if (sigmas > SIGMAS_SALTO) {
        eventos.push({
          t: puntos[i].t,
          clase: "liquidez",
          indicador,
          valor: puntos[i].valor,
          delta,
          sigmas,
        });
      }
    }
  }
  return eventos;
}

/** Diferencias bucket a bucket, como strings exactos. */
function saltos(puntos: readonly PuntoIntradia[]): string[] {
  const diferencias: string[] = [];
  for (let i = 1; i < puntos.length; i += 1) {
    diferencias.push(restarDecimales(puntos[i].valor, puntos[i - 1].valor));
  }
  return diferencias;
}
