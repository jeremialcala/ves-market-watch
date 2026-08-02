import type { CSSProperties } from "react";

import type { Analisis } from "../api/endpoints";
import { Stat } from "../ds/components";
import type { Clave } from "../i18n/dict";
import { useI18n } from "../i18n/contexto";
import { formatDecimal, formatPct } from "../lib/decimal";
import { relativo } from "../lib/freshness";
import { useMarket } from "../state/marketStore";

/**
 * «Lectura de hoy»: qué está haciendo el mercado, en lenguaje llano.
 *
 * TODO lo que se pinta sale de `analisis.reading` (RF-7, ADR-0021): el titular
 * es un régimen clasificado por umbrales de config versionada, y cada frase
 * corresponde a una afirmación codificada que emite el motor, EN SU ORDEN. El
 * SPA solo redacta.
 *
 * La frontera importa tanto como el contenido: la tarjeta describe el presente
 * y **no aconseja**. Lo único que orienta va en condicional («si tienes que
 * comprar…»), y el pie de aclaración no se retira por limpieza visual.
 */
export function MarketRegimeCard() {
  const { t } = useI18n();
  const { analisis } = useMarket();

  return (
    <section className="vmw-hero vmw-veredicto" aria-label={t("regimen.titulo")}>
      <div className="vmw-hero__brillo" aria-hidden="true" />
      <div className="vmw-eyebrow">
        <span>{t("regimen.titulo")}</span>
      </div>
      <Lectura analisis={analisis} />
    </section>
  );
}

/**
 * Los dos indicadores que acompañan al titular.
 *
 * Salen de la tarjeta de régimen y viven aparte porque el titular pasó a ocupar
 * todo el ancho: son contexto de un vistazo, no parte de la lectura.
 */
export function HeadlineStats() {
  const { t, idioma } = useI18n();
  const { vigentes, analisis } = useMarket();
  const ratio = valorVigente(vigentes, analisis, "p2p_ratio_oferta_demanda");
  const outliers = valorVigente(vigentes, analisis, "p2p_outliers_pct_buy");

  return (
    <div style={{ display: "grid", gap: "18px" }}>

      <div className="vmw-grid" style={{ "--min": "180px" } as CSSProperties}>
        <div className="vmw-tarjeta--sm vmw-tarjeta">
          <div className="vmw-eyebrow">{t("micro.outliers")}</div>
          <Stat
            tone="sage"
            style={{ marginTop: "10px" }}
            value={
              outliers !== undefined
                ? formatPct(outliers.value, 2, idioma)
                : "—"
            }
            label={t("micro.outliersNota")}
          />
        </div>
        <div className="vmw-tarjeta--sm vmw-tarjeta">
          <div className="vmw-eyebrow">{t("micro.ratio")}</div>
          <Stat
            tone="teal"
            style={{ marginTop: "10px" }}
            value={
              ratio !== undefined
                ? formatDecimal(ratio.value, { maxDecimales: 2, idioma })
                : "—"
            }
            label={t("micro.ratioNota")}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * El valor vigente de un indicador, del push o —si aún no ha llegado— del
 * análisis del resync.
 *
 * `vigentes` solo lo rellena el push WSS, así que en cada carga estos dos
 * indicadores salían en blanco hasta el primer evento (~30 s) teniendo el dato
 * ya en mano: el análisis del resync publica los mismos indicadores de la misma
 * revisión. No es un valor distinto ni más viejo — es el mismo, por el otro
 * camino.
 */
function valorVigente(
  vigentes: Record<string, { value: string } | undefined>,
  analisis: Analisis | null,
  indicador: string,
): { value: string } | undefined {
  return (
    vigentes[indicador] ??
    analisis?.indicators.find((i) => i.indicator === indicador)
  );
}

function Lectura({ analisis }: { analisis: Analisis | null }) {
  const { t, idioma } = useI18n();
  const lectura = analisis?.reading;

  if (analisis === null || lectura === undefined) {
    return (
      <p className="vmw-nota" style={{ marginTop: "12px" }}>
        {t("regimen.sinLectura")}
      </p>
    );
  }

  const fmt = (v: string) => formatDecimal(v, { maxDecimales: 2, idioma });

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginTop: "12px",
        }}
      >
        <span aria-hidden="true" className="vmw-regimen__punto" />
        <span
          className="vmw-cifra"
          style={{ fontSize: "clamp(24px, 3.4vw, 34px)" }}
        >
          {lectura.regime !== null
            ? t(`regimen.${lectura.regime}` as Clave)
            : t("regimen.sinRegimen")}
        </span>
      </div>

      {/* Una frase por afirmación, en el orden que manda el motor: lo que
          invalida al resto va primero. */}
      <p className="vmw-nota" style={{ marginTop: "12px" }}>
        {lectura.claims.map((c) => fraseDe(c, t, fmt)).filter(Boolean).join(" ")}
      </p>

      <div className="vmw-regimen__chips">
        <Chip texto={t("regimen.chip.frescos", { cuando: cuando(analisis.as_of, t) })} />
        <Chip texto={t("regimen.chip.reglas", { n: analisis.summary.rules_met.length })} />
        <Chip
          tono={lectura.gauges_near_threshold > 0 ? "coral" : undefined}
          texto={
            lectura.gauges_near_threshold === 1
              ? t("regimen.chip.cercaUno")
              : t("regimen.chip.cerca", { n: lectura.gauges_near_threshold })
          }
        />
        <Chip
          tono={analisis.confidence === "low" ? "coral" : undefined}
          texto={t(
            analisis.confidence === "low"
              ? "regimen.chip.confianzaBaja"
              : "regimen.chip.confianzaNormal",
            { outliers: pctOutliers(analisis, idioma) },
          )}
        />
      </div>

      <p className="vmw-medidor__aclaracion">{t("regimen.aclaracion")}</p>
    </>
  );
}

type Traducir = (clave: Clave, params?: Record<string, string | number>) => string;
type Claim = NonNullable<Analisis["reading"]>["claims"][number];

/** Una frase por código. `""` para lo que no tiene frase propia — el motor puede
 *  añadir códigos antes de que el diccionario los cubra, y eso no debe romper. */
function fraseDe(claim: Claim, t: Traducir, fmt: (v: string) => string): string {
  const d = claim.data;
  switch (claim.code) {
    case "confianza_baja":
      return t("regimen.claim.confianzaBaja");
    case "oficial_rancia":
      return t("regimen.claim.oficialRancia");
    case "brecha":
      return t(`regimen.claim.brecha.${d.direccion}` as Clave, {
        delta: fmt(d.delta_pp ?? "0"),
        horas: d.horas ?? "",
      });
    case "atribucion":
      return t(`regimen.claim.atribucion.${d.responsable}` as Clave);
    case "medidor_en_banda":
      return t(`regimen.claim.banda.${d.banda}` as Clave, { dias: d.dias ?? "" });
    case "regla_cerca":
      return t("regimen.claim.reglaCerca", {
        regla: (d.regla ?? "").replaceAll("_", " "),
        cumplidas: d.cumplidas ?? "",
        totales: d.totales ?? "",
      });
    default:
      return "";
  }
}

function Chip({ texto, tono }: { texto: string; tono?: "coral" }) {
  return (
    <span className="vmw-regimen__chip" data-tono={tono}>
      <span aria-hidden="true" className="vmw-regimen__chipPunto" />
      {texto}
    </span>
  );
}

function cuando(asOf: string, t: Traducir): string {
  const { clave, n } = relativo(asOf);
  return t(clave as Clave, { n });
}

function pctOutliers(analisis: Analisis, idioma: "es" | "en"): string {
  const outliers = analisis.indicators.find(
    (i) => i.indicator === "p2p_outliers_pct_buy",
  );
  return outliers === undefined ? "—" : formatPct(outliers.value, 2, idioma);
}
