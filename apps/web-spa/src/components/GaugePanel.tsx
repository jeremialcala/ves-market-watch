import type { CSSProperties } from "react";

import type { Clave } from "../i18n/dict";
import { useI18n } from "../i18n/contexto";
import { formatDecimal, formatPct } from "../lib/decimal";
import { useMarket } from "../state/marketStore";
import { DemoBadge } from "./DemoBadge";

interface Medidor {
  indicador: string;
  etiqueta: Clave;
  pct: boolean;
  /** Escala, relleno, umbral y nota: TODO esto es de ejemplo (ver abajo). */
  demo: { escala: Clave; relleno: string; umbral: string; nota: Clave };
  color: string;
}

const MEDIDORES: readonly Medidor[] = [
  {
    indicador: "p2p_brecha_pct_buy",
    etiqueta: "medidores.brecha",
    pct: true,
    demo: {
      escala: "medidores.brechaEscala",
      relleno: "38%",
      umbral: "70%",
      nota: "medidores.brechaNota",
    },
    color: "var(--teal)",
  },
  {
    indicador: "p2p_spread_pct",
    etiqueta: "micro.spread",
    pct: true,
    demo: {
      escala: "medidores.spreadEscala",
      relleno: "22%",
      umbral: "18%",
      nota: "medidores.spreadNota",
    },
    color: "var(--sage)",
  },
  {
    indicador: "p2p_ratio_oferta_demanda",
    etiqueta: "micro.ratio",
    pct: false,
    demo: {
      escala: "medidores.ratioEscala",
      relleno: "45%",
      umbral: "80%",
      nota: "medidores.ratioNota",
    },
    color: "var(--sage)",
  },
  {
    indicador: "p2p_momentum_bid_3h_pct",
    etiqueta: "micro.momentum",
    pct: true,
    demo: {
      escala: "medidores.momentumEscala",
      relleno: "28%",
      umbral: "52%",
      nota: "medidores.momentumNota",
    },
    color: "var(--teal)",
  },
  {
    indicador: "p2p_drenaje_oferta_6h_pct",
    etiqueta: "micro.drenaje",
    pct: true,
    demo: {
      escala: "medidores.drenajeEscala",
      relleno: "76%",
      umbral: "20%",
      nota: "medidores.drenajeNota",
    },
    color: "var(--sage)",
  },
  {
    indicador: "p2p_outliers_pct_buy",
    etiqueta: "micro.outliers",
    pct: true,
    demo: {
      escala: "medidores.outliersEscala",
      relleno: "8%",
      umbral: "80%",
      nota: "medidores.outliersNota2",
    },
    color: "var(--sage)",
  },
];

/**
 * Panel de instrumentos del diseño.
 *
 * El VALOR de cada medidor es real (indicador vigente del store). La escala de
 * percentil, el relleno de la barra, la marca de umbral y la nota son DEMO: el
 * gateway no expone el ruleset ni los percentiles del backtest, así que no hay
 * de dónde sacarlos. Va un solo sello en la cabecera porque lo de ejemplo es la
 * misma cosa en los seis: su escala, no su lectura.
 */
export function GaugePanel() {
  const { t, idioma } = useI18n();
  const { vigentes } = useMarket();

  return (
    <section className="vmw-seccion" aria-label={t("medidores.titulo")}>
      <div className="vmw-tarjeta vmw-tarjeta--panel">
        <div className="vmw-eyebrow">
          <span className="vmw-seccion__titulo">{t("medidores.titulo")}</span>
          <DemoBadge />
        </div>
        <p className="vmw-nota" style={{ marginTop: "10px" }}>
          {t("medidores.bajada")}
        </p>
      </div>

      <div
        className="vmw-grid"
        style={{ "--min": "300px", marginTop: "18px" } as CSSProperties}
      >
        {MEDIDORES.map((medidor) => {
          const vigente = vigentes[medidor.indicador];
          return (
            <div className="vmw-tarjeta" key={medidor.indicador}>
              <div className="vmw-medidor__cabecera">
                <span className="vmw-eyebrow">{t(medidor.etiqueta)}</span>
                <span
                  style={{
                    fontSize: "var(--fs-caption)",
                    color: "var(--text-dim)",
                  }}
                >
                  {t(medidor.demo.escala)}
                </span>
              </div>
              <div className="vmw-cifra vmw-medidor__valor">
                {vigente === undefined
                  ? "—"
                  : medidor.pct
                    ? formatPct(vigente.value, 2, idioma)
                    : formatDecimal(vigente.value, {
                        maxDecimales: 2,
                        idioma,
                      })}
              </div>
              <div
                className="vmw-barra vmw-barra--con-umbral"
                style={{ marginTop: "14px" }}
              >
                <div
                  className="vmw-barra__relleno"
                  style={{
                    width: vigente === undefined ? "0%" : medidor.demo.relleno,
                    background: medidor.color,
                  }}
                />
                <div
                  className="vmw-barra__umbral"
                  style={{ left: medidor.demo.umbral }}
                />
              </div>
              <p className="vmw-nota" style={{ marginTop: "12px" }}>
                {vigente === undefined
                  ? t("medidores.sinValor")
                  : t(medidor.demo.nota)}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
