import type { CSSProperties } from "react";
import { useState } from "react";

import type { Senal } from "../api/endpoints";
import { useI18n } from "../i18n/contexto";
import { formatDecimal } from "../lib/decimal";
import { relativo } from "../lib/freshness";
import { useMarket } from "../state/marketStore";
import { NoDataState } from "./NoDataState";

const COLOR: Record<Senal["direction"], { color: string; tinte: string }> = {
  alcista: { color: "var(--teal)", tinte: "var(--teal-tint)" },
  bajista: { color: "var(--coral)", tinte: "var(--coral-tint)" },
  neutral: { color: "var(--text-dim)", tinte: "var(--overlay-soft)" },
};

function claveDe(senal: Senal): string {
  return `${senal.type}-${senal.emitted_at}`;
}

/**
 * Cronología de señales con la evidencia desplegable en línea (diseño
 * «Rediseño dashboard Higerotech»; antes era un modal). La evidencia completa
 * —regla versionada, insumos exactos y el evento que la disparó— sigue siendo
 * la trazabilidad de T10/ADR-0015.
 */
export function SignalsFeed() {
  const { t, idioma } = useI18n();
  const { senales } = useMarket();
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <section className="vmw-seccion" aria-label={t("senales.titulo")}>
      <div className="vmw-seccion__cabecera">
        <h3 className="vmw-seccion__titulo">{t("senales.titulo")}</h3>
        <span className="vmw-seccion__bajada">{t("senales.bajada")}</span>
      </div>
      <div className="vmw-tarjeta" style={{ padding: "8px 28px 26px" }}>
        {senales.length === 0 ? (
          <NoDataState detalle={t("senales.sinDatos")} />
        ) : (
          senales.map((senal) => {
            const clave = claveDe(senal);
            const expandida = abierta === clave;
            const { color, tinte } = COLOR[senal.direction];
            const { clave: claveTiempo, n } = relativo(senal.emitted_at);
            return (
              <div className="vmw-senal" key={clave}>
                <div className="vmw-senal__cuando">
                  {t(claveTiempo, { n })}
                </div>
                <div>
                  <button
                    type="button"
                    className="vmw-senal__boton"
                    aria-expanded={expandida}
                    title={
                      expandida ? t("senales.cerrar") : t("senales.abrir")
                    }
                    onClick={() => setAbierta(expandida ? null : clave)}
                  >
                    <span
                      aria-hidden="true"
                      className="vmw-senal__punto"
                      style={{ background: color }}
                    />
                    <span className="vmw-senal__tipo">
                      {senal.type.replaceAll("_", " ")}
                    </span>
                    <span
                      className="vmw-senal__direccion"
                      style={{ color, background: tinte }}
                    >
                      {senal.direction}
                    </span>
                    <span className="vmw-senal__regla">
                      {senal.evidence.rule}
                    </span>
                    <span className="vmw-nav__relleno" />
                    <span className="vmw-senal__regla" aria-hidden="true">
                      {expandida ? "−" : "+"}
                    </span>
                  </button>
                  {expandida ? (
                    <div className="vmw-evidencia">
                      <div className="vmw-eyebrow">
                        {t("senales.evidencia")}
                      </div>
                      <dl
                        className="vmw-grid"
                        style={
                          {
                            "--min": "150px",
                            marginTop: "12px",
                            gap: "16px",
                          } as CSSProperties
                        }
                      >
                        {Object.entries(senal.evidence.inputs).map(
                          ([indicador, valor]) => (
                            <div
                              className="vmw-evidencia__insumo"
                              key={indicador}
                            >
                              <dt>{indicador}</dt>
                              <dd>
                                {typeof valor === "string"
                                  ? formatDecimal(valor, {
                                      maxDecimales: 4,
                                      idioma,
                                    })
                                  : String(valor)}
                              </dd>
                            </div>
                          ),
                        )}
                      </dl>
                      <div
                        style={{
                          marginTop: "14px",
                          fontSize: "var(--fs-meta)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {t("senales.calcVersion", {
                          version: senal.calc_version,
                        })}{" "}
                        ·{" "}
                        {t("senales.disparadaPor", { id: senal.triggered_by })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
