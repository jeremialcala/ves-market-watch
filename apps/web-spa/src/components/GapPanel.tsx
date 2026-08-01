import { Pill } from "../ds/components";
import { useI18n } from "../i18n/contexto";
import { formatDecimal, formatPct } from "../lib/decimal";
import { relativo, UMBRAL_P2P_MS } from "../lib/freshness";
import { areaPolilinea, extremos, puntosPolilinea } from "../lib/series";
import { useMarket } from "../state/marketStore";
import { useHistorialBrecha } from "../state/useHistorialBrecha";
import { FreshnessBadge } from "./FreshnessBadge";
import { NoDataState } from "./NoDataState";

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
  const { indicadores, tasas, p2p } = useMarket();
  const { horario, cargando } = useHistorialBrecha();

  if (indicadores === null) {
    return (
      <section className="vmw-hero" aria-label={t("brecha.titulo")}>
        <div className="vmw-eyebrow">{t("brecha.titulo")}</div>
        <NoDataState detalle={t("brecha.sinIndicadores")} />
      </section>
    );
  }

  const { gap_pct, gap_abs, spread_pct, official_stale } = indicadores;
  const ventana = horario.slice(-BUCKETS_24H);
  const linea = puntosPolilinea(ventana, ANCHO, ALTO, 8);
  const rango = extremos(ventana);
  const oficialUsd = tasas["USD"];

  return (
    <section className="vmw-hero" aria-label={t("brecha.titulo")}>
      <div className="vmw-hero__brillo" aria-hidden="true" />

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
          <div style={{ paddingBottom: "8px" }}>
            <div style={{ fontSize: "15px", color: "var(--text-muted)" }}>
              {gap_abs !== null && gap_abs !== undefined
                ? t("brecha.sobreOficial", {
                    valor: formatDecimal(gap_abs, {
                      maxDecimales: 2,
                      idioma,
                    }),
                  })
                : "—"}
            </div>
            <div style={{ marginTop: "6px" }}>
              <FreshnessBadge
                asOf={indicadores.as_of}
                umbralMs={UMBRAL_P2P_MS}
              />
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: "22px" }}>
        {linea === "" ? (
          <NoDataState
            detalle={cargando ? t("generico.cargando") : t("brecha.sinSerie")}
          />
        ) : (
          <>
            <svg
              viewBox={`0 0 ${ANCHO} ${ALTO}`}
              preserveAspectRatio="none"
              className="vmw-spark"
              role="img"
              aria-label={t("brecha.ventana24h")}
            >
              <polyline
                points={areaPolilinea(linea, ANCHO, ALTO)}
                fill="var(--teal-tint)"
                stroke="none"
              />
              <polyline
                points={linea}
                fill="none"
                stroke="var(--series-buy)"
                strokeWidth="2.2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
            <div className="vmw-spark__pie">
              <span>{t("brecha.ventana24h")}</span>
              {rango !== null ? (
                <span>
                  {t("brecha.minMax", {
                    min: formatPct(rango.min, 2, idioma),
                    max: formatPct(rango.max, 2, idioma),
                  })}
                </span>
              ) : null}
            </div>
          </>
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
