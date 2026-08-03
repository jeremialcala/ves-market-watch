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

interface Grupo {
  /** La regla VERSIONADA: es la identidad real del disparador. */
  regla: string;
  tipo: string;
  direccion: Senal["direction"];
  senales: Senal[];
}

/**
 * Agrupa por regla versionada y ordena por la emisión más reciente.
 *
 * Por `evidence.rule` y no por `type`: dos versiones de la misma regla son
 * disparadores DISTINTOS —umbrales distintos— y fundirlas contaría disparos de
 * criterios que no son el mismo. El título sigue mostrando el tipo, legible;
 * la versión va en el pie.
 */
function agrupar(senales: readonly Senal[]): Grupo[] {
  const grupos = new Map<string, Grupo>();
  for (const senal of senales) {
    const regla = senal.evidence.rule;
    const grupo = grupos.get(regla) ?? {
      regla,
      tipo: senal.type,
      direccion: senal.direction,
      senales: [],
    };
    grupo.senales.push(senal);
    grupos.set(regla, grupo);
  }
  for (const grupo of grupos.values()) {
    grupo.senales.sort((a, b) => b.emitted_at.localeCompare(a.emitted_at));
  }
  return [...grupos.values()].sort((a, b) =>
    b.senales[0].emitted_at.localeCompare(a.senales[0].emitted_at),
  );
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

  const grupos = agrupar(senales);

  return (
    <section className="vmw-seccion" aria-label={t("senales.titulo")}>
      <div className="vmw-seccion__cabecera">
        <h3 className="vmw-seccion__titulo">{t("senales.titulo")}</h3>
        <span className="vmw-seccion__bajada">{t("senales.bajada")}</span>
      </div>
      <div className="vmw-tarjeta" style={{ padding: "8px 28px 26px" }}>
        {grupos.length === 0 ? (
          <NoDataState detalle={t("senales.sinDatos")} />
        ) : (
          grupos.map((grupo) => {
            const expandida = abierta === grupo.regla;
            const { color, tinte } = COLOR[grupo.direccion];
            const ultima = relativo(grupo.senales[0].emitted_at);
            return (
              <div className="vmw-senal" key={grupo.regla}>
                <button
                  type="button"
                  className="vmw-senal__boton"
                  aria-expanded={expandida}
                  title={expandida ? t("senales.cerrar") : t("senales.abrir")}
                  onClick={() => setAbierta(expandida ? null : grupo.regla)}
                >
                  <span
                    aria-hidden="true"
                    className="vmw-senal__punto"
                    style={{ background: color }}
                  />
                  <span className="vmw-senal__tipo">
                    {grupo.tipo.replaceAll("_", " ")}
                  </span>
                  <span
                    className="vmw-senal__direccion"
                    style={{ color, background: tinte }}
                  >
                    {grupo.senales.length === 1
                      ? t("senales.disparoUno")
                      : t("senales.disparos", { n: grupo.senales.length })}
                  </span>
                  <span className="vmw-nav__relleno" />
                  <span className="vmw-senal__regla" aria-hidden="true">
                    {expandida ? "−" : "+"}
                  </span>
                </button>
                <div className="vmw-senal__pie">
                  {grupo.regla} ·{" "}
                  {t("senales.ultima", {
                    cuando: t(ultima.clave, { n: ultima.n }),
                  })}
                </div>

                {expandida ? (
                  <div className="vmw-evidencia">
                    {grupo.senales.map((senal) => {
                      const cuando = relativo(senal.emitted_at);
                      return (
                        <div key={claveDe(senal)} className="vmw-evidencia__una">
                          <div className="vmw-eyebrow">
                            {t(cuando.clave, { n: cuando.n })} ·{" "}
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
                          <div className="vmw-evidencia__traza">
                            {t("senales.calcVersion", {
                              version: senal.calc_version,
                            })}{" "}
                            ·{" "}
                            {t("senales.disparadaPor", {
                              id: senal.triggered_by,
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
