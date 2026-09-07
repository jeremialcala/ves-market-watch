/**
 * Historial de las reglas: qué ha hecho cada regla del ruleset desde que corre.
 *
 * ### Por qué NO hay columna de aciertos
 *
 * El contrato de la API lo dice de su propio campo `outcome`, y esta tabla no
 * puede contradecirlo agregándolo:
 *
 * > «Es historia observada, **no una medida de acierto**: se publica la
 * > variación y nada más — sin veredicto y **sin contador agregado**. El
 * > no-objetivo del PRD es no insinuar capacidad predictiva, y un «N de M» se
 * > lee como tasa de acierto.»
 *
 * Un recuento de aciertos por regla ES ese «N de M». En su lugar la segunda
 * métrica es **cuántos casos tienen la ventana cumplida**: un hecho de
 * completitud —cuánto de la muestra es medible— y no un juicio sobre ninguno.
 *
 * ### Por qué NO se compara contra el backtest
 *
 * Del backtest 11–20 jul sobrevivieron sus **umbrales**, que es lo que
 * `senales.v1.yaml` cita como procedencia. Sus resultados no están en el repo
 * ni en la base: no hay contra qué comparar, y ponerlo habría exigido
 * inventárselo. Las cifras de aquí salen de las señales realmente emitidas.
 */

import type { Analisis, Senal } from "../api/endpoints";
import { formatDecimal, toChartNumber } from "./decimal";

/** Con menos casos que esto, la regla se lee como hipótesis y no como patrón. */
const MINIMO_INDICATIVO = 6;

export type Suficiencia = "sin-casos" | "hipotesis" | "indicativa";

export interface FilaRegla {
  /** Identificador versionado, `arranque_alcista@v1`. */
  regla: string;
  /** Clave canónica en snake_case, sin la versión. */
  clave: string;
  casos: number;
  /** Casos cuya ventana de observación ya se cumplió. */
  conResultado: number;
  /** Media de `gap_delta_pp`, exacta hasta el formateo. `null` sin resultados. */
  efectoMedio: string | null;
  /** Ventana de observación, en horas. `null` si ningún caso la tiene. */
  horas: number | null;
  suficiencia: Suficiencia;
}

function suficienciaDe(casos: number): Suficiencia {
  if (casos === 0) {
    return "sin-casos";
  }
  return casos < MINIMO_INDICATIVO ? "hipotesis" : "indicativa";
}

/**
 * Una fila por regla del ruleset, **incluidas las que no han disparado nunca**.
 *
 * Omitir una regla con cero casos la haría desaparecer de la vista, y «esta
 * regla existe y no ha disparado» es justo lo que alguien querría saber al
 * mirar esta tabla. El catálogo sale de `rule_proximity`, que es el ruleset
 * vigente según el motor —no una lista escrita a mano en el SPA, que se
 * desincronizaría en el primer cambio de versión—.
 */
export function historialDeReglas(
  senales: readonly Senal[],
  analisis: Analisis | null,
): FilaRegla[] {
  if (analisis === null) {
    return [];
  }
  return analisis.rule_proximity
    .map((proximidad) => {
      const propias = senales.filter(
        (s) => s.evidence.rule === proximidad.rule,
      );
      const conResultado = propias.filter((s) => s.outcome != null);
      const horas = conResultado[0]?.outcome?.hours ?? null;

      // Media aritmética simple sobre los casos medibles. Los que aún no tienen
      // ventana cumplida NO entran: promediarlos como cero movería la media
      // hacia el centro por una razón que no es del mercado.
      const efectoMedio =
        conResultado.length === 0
          ? null
          : String(
              conResultado.reduce(
                (acc, s) => acc + toChartNumber(s.outcome!.gap_delta_pp),
                0,
              ) / conResultado.length,
            );

      return {
        regla: proximidad.rule,
        clave: proximidad.rule.split("@")[0],
        casos: propias.length,
        conResultado: conResultado.length,
        efectoMedio,
        horas,
        suficiencia: suficienciaDe(propias.length),
      };
    })
    .sort((a, b) => b.casos - a.casos || a.clave.localeCompare(b.clave));
}

/** Formatea el efecto medio con su signo explícito. */
export function formatearEfecto(
  efecto: string | null,
  idioma: "es" | "en",
): string | null {
  if (efecto === null) {
    return null;
  }
  const n = toChartNumber(efecto);
  const cuerpo = formatDecimal(efecto, { maxDecimales: 2, idioma });
  return n > 0 ? `+${cuerpo}` : cuerpo;
}

/**
 * Color de «con resultado»: dice si la muestra es MEDIBLE, no si acertó.
 *
 * Sage cuando toda la muestra tiene su ventana cumplida; atenuado mientras
 * queden casos pendientes, porque entonces la media de al lado se calcula sobre
 * menos de lo que la columna «Casos» promete.
 */
export function colorMedible(fila: FilaRegla): string {
  if (fila.casos === 0) {
    return "var(--text-dim)";
  }
  return fila.conResultado === fila.casos ? "var(--sage)" : "var(--text-muted)";
}

/** Color de la pastilla de muestra, por suficiencia. */
export function colorSuficiencia(s: Suficiencia): string {
  return s === "indicativa"
    ? "var(--sage)"
    : s === "hipotesis"
      ? "var(--coral)"
      : "var(--text-dim)";
}
