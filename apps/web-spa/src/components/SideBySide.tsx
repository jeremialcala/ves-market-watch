/**
 * «Compra vs. venta, métrica por métrica».
 *
 * Sustituye a las dos parrillas separadas de compra y venta. La pregunta que
 * responde no es «cómo va la liquidez de venta» sino «en qué se diferencian los
 * dos lados», y para eso hay que poder recorrerlos con el ojo en la misma fila.
 *
 * Las filas se DERIVAN de las series, no se cablean: RF-7 promete que un
 * indicador nuevo del motor aparece sin tocar el front, y una lista fija de
 * ocho métricas rompería esa promesa en silencio. El orden sí es declarado —el
 * de `ORDEN`— con las desconocidas al final por nombre canónico.
 *
 * Sobre el color: en el resto de la vista codifica el LADO. Aquí el lado lo dice
 * la columna, así que el color queda libre para la dirección de la Δ. Como teal
 * y coral son los mismos tonos que encabezan las columnas, el signo va SIEMPRE
 * escrito: quien lea el número no depende de distinguir para qué se está usando
 * el tono en esa celda.
 */

import type { Clave } from "../i18n/dict";
import { useI18n } from "../i18n/contexto";
import { NombreSerie } from "./NombreSerie";
import {
  presentacionDe,
  resumenIntradia,
  type PuntoIntradia,
} from "../lib/intradia";
import { formatearDelta, valorConUnidad } from "../lib/delta";
import { areaSparkline, trazoSparkline } from "../lib/movimiento";

const ANCHO = 96;
const ALTO = 34;

/** Orden de lectura: primero lo que la vista principal destaca. */
const ORDEN = [
  "p2p_brecha_abs",
  "p2p_brecha_pct",
  "p2p_liquidez",
  "p2p_mediana",
  "p2p_mejor_precio",
  "p2p_merchants_pct",
  "p2p_outliers_pct",
  "p2p_vwap",
];

/**
 * Notas de contexto. Solo donde comparar los dos lados exige saber algo que la
 * fila no dice por sí sola; el resto de métricas no llevan nota, porque una
 * explicación en cada fila deja de leerse.
 */
const NOTA: Record<string, Clave> = {
  p2p_brecha_abs: "vs.notaBrecha",
  p2p_brecha_pct: "vs.notaBrecha",
  p2p_mejor_precio: "vs.notaMejorPrecio",
  p2p_outliers_pct: "vs.notaOutliers",
};

export function SideBySide({
  series,
}: {
  series: Map<string, PuntoIntradia[]>;
}) {
  const { t } = useI18n();
  const bases = basesConLado(series);
  if (bases.length === 0) {
    return null;
  }

  return (
    <section className="vmw-seccion" aria-label={t("vs.titulo")}>
      <div className="vmw-seccion__cabecera">
        <h3 className="vmw-movio__titulo">{t("vs.titulo")}</h3>
        <span className="vmw-movio__bajada">{t("vs.bajada")}</span>
      </div>
      <div className="vmw-vs">
        <div className="vmw-vs__tabla">
          <div className="vmw-vs__cabecera">
            <span>{t("vs.colMetrica")}</span>
            <span className="vmw-vs__col-compra">{t("vs.colCompra")}</span>
            <span className="vmw-vs__col-venta">{t("vs.colVenta")}</span>
          </div>
          {bases.map((base) => (
            <Fila key={base} base={base} series={series} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Fila({
  base,
  series,
}: {
  base: string;
  series: Map<string, PuntoIntradia[]>;
}) {
  const { t } = useI18n();
  const nota = NOTA[base];

  return (
    <div className="vmw-vs__fila">
      <div className="vmw-vs__metrica">
        {/* Etiqueta y clave del catalogo comun: la fila nombra la serie igual
            que la tarjeta de movers y que la cronologia. */}
        <NombreSerie
          indicador={base}
          claseEtiqueta="vmw-vs__nombre"
          claseClave="vmw-vs__clave"
        />
      </div>
      <Celda indicador={`${base}_buy`} series={series} />
      <Celda indicador={`${base}_sell`} series={series} />
      {nota !== undefined && <p className="vmw-vs__nota">{t(nota)}</p>}
    </div>
  );
}

function Celda({
  indicador,
  series,
}: {
  indicador: string;
  series: Map<string, PuntoIntradia[]>;
}) {
  const { t, idioma } = useI18n();
  const { unidad, decimales } = presentacionDe(indicador);
  const puntos = series.get(indicador) ?? [];
  const resumen = resumenIntradia(puntos);

  if (resumen === null) {
    // Un lado sin serie se dice; no se rellena con el del otro lado ni con un
    // cero, que se leería como «no se movió».
    return <div className="vmw-vs__celda vmw-vs__celda--vacia">{t("vs.sinLado")}</div>;
  }

  const num = (v: string) => valorConUnidad(v, { unidad, decimales, idioma });
  const delta = formatearDelta(resumen, {
    unidad,
    decimales,
    idioma,
    sinCambio: t("delta.sinCambio"),
  });
  const clave = String(resumen.direccion) as "-1" | "0" | "1";
  const trazo = trazoSparkline(puntos, ANCHO, ALTO, 3);

  return (
    <div className="vmw-vs__celda">
      <div className="vmw-vs__cifras">
        <span className="vmw-vs__valor">{num(resumen.ultimo)}</span>
        {/* El signo va escrito SIEMPRE: el color de dirección comparte tonos con
            las cabeceras de lado, así que no puede ser la única pista. */}
        <span className="vmw-vs__delta" style={{ color: delta.color }}>
          {delta.texto}
        </span>
        <span className="vmw-vs__apertura">
          {t("vs.apertura", { valor: num(resumen.apertura) })}
        </span>
      </div>
      <svg
        className="vmw-vs__spark"
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t("vs.descripcionSpark", {
          apertura: num(resumen.apertura),
          ultimo: num(resumen.ultimo),
        })}
      >
        <polyline
          points={areaSparkline(trazo, ANCHO, ALTO)}
          fill={clave === "1" ? "var(--teal-tint)" : "var(--coral-tint)"}
          stroke="none"
        />
        <polyline
          points={trazo}
          fill="none"
          stroke={delta.color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

/**
 * Bases con al menos un lado presente, en el orden declarado y las desconocidas
 * al final. Derivar en vez de cablear es lo que sostiene la promesa de RF-7.
 */
function basesConLado(series: Map<string, PuntoIntradia[]>): string[] {
  const bases = new Set<string>();
  for (const nombre of series.keys()) {
    if (nombre.endsWith("_buy") || nombre.endsWith("_sell")) {
      bases.add(nombre.replace(/_(buy|sell)$/, ""));
    }
  }
  return [...bases].sort((a, b) => {
    const ia = ORDEN.indexOf(a);
    const ib = ORDEN.indexOf(b);
    if (ia === -1 && ib === -1) {
      return a.localeCompare(b);
    }
    if (ia === -1) {
      return 1;
    }
    if (ib === -1) {
      return -1;
    }
    return ia - ib;
  });
}
