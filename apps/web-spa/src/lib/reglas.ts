/**
 * Qué condición del ruleset gobierna a un indicador.
 *
 * Los indicadores de microestructura no son cifras sueltas: cada uno es una
 * condición de una regla, y esa condición es la que decide si la tarjeta va en
 * coral o en teal. Todo sale de `rule_proximity` — el SPA no evalúa nada.
 */

export interface CondicionDeIndicador {
  /** Regla a la que pertenece, con su versión (`arranque_alcista@v1`). */
  regla: string;
  op: "gt" | "gte" | "lt" | "lte";
  /** Umbral EXACTO del contrato. */
  umbral: string;
  cumple: boolean;
  /** Posición de la condición dentro de su regla, empezando en 1. */
  indice: number;
  total: number;
}

interface AnalisisConReglas {
  summary?: { closest_rule?: string | null };
  rule_proximity: readonly {
    readonly rule: string;
    readonly conditions_total?: number;
    readonly conditions: readonly {
      readonly indicator: string;
      readonly op: "gt" | "gte" | "lt" | "lte";
      readonly threshold: string;
      readonly value?: string | null;
      readonly met: boolean;
    }[];
  }[];
}

/**
 * La condición que gobierna a `indicador`, o `null` si no participa en ninguna
 * regla.
 *
 * Un mismo indicador aparece en VARIAS reglas con umbrales distintos —el
 * momentum lleva `lt -1`, `gt 0.5` y `gt 1.5`—, así que hay que elegir una. Se
 * prefiere la de `summary.closest_rule`, que es la regla que el resto de la
 * vista ya está destacando: la tarjeta habla de lo mismo que el titular. Sin
 * ella, la primera por orden alfabético de regla, para que dos refrescos no
 * pinten cosas distintas.
 */
export function condicionDe(
  analisis: AnalisisConReglas | null,
  indicador: string,
): CondicionDeIndicador | null {
  if (analisis === null) {
    return null;
  }
  const candidatas = [...analisis.rule_proximity]
    .sort((a, b) => a.rule.localeCompare(b.rule))
    .flatMap((regla) => {
      const indice = regla.conditions.findIndex((c) => c.indicator === indicador);
      if (indice === -1) {
        return [];
      }
      const condicion = regla.conditions[indice];
      return [
        {
          regla: regla.rule,
          op: condicion.op,
          umbral: condicion.threshold,
          cumple: condicion.met,
          indice: indice + 1,
          // El total del contrato, no el largo del array: si algún día una
          // condición no viaja, «2 de 3» sigue siendo cierto y «2 de 2» no.
          total: regla.conditions_total ?? regla.conditions.length,
        },
      ];
    });
  if (candidatas.length === 0) {
    return null;
  }
  const cercana = analisis.summary?.closest_rule;
  return candidatas.find((c) => c.regla === cercana) ?? candidatas[0];
}
