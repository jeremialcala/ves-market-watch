import type { CSSProperties } from "react";

import type { Clave } from "../i18n/dict";
import { useI18n } from "../i18n/contexto";
import {
  compararDecimales,
  formatDecimal,
  formatPct,
  promediarDecimales,
  toChartNumber,
} from "../lib/decimal";
import { extremos, porcentajeDeMaximo } from "../lib/series";
import { useMarket } from "../state/marketStore";
import { useHistorialBrecha } from "../state/useHistorialBrecha";
import { NoDataState } from "./NoDataState";

const DIA_MS = 86_400_000;

/**
 * Descomposición de la brecha + comparativas contra la historia.
 *
 * Ambas mitades son dato REAL:
 *  · la barra parte el precio P2P en «pierna oficial» + «brecha» usando la
 *    tasa oficial vigente y el VWAP de compra;
 *  · las comparativas salen de la serie diaria de 90 días (media exacta con
 *    BigInt, nunca float).
 */
export function GapDecomposition() {
  const { t, idioma } = useI18n();
  const { indicadores, tasas, p2p } = useMarket();
  const { diario, cargando } = useHistorialBrecha();

  const oficial = tasas["USD"];
  const vwapBuy = p2p.buy?.vwap;
  const gapPct = indicadores?.gap_pct ?? null;

  const anchoOficial =
    oficial !== undefined && vwapBuy !== undefined
      ? Math.min(
          100,
          Math.max(0, (toChartNumber(oficial.rate) / toChartNumber(vwapBuy)) * 100),
        )
      : null;

  const ahora = Date.now();
  const ventana = (dias: number) =>
    diario.filter((punto) => punto.t >= ahora - dias * DIA_MS).map((p) => p.valor);
  const media7 = promediarDecimales(ventana(7));
  const media30 = promediarDecimales(ventana(30));
  const maximo90 = extremos(diario)?.max ?? null;

  const filas: { etiqueta: Clave; valor: string | null; color: string }[] = [
    {
      etiqueta: "descomposicion.hoy",
      valor: gapPct ?? null,
      color: "var(--series-buy)",
    },
    { etiqueta: "descomposicion.promedio7", valor: media7, color: "var(--teal-dim)" },
    {
      etiqueta: "descomposicion.promedio30",
      valor: media30,
      color: "var(--text-dim)",
    },
    {
      etiqueta: "descomposicion.maximo90",
      valor: maximo90,
      color: "var(--series-sell)",
    },
  ];
  const referencia = filas
    .map((f) => f.valor)
    .filter((v): v is string => v !== null)
    .reduce<string | null>(
      (max, v) => (max === null || compararDecimales(v, max) === 1 ? v : max),
      null,
    );

  return (
    <section className="vmw-seccion" aria-label={t("descomposicion.titulo")}>
      <div className="vmw-seccion__cabecera">
        <h3 className="vmw-seccion__titulo">{t("descomposicion.titulo")}</h3>
        <span className="vmw-seccion__bajada">{t("descomposicion.bajada")}</span>
      </div>

      <div className="vmw-grid" style={{ "--min": "360px" } as CSSProperties}>
        <div className="vmw-tarjeta">
          {anchoOficial === null ? (
            <NoDataState detalle={t("descomposicion.sinPiernas")} />
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px 16px",
                  justifyContent: "space-between",
                  fontSize: "var(--fs-meta)",
                  color: "var(--text-muted)",
                }}
              >
                <span>
                  {t("brecha.oficialPar", {
                    valor: formatDecimal(oficial.rate, {
                      maxDecimales: 4,
                      idioma,
                    }),
                  })}
                </span>
                <span>
                  {t("brecha.vwap", {
                    valor: formatDecimal(vwapBuy, { maxDecimales: 2, idioma }),
                  })}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  height: "52px",
                  marginTop: "14px",
                  borderRadius: "var(--radius)",
                  overflow: "hidden",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    width: `${anchoOficial.toFixed(1)}%`,
                    background: "var(--teal-tint-strong)",
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: "16px",
                    fontSize: "var(--fs-meta)",
                    color: "var(--teal)",
                  }}
                >
                  {t("descomposicion.piernaOficial")}
                </div>
                <div
                  style={{
                    width: `${(100 - anchoOficial).toFixed(1)}%`,
                    background: "var(--coral-tint-strong)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "var(--fs-meta)",
                    color: "var(--coral)",
                  }}
                >
                  {t("descomposicion.brecha")}
                </div>
              </div>
              <p className="vmw-nota" style={{ marginTop: "20px" }}>
                {t("descomposicion.lectura")}
              </p>
            </>
          )}
        </div>

        <div className="vmw-tarjeta">
          <div className="vmw-eyebrow">{t("descomposicion.comparativas")}</div>
          {referencia === null ? (
            <NoDataState
              detalle={cargando ? t("generico.cargando") : t("brecha.sinSerie")}
            />
          ) : (
            <div style={{ display: "grid", gap: "14px", marginTop: "18px" }}>
              {filas.map((fila) => (
                <div key={fila.etiqueta}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "var(--fs-body-xs)",
                    }}
                  >
                    <span>{t(fila.etiqueta)}</span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {fila.valor === null
                        ? "—"
                        : formatPct(fila.valor, 2, idioma)}
                    </span>
                  </div>
                  <div className="vmw-barra" style={{ marginTop: "7px" }}>
                    <div
                      className="vmw-barra__relleno"
                      style={{
                        width:
                          fila.valor === null
                            ? "0%"
                            : porcentajeDeMaximo(fila.valor, referencia),
                        background: fila.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
