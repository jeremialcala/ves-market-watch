/**
 * Tasa oficial como **bloque de contexto**, no como protagonista.
 *
 * La jerarquía de la vista se dice con el tamaño y el relleno, no con un
 * rótulo: la serie evaluada ocupa 280 px con su capa de referencia completa, y
 * esta ocupa 140 px, con área rellena, sin banda, sin mediana y sin eje Y.
 * Quien entra sabe cuál manda antes de leer nada.
 *
 * ### El porcentaje del subtítulo se CALCULA
 *
 * «La pierna que explica el N % del precio» es una afirmación factual, así que
 * sale de la brecha vigente: `parte = 100 / (1 + brecha/100)`. Cablear un
 * número —el enunciado traía un 88 %, y hoy son 85,1— habría envejecido en
 * días y dejado la frase diciendo algo falso con toda naturalidad. Sin brecha
 * vigente, la frase se queda sin el dato en vez de inventárselo.
 */

import { SerieTemporal } from "./SerieTemporal";
import { SinDatosGrafico } from "./SinDatosGrafico";
import { useI18n } from "../i18n/contexto";
import type { Idioma } from "../i18n/idioma";
import { formatDecimal } from "../lib/decimal";
import { parteDelPrecio } from "../lib/pierna";
import { desfaseEntre } from "../lib/cobertura";
import type { Punto } from "../lib/series";

const LOCALE: Record<Idioma, string> = { es: "es-VE", en: "en-US" };

export function TasaOficialContexto({
  puntos,
  moneda,
  brechaPct,
  dias,
  idioma,
  evaluada,
}: {
  puntos: readonly Punto[];
  moneda: string;
  /** Rango pedido, para elegir el paso de las marcas del eje. */
  dias: number;
  /** Brecha porcentual vigente; `null` si no hay ninguna. */
  brechaPct: string | null;
  idioma: Idioma;
  /** La otra serie de la vista, para anotar el desfase entre ambas. */
  evaluada: readonly Punto[];
}) {
  const { t } = useI18n();
  const locale = LOCALE[idioma];

  const parte = parteDelPrecio(brechaPct);
  const ultimo = puntos.length > 0 ? puntos[puntos.length - 1] : null;

  const fecha = (ms: number) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(
      new Date(ms),
    );

  const desfase = desfaseEntre(puntos, evaluada);

  return (
    <section className="vmw-oficial" aria-label={t("historico.tasaTitulo", { moneda })}>
      <div className="vmw-oficial__cabecera">
        <h3 className="vmw-oficial__titulo">
          {t("historico.tasaTitulo", { moneda })}
        </h3>
        <span className="vmw-oficial__bajada">
          {parte === null
            ? t("historico.oficialSinBrecha")
            : t("historico.oficialBajada", {
                pct: formatDecimal(String(parte), { maxDecimales: 1, idioma }),
              })}
        </span>
        {ultimo !== null && (
          <span className="vmw-oficial__resumen">
            {t("historico.oficialResumen", {
              valor: formatDecimal(ultimo.valor, { maxDecimales: 2, idioma }),
              moneda,
              fecha: fecha(ultimo.t),
            })}
          </span>
        )}
      </div>

      {puntos.length === 0 ? (
        <SinDatosGrafico
          titulo={t("historico.vacioOficial")}
          serie={`${moneda}/VES`}
          desde={Date.now() - dias * 86_400_000}
          alto={140}
          idioma={idioma}
        />
      ) : (
        <>
          {/* El MISMO componente que la serie evaluada, con casi todo
              apagado: sin banda, sin mediana, sin umbral, sin marca de hoy y
              sin eje de valores. Solo área y trazo. Que la diferencia sean
              flags y no otra implementación es el objetivo del refactor. */}
          <SerieTemporal
            puntos={puntos}
            color="var(--teal)"
            alto={140}
            formato={(v) => formatDecimal(v, { maxDecimales: 2, idioma })}
            unidad="VES"
            dias={dias}
            idioma={idioma}
            etiqueta={t("historico.tasaTitulo", { moneda })}
            area
            tooltip
          />

          {/* Las dos series se leen juntas: si terminan en días distintos,
              comparar sus extremos a ojo induce a error. El caso normal aquí es
              el fin de semana sin publicación del BCV, así que el aviso es una
              nota y no una alarma. */}
          {desfase !== null && (
            <p className="vmw-oficial__desfase">
              {t(
                desfase.oficialAtrasada
                  ? "historico.desfaseOficial"
                  : "historico.desfaseSerie",
                {
                  atrasada: fecha(desfase.atrasada),
                  adelantada: fecha(desfase.adelantada),
                  dias: String(desfase.dias),
                },
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
