/**
 * «Qué se movió desde la apertura» — las cuatro series que explican la sesión.
 *
 * Cuáles son NO se cablea: sale de `movimientosDeSesion`, que ordena por el
 * movimiento medido en desviaciones típicas de la propia serie (ver ese módulo
 * para el criterio y sus casos límite). Aquí solo se pinta.
 *
 * La nota de cada tarjeta dice qué implica el movimiento con la misma
 * convención que ya usa el dashboard para la brecha (`data-sentido`): abrirse
 * es adverso, comprimir no. Donde el proyecto no tiene una lectura establecida
 * —momentum, mediana, ratio— la tarjeta va con hairline y la nota se limita a
 * la magnitud: describir es el trabajo, insinuar no.
 */

import type { Clave } from "../i18n/dict";
import { useI18n, type Traducir } from "../i18n/contexto";
import { formatDecimal } from "../lib/decimal";
import { ladoDe, presentacionDe, type PuntoIntradia } from "../lib/intradia";
import {
  areaSparkline,
  fueraDeRango,
  movimientosDeSesion,
  sentidoDelMovimiento,
  signoTexto,
  trazoSparkline,
  type MovimientoSerie,
} from "../lib/movimiento";

/** Tarjetas de la rejilla. Cuatro: caben en una fila cómoda y obligan a que la
 *  selección signifique algo. */
const TARJETAS = 4;
const ANCHO = 160;
const ALTO = 44;

const COLOR_LADO = {
  compra: "var(--series-buy)",
  venta: "var(--series-sell)",
  "sin-lado": "var(--series-aqua)",
} as const;

const CLAVE_LADO = {
  compra: "intradia.ladoCompra",
  venta: "intradia.ladoVenta",
  "sin-lado": "intradia.ladoSinLado",
} as const satisfies Record<string, Clave>;

/** Familias con lectura establecida: la nota puede decir qué implica. Para el
 *  resto solo se dice la magnitud. */
const CLAVE_NOTA: Record<string, { sube: Clave; baja: Clave }> = {
  p2p_brecha_abs: { sube: "movio.brechaAbre", baja: "movio.brechaComprime" },
  p2p_brecha_pct: { sube: "movio.brechaAbre", baja: "movio.brechaComprime" },
  p2p_liquidez: { sube: "movio.liquidezSube", baja: "movio.liquidezBaja" },
  p2p_spread: { sube: "movio.spreadSube", baja: "movio.spreadBaja" },
  p2p_spread_pct: { sube: "movio.spreadSube", baja: "movio.spreadBaja" },
  p2p_outliers_pct: { sube: "movio.outliersSube", baja: "movio.outliersBaja" },
};

export function SessionMovers({
  sesion,
  historia,
}: {
  sesion: Map<string, PuntoIntradia[]>;
  /** Los mismos indicadores en la ventana de 7 días, para normalizar. */
  historia: Map<string, PuntoIntradia[]>;
}) {
  const { t } = useI18n();
  const movimientos = movimientosDeSesion(sesion, historia);
  if (movimientos.length === 0) {
    return null;
  }
  const destacados = movimientos.slice(0, TARJETAS);
  const resto = movimientos.slice(TARJETAS);
  const inquietas = fueraDeRango(resto);

  return (
    <section className="vmw-seccion" aria-label={t("movio.titulo")}>
      <div className="vmw-seccion__cabecera">
        <h3 className="vmw-movio__titulo">{t("movio.titulo")}</h3>
        {/* La segunda mitad se CALCULA: afirmar que el resto se mantuvo dentro
            de su rango sin haberlo mirado sería una afirmación gratuita, y el
            día que no sea cierta nadie se enteraría. */}
        <span className="vmw-movio__bajada">
          {t("movio.bajada", {
            destacadas: destacados.length,
            totales: movimientos.length,
          })}
          {" · "}
          {inquietas === 0
            ? t("movio.restoNormal")
            : t("movio.restoInquieto", { n: inquietas })}
        </span>
      </div>
      <div className="vmw-movio__rejilla">
        {destacados.map((movimiento) => (
          <Tarjeta key={movimiento.indicador} movimiento={movimiento} />
        ))}
      </div>
    </section>
  );
}

function Tarjeta({ movimiento }: { movimiento: MovimientoSerie }) {
  const { t, idioma } = useI18n();
  const { etiqueta, unidad, decimales } = presentacionDe(movimiento.indicador);
  const lado = ladoDe(movimiento.indicador);
  const adverso = sentidoDelMovimiento(movimiento.indicador, movimiento.deltaAbs);
  const num = (v: string, d = decimales) =>
    formatDecimal(v, { maxDecimales: d, idioma });
  const signo = signoTexto(movimiento.deltaAbs);
  const trazo = trazoSparkline(movimiento.puntos, ANCHO, ALTO);

  return (
    <article
      className="vmw-movio__tarjeta"
      data-adverso={adverso === true ? "si" : "no"}
    >
      <div className="vmw-movio__cabecera-tarjeta">
        <span className="vmw-movio__metrica">
          {etiqueta}
          {unidad !== "" ? ` · ${unidad}` : ""}
        </span>
        <span
          className="vmw-movio__lado"
          style={{ color: COLOR_LADO[lado], borderColor: COLOR_LADO[lado] }}
        >
          {t(CLAVE_LADO[lado])}
        </span>
      </div>

      <p className="vmw-movio__cifra-fila">
        <span className="vmw-movio__cifra">{num(movimiento.ultimo)}</span>
        <span className="vmw-movio__delta">
          {signo}
          {num(movimiento.deltaAbs)}
          {movimiento.deltaPct !== null
            ? ` (${signo}${num(movimiento.deltaPct, 2)} %)`
            : ""}
        </span>
      </p>

      <svg
        className="vmw-movio__spark"
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t("movio.descripcionSpark", {
          etiqueta,
          apertura: num(movimiento.apertura),
          ultimo: num(movimiento.ultimo),
        })}
      >
        <polyline
          points={areaSparkline(trazo, ANCHO, ALTO)}
          fill={adverso === true ? "var(--coral-tint)" : "var(--teal-tint)"}
          stroke="none"
        />
        <polyline
          points={trazo}
          fill="none"
          stroke={adverso === true ? "var(--coral)" : "var(--teal)"}
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

      <div className="vmw-movio__pie">
        <span>{t("movio.apertura", { valor: num(movimiento.apertura) })}</span>
        <span>{t("movio.ahora")}</span>
      </div>

      <p className="vmw-movio__nota">{nota(movimiento, t, idioma)}</p>
    </article>
  );
}

/**
 * Qué implica el movimiento. Dos piezas: la magnitud —siempre, porque es lo que
 * justifica que esta serie esté en la rejilla— y la lectura de la familia,
 * solo donde el proyecto ya tiene una.
 */
function nota(
  movimiento: MovimientoSerie,
  t: Traducir,
  idioma: "es" | "en",
): string {
  const magnitud =
    movimiento.z === Infinity
      ? t("movio.magnitudQuieta")
      : t("movio.magnitud", {
          veces: formatDecimal(movimiento.z.toFixed(1), {
            maxDecimales: 1,
            idioma,
          }),
        });

  const base = movimiento.indicador.replace(/_(buy|sell)$/, "");
  const claves = CLAVE_NOTA[base];
  if (claves === undefined) {
    return magnitud;
  }
  const sube = signoTexto(movimiento.deltaAbs) === "+";
  return `${t(sube ? claves.sube : claves.baja)} ${magnitud}`;
}
