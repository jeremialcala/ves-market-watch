/**
 * Microestructura — las cuatro series que el ruleset vigila.
 *
 * Dejan de ser paneles de la parrilla porque no son cifras del día como las
 * demás: cada una es una CONDICIÓN de una regla, y lo que hay que poder leer de
 * un vistazo es si está cumplida y a qué distancia queda de estarlo. Por eso el
 * color aquí no codifica el lado —no lo tienen— sino el estado: coral cumple,
 * teal no. Es la inversión que se espera del proyecto: el coral es del ruleset,
 * lo que dispara, no lo que va bien.
 *
 * El estado NO se evalúa aquí. Sale de `rule_proximity`, que es donde el motor
 * ya dijo qué condición se cumple y contra qué umbral; el SPA no compara nada
 * (ver `lib/reglas.ts` para cuál de las reglas gobierna a cada indicador).
 *
 * Sin análisis no hay estado, y entonces la tarjeta no se pinta ni coral ni
 * teal: va con hairline, sin pastilla y sin línea de disparo. Elegir un color
 * sería afirmar un estado que nadie ha calculado.
 *
 * Cuáles son las tarjetas tampoco se cablea: son las series del grupo, en el
 * orden que llegan ordenadas. Un indicador de microestructura nuevo aparece con
 * su tarjeta sin tocar este archivo (RF-7); si además es condición de alguna
 * regla, hereda el estado sin más.
 */

import type { Clave } from "../i18n/dict";
import { useI18n } from "../i18n/contexto";
import { formatearDelta, valorConUnidad } from "../lib/delta";
import { presentacionDe, resumenIntradia, type PuntoIntradia } from "../lib/intradia";
import { condicionDe, type CondicionDeIndicador } from "../lib/reglas";
import { trazoConUmbral } from "../lib/movimiento";

const ANCHO = 160;
const ALTO = 44;

/** Cómo se escribe cada operador en la línea de disparo. */
const SIMBOLO_OP = { gt: ">", gte: "≥", lt: "<", lte: "≤" } as const;

/**
 * Qué mide cada indicador y cómo se lee. Salen de
 * `knowledge/metrics/microestructura-p2p.md`: la tarjeta no inventa lecturas,
 * repite la que el proyecto ya tiene escrita.
 */
const NOTA: Record<string, Clave> = {
  p2p_drenaje_oferta_6h_pct: "micro.notaDrenaje",
  p2p_momentum_bid_3h_pct: "micro.notaMomentum",
  p2p_ratio_oferta_demanda: "micro.notaRatio",
  p2p_spread_pct: "micro.notaSpread",
};

export function MicroCards({
  indicadores,
  analisis,
}: {
  /** Series del grupo, ya ordenadas por la vista. */
  indicadores: ReadonlyArray<readonly [string, PuntoIntradia[]]>;
  analisis: Parameters<typeof condicionDe>[0];
}) {
  const { t } = useI18n();
  if (indicadores.length === 0) {
    return null;
  }
  return (
    <section className="vmw-seccion" aria-label={t("intradia.grupoMicro")}>
      <div className="vmw-seccion__cabecera">
        <h3 className="vmw-movio__titulo">{t("intradia.grupoMicro")}</h3>
        <span className="vmw-movio__bajada">{t("micro.bajada")}</span>
      </div>
      <div className="vmw-micro__rejilla">
        {indicadores.map(([indicador, puntos]) => (
          <Tarjeta
            key={indicador}
            indicador={indicador}
            puntos={puntos}
            condicion={condicionDe(analisis, indicador)}
          />
        ))}
      </div>
    </section>
  );
}

function Tarjeta({
  indicador,
  puntos,
  condicion,
}: {
  indicador: string;
  puntos: readonly PuntoIntradia[];
  condicion: CondicionDeIndicador | null;
}) {
  const { t, idioma } = useI18n();
  const { etiqueta, unidad, decimales } = presentacionDe(indicador);
  const resumen = resumenIntradia(puntos);
  const num = (v: string) => valorConUnidad(v, { unidad, decimales, idioma });
  const nota = NOTA[indicador];

  /*
   * Tres estados, no dos: cumple, no cumple, y «no se sabe» —sin análisis o
   * indicador fuera del ruleset—. El tercero no se pinta de ningún color.
   */
  const estado =
    condicion === null ? "sin-regla" : condicion.cumple ? "cumple" : "no-cumple";
  const color =
    estado === "cumple"
      ? "var(--coral)"
      : estado === "no-cumple"
        ? "var(--teal)"
        : "var(--text-muted)";

  const { trazo, yUmbral } = trazoConUmbral(
    puntos,
    condicion?.umbral ?? null,
    ANCHO,
    ALTO,
  );

  return (
    <article className="vmw-micro__tarjeta" data-estado={estado}>
      <div className="vmw-micro__cabecera">
        {/* Solo el nombre: la unidad viaja pegada a la cifra. */}
        <span className="vmw-micro__metrica" title={indicador}>
          {etiqueta}
        </span>
        {condicion !== null && (
          <span className="vmw-micro__estado" data-estado={estado}>
            {t(condicion.cumple ? "micro.cumple" : "micro.noCumple")}
          </span>
        )}
      </div>

      {resumen === null ? (
        <p className="vmw-micro__nota">{t("intradia.sinHoy")}</p>
      ) : (
        <>
          <p className="vmw-micro__cifra-fila">
            <span className="vmw-micro__cifra">{num(resumen.ultimo)}</span>
            {/* La variación en tinta: el color de la tarjeta ya lo gasta el
                ESTADO de la condición, así que aquí manda el signo escrito. */}
            <span className="vmw-micro__variacion">
              {formatearDelta(resumen, {
                unidad,
                decimales,
                idioma,
                sinCambio: t("delta.sinCambio"),
              }).texto}
            </span>
          </p>

          <svg
            className="vmw-micro__spark"
            viewBox={`0 0 ${ANCHO} ${ALTO}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={
              condicion === null
                ? t("micro.descripcionSpark", {
                    apertura: num(resumen.apertura),
                    ultimo: num(resumen.ultimo),
                  })
                : t("micro.descripcionSparkUmbral", {
                    apertura: num(resumen.apertura),
                    ultimo: num(resumen.ultimo),
                    umbral: num(condicion.umbral),
                  })
            }
          >
            {/* El umbral va DEBAJO de la serie y comparte su escala: es el
                fondo contra el que se lee la línea, no un dato más. */}
            {yUmbral !== null && (
              <polyline
                points={`0,${yUmbral} ${ANCHO},${yUmbral}`}
                fill="none"
                stroke="var(--coral)"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.7"
              />
            )}
            <polyline
              points={trazo}
              fill="none"
              stroke={color}
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>

          <div className="vmw-micro__pie">
            <span>{t("micro.apertura", { valor: num(resumen.apertura) })}</span>
            {condicion !== null && (
              <span>
                {t("micro.dispara", {
                  op: SIMBOLO_OP[condicion.op],
                  umbral: num(condicion.umbral),
                })}
              </span>
            )}
          </div>
        </>
      )}

      {nota !== undefined && <p className="vmw-micro__nota">{t(nota)}</p>}

      {/* Sin la regla, «cumple» no dice qué se cumple: dos condiciones del mismo
          indicador viven en reglas distintas con umbrales distintos. */}
      <p className="vmw-micro__regla">
        {condicion === null
          ? t("micro.sinRegla")
          : t("micro.regla", {
              regla: condicion.regla,
              i: condicion.indice,
              n: condicion.total,
            })}
      </p>
    </article>
  );
}
