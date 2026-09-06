/**
 * «Lo que dice el histórico» — bloque rector de la vista de histórico.
 *
 * Hermano sage del panel de sesión (`SessionReading`, coral): misma
 * arquitectura —eyebrow, veredicto, prosa, anclas— porque dicen lo mismo sobre
 * cosas distintas, y quien conoce uno sabe leer el otro.
 *
 * **El veredicto se calcula de la ventana**, en `lib/lecturaHistorico`. Cambia
 * el rango, el indicador o el bucket y cambia el titular, porque se recalcula
 * sobre los puntos que hay delante. Un titular fijo sería decoración.
 *
 * Describe el presente y no lo anticipa (ADR-0021): dice dónde cae hoy dentro de
 * lo recorrido, nunca hacia dónde va ni qué hacer.
 *
 * Los cortes de zona son los mismos 10/90 que dibuja la banda del gráfico de
 * abajo: el titular y la imagen tienen que decir lo mismo.
 */

import { useI18n } from "../i18n/contexto";
import type { Idioma } from "../i18n/idioma";
import { formatDecimal } from "../lib/decimal";
import {
  colorDistancia,
  colorZona,
  leerHistorico,
  type Lectura,
} from "../lib/lecturaHistorico";
import type { CondicionDeIndicador } from "../lib/reglas";
import type { Punto } from "../lib/series";

const LOCALE: Record<Idioma, string> = { es: "es-VE", en: "en-US" };

function fecha(t: number, idioma: Idioma): string {
  return new Intl.DateTimeFormat(LOCALE[idioma], {
    day: "numeric",
    month: "short",
  }).format(new Date(t));
}

export function LecturaHistorico({
  puntos,
  condicion,
  indicador,
  dias,
  bucket,
  idioma,
}: {
  puntos: readonly Punto[];
  condicion: CondicionDeIndicador | null;
  indicador: string;
  dias: number;
  bucket: string;
  idioma: Idioma;
}) {
  const { t } = useI18n();
  const lectura = leerHistorico(puntos, condicion);

  if (lectura === null) {
    return null;
  }
  const num = (v: string) => formatDecimal(v, { maxDecimales: 4, idioma });

  return (
    <section className="vmw-lecthist" aria-label={t("lecthist.titulo")}>
      <div className="vmw-lecthist__fila1">
        <span className="vmw-lecthist__eyebrow">{t("lecthist.titulo")}</span>
        <span className="vmw-lecthist__ventana">
          {t("lecthist.ventana", {
            dias: String(dias),
            desde: fecha(lectura.desde, idioma),
            hasta: fecha(lectura.hasta, idioma),
            puntos: String(lectura.puntos),
            bucket,
          })}
        </span>
      </div>

      <h2 className="vmw-lecthist__veredicto">
        {t(`lecthist.veredicto.${lectura.zona}`, {
          indicador,
          percentil: String(lectura.percentil),
        })}
      </h2>

      <p className="vmw-lecthist__prosa">
        {t(`lecthist.prosa.${lectura.zona}`, {
          percentil: String(lectura.percentil),
          mediana: num(lectura.mediana),
          distancia: num(lectura.distancia),
        })}
      </p>

      <div className="vmw-lecthist__anclas">
        <Ancla
          nombre={t("lecthist.anclaPercentil")}
          valor={`P${lectura.percentil}`}
          color={colorZona(lectura.zona)}
          detalle={t(`lecthist.detallePercentil.${lectura.zona}`)}
        />
        <Ancla
          nombre={t("lecthist.anclaMediana")}
          valor={num(lectura.distancia)}
          color={colorDistancia(lectura.distancia)}
          detalle={t("lecthist.detalleMediana", { mediana: num(lectura.mediana) })}
        />
        <Ancla
          nombre={t("lecthist.anclaCruce")}
          {...anclaCruce(lectura, t)}
        />
      </div>
    </section>
  );
}

/**
 * El ancla del cruce tiene TRES estados y los tres dicen cosas distintas:
 * sin regla no hay umbral que cruzar; con regla y sin cruces la serie lleva
 * toda la ventana del mismo lado —que es información, no ausencia—; y con
 * cruce, cuántos días hace. Colapsarlos en un guion perdería lo del medio.
 */
function anclaCruce(
  lectura: Lectura,
  t: ReturnType<typeof useI18n>["t"],
): { valor: string; color: string; detalle: string } {
  if (!lectura.hayRegla) {
    return {
      valor: "—",
      color: "var(--text-muted)",
      detalle: t("lecthist.detalleCruceSinRegla"),
    };
  }
  if (lectura.sinCruces) {
    return {
      valor: "0",
      color: "var(--sage)",
      detalle: t("lecthist.detalleCruceNinguno"),
    };
  }
  return {
    valor: String(lectura.diasDesdeCruce),
    color: "var(--coral)",
    detalle: t("lecthist.detalleCruceDias"),
  };
}

function Ancla({
  nombre,
  valor,
  color,
  detalle,
}: {
  nombre: string;
  valor: string;
  color: string;
  detalle: string;
}) {
  return (
    <div className="vmw-lecthist__ancla">
      <span className="vmw-lecthist__ancla-nombre">{nombre}</span>
      <span className="vmw-lecthist__ancla-valor" style={{ color }}>
        {valor}
      </span>
      <span className="vmw-lecthist__ancla-detalle">{detalle}</span>
    </div>
  );
}
