import { Pill } from "../ds/components";
import { useI18n } from "../i18n/contexto";
import { formatDecimal, formatPct, restarDecimales, signo } from "../lib/decimal";
import { relativo } from "../lib/freshness";
import { VET_OFFSET_MIN } from "../lib/intradia";
import {
  areaPolilinea,
  escalaComun,
  extremos,
  extremosConHora,
  marcasEjeY,
  puntosPolilinea,
} from "../lib/series";
import { useMarket } from "../state/marketStore";
import { useHistorialBrecha } from "../state/useHistorialBrecha";
import { NoDataState } from "./NoDataState";

/**
 * La brecha de hoy contra su media de 7 días, del lado COMPRA — el mismo lado
 * que la cifra héroe, o el número de abajo contradiría al de arriba.
 *
 * Sale de `gap_history`, ya calculado por el motor; el SPA solo resta. Si la
 * ventana no está completa se rotula el tramo real, igual que la descomposición.
 */
function deltaContra7Dias(
  analisis: ReturnType<typeof useMarket>["analisis"],
  hoy: string | null,
): { delta: string; completa: boolean; diasCubiertos: number } | null {
  if (hoy === null) {
    return null;
  }
  const lado = analisis?.gap_history?.sides.find((s) => s.side === "buy");
  const ref = lado?.references.find((r) => r.days_configured === 7);
  if (ref?.mean == null) {
    return null;
  }
  return {
    delta: restarDecimales(hoy, ref.mean),
    completa: ref.days_covered >= ref.days_configured,
    diasCubiertos: ref.days_covered,
  };
}

const ANCHO = 640;
const ALTO = 110;
const BUCKETS_24H = 24;

/**
 * Titular del tablero: la brecha BCV↔P2P como cifra héroe con su contexto de
 * 24 h (diseño «Rediseño dashboard Higerotech»). La sparkline sale de
 * `/indicators/history` — es dato real, no decorado; si no hay serie, se dice.
 */
export function GapPanel() {
  const { t, idioma } = useI18n();
  const { indicadores, tasas, p2p, analisis } = useMarket();
  // Las DOS series: la de compra es la del titular y la cifra héroe; la de
  // venta es la que tiene historia real (242 días derivados) y es, además, el
  // lado donde el usuario compra dólares. El hook comparte la petición si otro
  // componente ya pidió el mismo lado.
  const { horario: compra, cargando } = useHistorialBrecha("buy");
  const { horario: venta } = useHistorialBrecha("sell");

  if (indicadores === null) {
    return (
      <section className="vmw-hero" aria-label={t("brecha.titulo")}>
        <div className="vmw-eyebrow">{t("brecha.titulo")}</div>
        <NoDataState detalle={t("brecha.sinIndicadores")} />
      </section>
    );
  }

  const { gap_pct, gap_abs, spread_pct, official_stale } = indicadores;
  const contra7 = deltaContra7Dias(analisis, gap_pct ?? null);
  const ventanaCompra = compra.slice(-BUCKETS_24H);
  const ventanaVenta = venta.slice(-BUCKETS_24H);

  // Escala COMPARTIDA: sin ella cada polilínea usa sus propios extremos y las
  // dos líneas se vuelven engañosas — la de venta, más baja, podría dibujarse
  // por encima de la de compra.
  const escala = escalaComun(ventanaCompra, ventanaVenta);
  const lineaCompra = puntosPolilinea(ventanaCompra, ANCHO, ALTO, 8, escala);
  const lineaVenta = puntosPolilinea(ventanaVenta, ANCHO, ALTO, 8, escala);
  const rangoVenta = extremos(ventanaVenta);
  const horasCompra = extremosConHora(ventanaCompra);
  const oficialUsd = tasas["USD"];

  return (
    // El halo teal desborda por la esquina superior derecha y lo recorta el
    // `overflow: hidden` de la tarjeta. Es un ACENTO sobre fondo neutro, no un
    // tinte de superficie: el fondo teñido sigue siendo exclusivo de «Lectura de
    // hoy», y por eso este halo va más flojo (13 % contra el 14 % de aquella).
    <section className="vmw-hero vmw-rector" aria-label={t("brecha.titulo")}>
      <div className="vmw-rector__halo" aria-hidden="true" />
      <div className="vmw-eyebrow">
        <span>{t("brecha.titulo")}</span>
        {official_stale ? (
          <span className="vmw-badge vmw-badge--alerta">
            {t("brecha.oficialStale")}
          </span>
        ) : null}
        <Pill tone="cielo">
          {(() => {
            const { clave, n } = relativo(indicadores.as_of);
            return t(clave, { n });
          })()}
        </Pill>
      </div>

      {gap_pct === null || gap_pct === undefined ? (
        <NoDataState detalle={t("brecha.sinSnapshot")} />
      ) : (
        <div className="vmw-hero__fila">
          <div className="vmw-cifra vmw-hero__cifra">
            {formatPct(gap_pct, 2, idioma)}
          </div>
          {/* Alineado a la LÍNEA DE BASE de la cifra, no a su caja: con una cifra
              de 78 px cualquier otro anclaje deja el texto flotando. */}
          <div className="vmw-hero__contexto">
            <div className="vmw-hero__equivalente">
              {gap_abs !== null && gap_abs !== undefined
                ? t("brecha.sobreOficial", {
                    valor: formatDecimal(gap_abs, {
                      maxDecimales: 2,
                      idioma,
                    }),
                  })
                : "—"}
            </div>
            {contra7 !== null && (
              /* Salvia si la brecha comprime, coral si abre. El signo va escrito
                 en el propio número, así que el color refuerza y no codifica
                 solo. */
              <div
                className="vmw-hero__contra"
                data-sentido={
                  signo(contra7.delta) < 0 ? "comprime" : "abre"
                }
              >
                {t(
                  contra7.completa
                    ? "brecha.contra7"
                    : "brecha.contra7Parcial",
                  {
                    delta: formatDecimal(contra7.delta, {
                      maxDecimales: 2,
                      idioma,
                    }),
                    dias: String(contra7.diasCubiertos),
                  },
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ marginTop: "22px" }}>
        {lineaCompra === "" && lineaVenta === "" ? (
          <NoDataState
            detalle={cargando ? t("generico.cargando") : t("brecha.sinSerie")}
          />
        ) : (
          <div className="vmw-spark__marco">
            {/* El eje va FUERA del SVG: el gráfico usa
                `preserveAspectRatio="none"` para estirarse al ancho de la
                tarjeta, y cualquier texto dentro saldría deformado con él. */}
            {escala !== null && (
              <div className="vmw-spark__eje" aria-hidden="true">
                {marcasEjeY(escala).map((marca) => (
                  <span
                    key={marca.fraccion}
                    style={{ top: `${(marca.fraccion * 100).toFixed(1)}%` }}
                  >
                    {formatPct(marca.valor.toFixed(2), 2, idioma)}
                  </span>
                ))}
              </div>
            )}
            <svg
              viewBox={`0 0 ${ANCHO} ${ALTO}`}
              preserveAspectRatio="none"
              className="vmw-spark"
              role="img"
              aria-label={t("brecha.ventana24h")}
            >
              {/* Banda de rango: el tramo que la brecha ha ocupado en 24 h. */}
              {lineaCompra !== "" && (
                <polyline
                  points={areaPolilinea(lineaCompra, ANCHO, ALTO)}
                  fill="var(--banda-rango)"
                  stroke="none"
                />
              )}
              {/* Venta primero: va detrás, para que la de compra —la del
                  titular— quede encima si se cruzan.

                  En TEAL al 45 %, no en coral: el coral queda reservado para el
                  disparo. Las dos series se separan por LUMINOSIDAD (7,85:1
                  contra 2,82:1 sobre la tarjeta), que es lo que el daltonismo no
                  altera — medido ΔE 30-34 bajo protan/deutan, a la altura del par
                  teal/coral en protanopia. Y sigue discontinua: una tercera pista
                  que no depende del color en absoluto. */}
              {lineaVenta !== "" && (
                <polyline
                  points={lineaVenta}
                  fill="none"
                  stroke="var(--serie-venta-suave)"
                  strokeWidth="1.8"
                  strokeDasharray="5 4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {lineaCompra !== "" && (
                <polyline
                  points={lineaCompra}
                  fill="none"
                  stroke="var(--teal)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
            </svg>
            <div className="vmw-spark__pie">
              <span>{t("brecha.ventana24h")}</span>
              {/* Mín y máx CON SU HORA: un mínimo de las 03:00 y uno de hace diez
                  minutos dicen cosas distintas, y el valor solo no lo distingue. */}
              {horasCompra !== null && (
                <>
                  <span className="vmw-spark__serie vmw-spark__serie--compra">
                    {t("brecha.minAlas", {
                      valor: formatPct(horasCompra.min.valor, 2, idioma),
                      hora: horaVET(horasCompra.min.t),
                    })}
                  </span>
                  <span>
                    {t("brecha.maxAlas", {
                      valor: formatPct(horasCompra.max.valor, 2, idioma),
                      hora: horaVET(horasCompra.max.t),
                    })}
                  </span>
                </>
              )}
              {rangoVenta !== null ? (
                <span className="vmw-spark__serie vmw-spark__serie--venta">
                  {t("brecha.rangoVenta", {
                    min: formatPct(rangoVenta.min, 2, idioma),
                    max: formatPct(rangoVenta.max, 2, idioma),
                  })}
                </span>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <div className="vmw-hero__pie">
        <span>
          {t("brecha.spread", {
            valor:
              spread_pct !== null && spread_pct !== undefined
                ? formatPct(spread_pct, 2, idioma)
                : "—",
          })}
        </span>
        {oficialUsd !== undefined ? (
          <span>
            {t("brecha.oficialPar", {
              valor: formatDecimal(oficialUsd.rate, {
                maxDecimales: 4,
                idioma,
              }),
            })}
          </span>
        ) : null}
        {p2p.buy !== undefined ? (
          <span>
            {t("brecha.vwap", {
              valor: formatDecimal(p2p.buy.vwap, { maxDecimales: 2, idioma }),
            })}
          </span>
        ) : null}
      </div>
    </section>
  );
}

/** La hora del instante en Venezuela, «14:32». Se desplaza y se lee en UTC —el
 *  mismo criterio que la parrilla del mapa de calor— para no depender de que el
 *  runtime traiga la base de zonas IANA. */
function horaVET(t: number): string {
  const enVET = new Date(t + VET_OFFSET_MIN * 60_000);
  const hh = String(enVET.getUTCHours()).padStart(2, "0");
  const mm = String(enVET.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
