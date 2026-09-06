/**
 * «Episodios comparables»: qué pasó las últimas veces que el libro se parecía.
 *
 * Cada tarjeta es una señal REAL del histórico, con los valores exactos que
 * dispararon su regla (`evidence.inputs`) puestos al lado de los de hoy
 * (`rule_proximity`). La similitud sale de `lib/episodios` — distancia
 * normalizada por las condiciones del ruleset—, **no de una selección a mano**.
 *
 * ### «Qué pasó después» es historia, no acierto
 *
 * Sale de `outcome`, que el gateway calcula como la variación de la brecha
 * entre la señal y el final de su ventana. Se presenta la variación y nada
 * más: sin veredicto, sin «acertó/falló» y sin un «N de M» agregado, que se
 * leería como tasa de acierto — no-objetivo del PRD, y la línea que ya fija
 * `SignalsFeed`.
 *
 * Mientras la ventana no se ha cumplido, `outcome` viaja `null` y la tarjeta lo
 * dice: **todavía no ocurrió** no es lo mismo que no haber pasado nada.
 */

import { useI18n } from "../i18n/contexto";
import type { Idioma } from "../i18n/idioma";
import type { Analisis, Senal } from "../api/endpoints";
import { formatDecimal } from "../lib/decimal";
import {
  colorCoincidencia,
  colorResultado,
  episodiosComparables,
  type Episodio,
} from "../lib/episodios";

const LOCALE: Record<Idioma, string> = { es: "es-VE", en: "en-US" };

/** Color semántico del episodio: lo marca su dirección, que es un hecho. */
function colorRegla(senal: Senal): string {
  return senal.direction === "bajista" ? "var(--sage)" : "var(--coral)";
}

export function EpisodiosComparables({
  senales,
  analisis,
  idioma,
}: {
  senales: readonly Senal[];
  analisis: Analisis | null;
  idioma: Idioma;
}) {
  const { t } = useI18n();
  const episodios = episodiosComparables(senales, analisis);

  // Sin episodios comparables no se pinta la sección. Una rejilla vacía con su
  // título prometería algo que no hay.
  if (episodios.length === 0) {
    return null;
  }

  return (
    <section className="vmw-episodios" aria-label={t("episodios.titulo")}>
      <div className="vmw-episodios__cabecera">
        <h3 className="vmw-episodios__titulo">{t("episodios.titulo")}</h3>
        <span className="vmw-episodios__bajada">{t("episodios.bajada")}</span>
      </div>

      <div className="vmw-episodios__rejilla">
        {episodios.map((episodio) => (
          <Tarjeta
            key={episodio.senal.as_of}
            episodio={episodio}
            idioma={idioma}
            t={t}
          />
        ))}
      </div>
    </section>
  );
}

function Tarjeta({
  episodio,
  idioma,
  t,
}: {
  episodio: Episodio;
  idioma: Idioma;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const { senal, similitud, condiciones } = episodio;
  const color = colorRegla(senal);
  const num = (v: string) => formatDecimal(v, { maxDecimales: 2, idioma });

  return (
    <article className="vmw-episodio" style={{ borderColor: color }}>
      <div className="vmw-episodio__fila1">
        <span className="vmw-episodio__fecha">
          {new Intl.DateTimeFormat(LOCALE[idioma], {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(senal.as_of))}
        </span>
        <span className="vmw-episodio__pastilla">
          {t("episodios.coincidencia", { pct: String(similitud) })}
        </span>
      </div>

      <span className="vmw-episodio__regla" style={{ color }}>
        {senal.evidence.rule}
      </span>

      <div className="vmw-episodio__tabla">
        <div className="vmw-episodio__cabtabla">
          <span>{t("episodios.colCondicion")}</span>
          <span>{t("episodios.colEntonces")}</span>
          <span>{t("episodios.colHoy")}</span>
        </div>
        {condiciones.map((c) => (
          <div className="vmw-episodio__fila" key={c.indicador}>
            <span className="vmw-episodio__cond">{c.indicador}</span>
            <span className="vmw-episodio__entonces">
              {c.entonces === null ? "—" : num(c.entonces)}
            </span>
            <span
              className="vmw-episodio__hoy"
              style={{ color: colorCoincidencia(c.coincide) }}
            >
              {c.hoy === null ? "—" : num(c.hoy)}
            </span>
          </div>
        ))}
      </div>

      <div className="vmw-episodio__despues">
        <span className="vmw-episodio__eyebrow">{t("episodios.despues")}</span>
        {senal.outcome == null ? (
          // La ventana no se ha cumplido. Decirlo, en vez de dejar el hueco:
          // «todavía no ocurrió» no es lo mismo que «no pasó nada».
          <span className="vmw-episodio__prosa">{t("episodios.sinVentana")}</span>
        ) : (
          <>
            <span className="vmw-episodio__prosa">
              {t("episodios.prosa", { horas: String(senal.outcome.hours) })}
            </span>
            <span
              className="vmw-episodio__resultado"
              style={{ color: colorResultado(senal.outcome.gap_delta_pp) }}
            >
              {t("episodios.resultado", {
                delta: num(senal.outcome.gap_delta_pp),
              })}
            </span>
          </>
        )}
      </div>
    </article>
  );
}
