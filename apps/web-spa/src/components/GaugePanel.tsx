import { useState, type CSSProperties } from "react";

import type {
  Analisis,
  Banda,
  LecturaMedidor,
} from "../api/endpoints";
import type { Clave } from "../i18n/dict";
import { useI18n } from "../i18n/contexto";
import { formatDecimal, formatPct, toChartNumber } from "../lib/decimal";
import { pctDesdeFraccion } from "../lib/escala";
import { useMarket } from "../state/marketStore";

interface Medidor {
  indicador: string;
  etiqueta: Clave;
  pct: boolean;
  /** Qué mide, en el desplegable. */
  definicion: Clave;
  /** Una frase por banda. Tipado sobre el enum GENERADO del contrato: si el
   *  engine añade una banda, esto deja de compilar en vez de callarse. */
  lectura: Record<Banda, Clave>;
  color: string;
}

/** El engine clasifica en vocabulario neutro de idioma; el diccionario del SPA
 *  redacta. Este mapa es la costura entre ambos. */
const CLAVE_BANDA: Record<Banda, string> = {
  very_low: "muyBajo",
  low: "bajo",
  high: "alto",
  very_high: "muyAlto",
  unscaled: "sinEscala",
};

function lecturasDe(base: string): Record<Banda, Clave> {
  return {
    very_low: `medidores.lectura.${base}.muyBajo` as Clave,
    low: `medidores.lectura.${base}.bajo` as Clave,
    high: `medidores.lectura.${base}.alto` as Clave,
    very_high: `medidores.lectura.${base}.muyAlto` as Clave,
    unscaled: `medidores.lectura.${base}.sinEscala` as Clave,
  };
}

const MEDIDORES: readonly Medidor[] = [
  {
    indicador: "p2p_brecha_pct_buy",
    etiqueta: "medidores.brecha",
    pct: true,
    definicion: "medidores.def.brecha",
    lectura: lecturasDe("brecha"),
    color: "var(--teal)",
  },
  {
    indicador: "p2p_spread_pct",
    etiqueta: "micro.spread",
    pct: true,
    definicion: "medidores.def.spread",
    lectura: lecturasDe("spread"),
    color: "var(--sage)",
  },
  {
    indicador: "p2p_ratio_oferta_demanda",
    etiqueta: "micro.ratio",
    pct: false,
    definicion: "medidores.def.ratio",
    lectura: lecturasDe("ratio"),
    color: "var(--sage)",
  },
  {
    indicador: "p2p_momentum_bid_3h_pct",
    etiqueta: "micro.momentum",
    pct: true,
    definicion: "medidores.def.momentum",
    lectura: lecturasDe("momentum"),
    color: "var(--teal)",
  },
  {
    indicador: "p2p_drenaje_oferta_6h_pct",
    etiqueta: "micro.drenaje",
    pct: true,
    definicion: "medidores.def.drenaje",
    lectura: lecturasDe("drenaje"),
    color: "var(--sage)",
  },
  {
    indicador: "p2p_outliers_pct_buy",
    etiqueta: "micro.outliers",
    pct: true,
    definicion: "medidores.def.outliers",
    lectura: lecturasDe("outliers"),
    color: "var(--sage)",
  },
];

const INDICADOR_OUTLIERS = "p2p_outliers_pct_buy";
const INDICADOR_BRECHA = "p2p_brecha_pct_buy";

/**
 * Panel de instrumentos: cada medidor con su valor, su lectura y a qué regla
 * alimenta.
 *
 * TODO lo que se pinta viene calculado del contrato `analysis.updated` (RF-6,
 * ADR-0019): la banda, la posición de la barra, la de cada umbral y cuánto
 * falta para cruzarlo. El SPA solo redacta la prosa ES/EN y convierte la
 * fracción a un ancho CSS. Cuando no hay análisis, o el medidor no tiene
 * lectura en esta revisión, se dice — no se dibuja nada a ojo.
 */
export function GaugePanel() {
  const { t } = useI18n();
  const { vigentes, analisis } = useMarket();
  const lecturas = new Map(
    (analisis?.indicators ?? []).map((i) => [i.indicator, i]),
  );

  // El orden deja de ser una constante y pasa a ser DATO: primero el medidor
  // más cerca de disparar un aviso, que es la pregunta que trae a esta vista.
  // Los que no tienen umbral que medir conservan su orden relativo (`sort` es
  // estable), así que la lista no baila sin motivo entre revisiones.
  const ordenados = [...MEDIDORES].sort((a, b) => {
    const da = distanciaAUmbral(lecturas.get(a.indicador));
    const db = distanciaAUmbral(lecturas.get(b.indicador));
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });

  return (
    <section className="vmw-seccion" aria-label={t("medidores.titulo")}>
      <div className="vmw-tarjeta vmw-tarjeta--panel">
        <div className="vmw-eyebrow">
          <span className="vmw-seccion__titulo">{t("medidores.titulo")}</span>
        </div>
        <p className="vmw-nota" style={{ marginTop: "10px" }}>
          {t("medidores.bajada")}
        </p>
        <SintesisPanel analisis={analisis} />
      </div>

      <div
        className="vmw-grid"
        style={{ "--min": "300px", marginTop: "18px" } as CSSProperties}
      >
        {ordenados.map((medidor) => (
          <MedidorTarjeta
            key={medidor.indicador}
            medidor={medidor}
            lectura={lecturas.get(medidor.indicador)}
            vigente={vigentes[medidor.indicador]}
            oficialStale={analisis?.official_stale ?? false}
          />
        ))}
      </div>
    </section>
  );
}

interface PropsMedidor {
  medidor: Medidor;
  lectura: LecturaMedidor | undefined;
  vigente: { value: string; as_of: string } | undefined;
  oficialStale: boolean;
}

function MedidorTarjeta({
  medidor,
  lectura,
  vigente,
  oficialStale,
}: PropsMedidor) {
  const { t, idioma } = useI18n();
  const [abierto, setAbierto] = useState(false);
  const idDetalle = `medidor-detalle-${medidor.indicador}`;
  const fmt = (v: string) => formatDecimal(v, { maxDecimales: 2, idioma });

  // El valor sale del análisis cuando lo hay, para que cifra y banda pertenezcan
  // a la misma revisión; si no, del store (hay valor pero no lectura).
  const crudo = lectura?.value ?? vigente?.value;
  const texto =
    crudo === undefined
      ? "—"
      : medidor.pct
        ? formatPct(crudo, 2, idioma)
        : fmt(crudo);

  const escala = lectura?.scale;
  const pie =
    escala === undefined
      ? null
      : escala.source === "percentiles"
        ? t("medidores.escala.percentiles", {
            p10: fmt(escala.cuts[0]?.value ?? "0"),
            p50: fmt(escala.cuts[1]?.value ?? "0"),
            p90: fmt(escala.cuts[2]?.value ?? "0"),
            dias: escala.window_days,
          })
        : t("medidores.escala.ruleset", {
            muestras: escala.samples,
            minimo: escala.min_samples,
            dias: escala.window_days,
          });

  return (
    <div className="vmw-tarjeta">
      <div className="vmw-medidor__cabecera">
        <span className="vmw-eyebrow">{t(medidor.etiqueta)}</span>
        {/* Sin escala no hay pie: el porqué lo dice la nota de abajo (sin valor
            o sin lectura) y, si falta el análisis entero, la síntesis del panel.
            Repetirlo seis veces sería ruido, no honestidad. */}
        <span className="vmw-medidor__escala">{pie}</span>
      </div>

      <div className="vmw-cifra vmw-medidor__valor">{texto}</div>

      {/* Barra: solo si hay coordenada. `position: null` ⇒ nada que dibujar
          honestamente, y el pie ya explica por qué. */}
      {lectura !== undefined && lectura.position !== null ? (
        <div
          className="vmw-barra vmw-barra--con-umbral"
          role="img"
          aria-label={t("medidores.barraEtiqueta", {
            etiqueta: t(medidor.etiqueta),
            valor: texto,
            banda: t(`medidores.banda.${CLAVE_BANDA[lectura.band]}` as Clave),
            fuente: t(`medidores.fuente.${lectura.scale.source}` as Clave),
          })}
          style={{ marginTop: "14px" }}
        >
          <div
            className="vmw-barra__relleno"
            style={{
              width: pctDesdeFraccion(lectura.position),
              background: medidor.color,
            }}
          />
          {/* UNA marca por regla: p2p_ratio_oferta_demanda alimenta TRES. */}
          {lectura.rules.map((r) => (
            <div
              key={r.rule}
              className="vmw-barra__umbral"
              data-cumple={r.met}
              title={`${r.type} · ${r.op} ${r.threshold}`}
              style={{ left: pctDesdeFraccion(r.threshold_position) }}
            />
          ))}
        </div>
      ) : (
        <div
          className="vmw-barra vmw-barra--sin-escala"
          style={{ marginTop: "14px" }}
        />
      )}

      <p className="vmw-nota" style={{ marginTop: "12px" }}>
        {crudo === undefined
          ? t("medidores.sinValor")
          : lectura === undefined
            ? t("medidores.sinLectura")
            : t(medidor.lectura[lectura.band])}
      </p>

      {oficialStale && medidor.indicador === INDICADOR_BRECHA ? (
        <p className="vmw-medidor__aviso">{t("medidores.oficialStale")}</p>
      ) : null}

      {lectura !== undefined && escala !== undefined ? (
        <>
          <button
            type="button"
            className="vmw-medidor__boton"
            aria-expanded={abierto}
            aria-controls={idDetalle}
            onClick={() => setAbierto(!abierto)}
          >
            {t(abierto ? "medidores.detalle.cerrar" : "medidores.detalle.abrir")}
            <span aria-hidden="true">{abierto ? "−" : "+"}</span>
          </button>
          {abierto ? (
            <div
              id={idDetalle}
              className="vmw-medidor__detalle"
              role="region"
              aria-label={t(medidor.etiqueta)}
            >
              <div className="vmw-eyebrow">
                {t("medidores.detalle.definicionTitulo")}
              </div>
              <p className="vmw-nota">{t(medidor.definicion)}</p>

              <div className="vmw-eyebrow">
                {t("medidores.detalle.lecturaTitulo")}
              </div>
              <p className="vmw-nota">
                {t(medidor.lectura[lectura.band])}{" "}
                {escala.source === "ruleset"
                  ? t("medidores.escalaEnFormacion", {
                      muestras: escala.samples,
                      minimo: escala.min_samples,
                      dias: escala.window_days,
                    })
                  : t("medidores.escala.explicacion", {
                      dias: escala.window_days,
                    })}
              </p>

              <div className="vmw-eyebrow">
                {t("medidores.detalle.reglasTitulo")}
              </div>
              <ul className="vmw-medidor__reglas">
                {lectura.rules.length === 0 ? (
                  <li>{t("medidores.regla.sinReglas")}</li>
                ) : (
                  lectura.rules.map((r) => (
                    <li key={r.rule} data-cumple={r.met}>
                      {r.met
                        ? t("medidores.regla.cumplida", {
                            tipo: nombrePropio(r.type),
                            umbral: fmt(r.threshold),
                          })
                        : t(
                            r.op === "gt" || r.op === "gte"
                              ? "medidores.regla.porEncima"
                              : "medidores.regla.porDebajo",
                            {
                              tipo: nombrePropio(r.type),
                              umbral: fmt(r.threshold),
                              distancia: fmt(r.distance),
                            },
                          )}
                    </li>
                  ))
                )}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * Síntesis del panel. Orden de precedencia deliberado: confianza baja gana a
 * todo (si los avisos están suprimidos, hablar de proximidad engaña), luego
 * reglas cumplidas, luego la más cercana, luego el aviso de no evaluables, y
 * `ninguna` como suelo. El pie de aclaración va SIEMPRE.
 */
function SintesisPanel({ analisis }: { analisis: Analisis | null }) {
  const { t, idioma } = useI18n();
  if (analisis === null) {
    return (
      <p className="vmw-nota" style={{ marginTop: "10px" }}>
        {t("medidores.sinAnalisis")}
      </p>
    );
  }
  const s = analisis.summary;
  const linea =
    analisis.confidence === "low"
      ? t("medidores.sintesis.confianzaBaja", {
          outliers: pctOutliers(analisis, idioma),
        })
      : s.rules_met.length > 0
        ? t("medidores.sintesis.cumplidas", {
            reglas: s.rules_met.map(nombrePropio).join(", "),
          })
        : s.closest_rule !== null
          ? t("medidores.sintesis.cerca", {
              regla: nombrePropio(s.closest_rule),
              cumplidas: s.conditions_met,
              totales: s.conditions_total,
              indicador: nombrePropio(s.blocked_by ?? "—"),
            })
          : s.rules_evaluable < s.rules_total
            ? t("medidores.sintesis.noEvaluable", {
                evaluables: s.rules_evaluable,
                totales: s.rules_total,
              })
            : t("medidores.sintesis.ninguna");

  return (
    <>
      <div className="vmw-eyebrow" style={{ marginTop: "14px" }}>
        {t("medidores.sintesis.titulo")}
      </div>
      <p className="vmw-nota">{linea}</p>
      <p className="vmw-medidor__aclaracion">
        {t("medidores.sintesis.aclaracion")}
      </p>
    </>
  );
}

/** Nombres de reglas e indicadores: vocabulario del contrato, no se traducen —
 *  solo se leen mejor con los guiones bajos como espacios (mismo criterio que
 *  `SignalsFeed`). */
function nombrePropio(valor: string): string {
  return valor.replaceAll("_", " ");
}

/**
 * Distancia MÍNIMA de un medidor a un umbral que aún no ha cruzado, en
 * coordenadas de dibujo [0,1].
 *
 * Es el mismo criterio con el que el motor cuenta «medidores cerca de su
 * umbral»: normalizado, porque en unidades crudas no se puede comparar un
 * porcentaje de brecha con un ratio de oferta. Un umbral ya cumplido no cuenta —
 * dejó de estar cerca, está pasado.
 *
 * `null` = nada que medir; esos medidores van al final, sin reordenarse entre sí.
 */
function distanciaAUmbral(lectura: LecturaMedidor | undefined): number | null {
  if (lectura?.position == null || lectura.rules.length === 0) {
    return null;
  }
  const posicion = toChartNumber(lectura.position);
  const distancias = lectura.rules
    .filter((r) => !r.met)
    .map((r) => Math.abs(posicion - toChartNumber(r.threshold_position)));
  return distancias.length === 0 ? null : Math.min(...distancias);
}

/** El % de outliers que motivó la confianza baja, si el medidor está en la
 *  lectura; si no, se dice que no se sabe en vez de inventar una cifra. */
function pctOutliers(analisis: Analisis, idioma: "es" | "en"): string {
  const outliers = analisis.indicators.find(
    (i) => i.indicator === INDICADOR_OUTLIERS,
  );
  return outliers === undefined ? "—" : formatPct(outliers.value, 2, idioma);
}
