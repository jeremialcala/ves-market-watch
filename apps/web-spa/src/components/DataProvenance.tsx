import type { CuotaRateLimit } from "../api/client";
import type { Analisis } from "../api/endpoints";
import type { Clave } from "../i18n/dict";
import { useI18n } from "../i18n/contexto";
import { formatPct } from "../lib/decimal";
import { useMarket } from "../state/marketStore";
import { NoDataState } from "./NoDataState";

/**
 * «Calidad y procedencia del dato»: de qué está hecho lo que se está mirando.
 *
 * No añade dato nuevo — reúne el que el análisis ya publica precisamente para
 * poder responder esta pregunta, y que hasta ahora estaba repartido en pies de
 * tarjeta: con qué escala se comparó cada medidor, cuántas muestras la sostienen,
 * si la tasa oficial está vencida, si la confianza bajó, y hasta dónde llega de
 * verdad la historia de cada lado de la brecha.
 *
 * Es la contrapartida de todo lo demás: cada panel afirma algo, y este dice con
 * qué material se afirmó.
 */
export function DataProvenance() {
  const { t, idioma } = useI18n();
  const { analisis, vigentes, cuota } = useMarket();

  return (
    <div className="vmw-tarjeta" aria-label={t("procedencia.titulo")}>
      <div className="vmw-eyebrow">
        <span>{t("procedencia.titulo")}</span>
      </div>
      <div className="vmw-proc">
        {analisis === null ? (
          <NoDataState detalle={t("procedencia.sinAnalisis")} />
        ) : (
          <>
            <ul className="vmw-proc__lista">
              {filas(analisis, t, vigentes, cuota, idioma).map((fila) => (
                <li key={fila.etiqueta} className="vmw-proc__fila">
                  <span className="vmw-proc__etiqueta">
                    {/* El punto REPITE lo que ya dice el valor en coral: es
                        refuerzo, no la única codificación. Quien no distinga el
                        color sigue leyendo el estado en el texto de la derecha. */}
                    <i
                      className="vmw-proc__punto"
                      data-tono={fila.alerta ? "coral" : undefined}
                      aria-hidden="true"
                    />
                    {fila.etiqueta}
                  </span>
                  <span
                    className="vmw-proc__valor"
                    data-tono={fila.alerta ? "coral" : undefined}
                  >
                    {fila.valor}
                  </span>
                </li>
              ))}
            </ul>
            <p className="vmw-nota vmw-proc__nota">{t("procedencia.nota")}</p>
          </>
        )}
      </div>
    </div>
  );
}

type Traducir = (
  clave: Clave,
  params?: Record<string, string | number>,
) => string;
type Fila = { etiqueta: string; valor: string; alerta?: boolean };

function filas(
  analisis: Analisis,
  tr: Traducir,
  vigentes: Record<string, { value: string }>,
  cuota: CuotaRateLimit,
  idioma: "es" | "en",
): Fila[] {
  // Escala de los medidores: cuántos se comparan contra percentiles REALES y
  // cuántos contra el respaldo del ruleset. La degradación viaja en el payload
  // (`scale.source`), así que aquí solo se cuenta.
  const conPercentiles = analisis.indicators.filter(
    (i) => i.scale.source === "percentiles",
  ).length;
  const enRespaldo = analisis.indicators.length - conPercentiles;

  // El medidor con menos muestras marca el suelo de toda la escala.
  const menorMuestra = analisis.indicators.reduce<number | null>(
    (min, i) => (min === null || i.scale.samples < min ? i.scale.samples : min),
    null,
  );

  const filas: Fila[] = [
    {
      etiqueta: tr("procedencia.escala"),
      valor:
        enRespaldo === 0
          ? tr("procedencia.escalaTodos", { n: conPercentiles })
          : tr("procedencia.escalaParcial", {
              n: conPercentiles,
              respaldo: enRespaldo,
            }),
      alerta: enRespaldo > 0,
    },
    {
      etiqueta: tr("procedencia.muestras"),
      valor:
        menorMuestra === null
          ? "—"
          : tr("procedencia.muestrasValor", {
              n: menorMuestra,
              minimo: analisis.indicators[0]?.scale.min_samples ?? 0,
            }),
    },
    {
      etiqueta: tr("procedencia.confianza"),
      valor: tr(
        analisis.confidence === "low"
          ? "procedencia.confianzaBaja"
          : "procedencia.confianzaNormal",
      ),
      alerta: analisis.confidence === "low",
    },
    {
      etiqueta: tr("procedencia.oficial"),
      valor: tr(
        analisis.official_stale
          ? "procedencia.oficialRancia"
          : "procedencia.oficialFresca",
      ),
      alerta: analisis.official_stale,
    },
  ];

  // Cobertura de merchants: qué parte del volumen del lado de compra viene de
  // comerciantes verificados. Es un indicador del flujo (`p2p_merchants_pct_buy`),
  // no del análisis, y por eso se lee del store — si no ha llegado, se calla.
  const merchants = vigentes["p2p_merchants_pct_buy"];
  if (merchants !== undefined) {
    filas.push({
      etiqueta: tr("procedencia.merchants"),
      valor: tr("procedencia.merchantsValor", {
        pct: formatPct(merchants.value, 2, idioma),
      }),
    });
  }

  // Cuota REST de la ventana y versiones del motor: estaban solo en la tira de
  // estado, que en móvil no existe. Aquí es donde alguien pregunta «¿con qué se
  // calculó esto?».
  if (cuota.remaining !== undefined && cuota.limit !== undefined) {
    filas.push({
      etiqueta: tr("procedencia.cuota"),
      valor: `${cuota.remaining} / ${cuota.limit}`,
    });
  }
  filas.push({
    etiqueta: tr("procedencia.motor"),
    valor: tr("procedencia.motorValor", {
      calc: analisis.calc_version,
      ruleset: analisis.ruleset_version,
    }),
  });

  // Alcance real de la historia de cada lado. Es la misma honestidad que la
  // descomposición rotula en sus ventanas, dicha una vez y en un solo sitio.
  for (const lado of analisis.gap_history?.sides ?? []) {
    const mayor = lado.references.reduce<{ pedida: number; real: number } | null>(
      (max, r) =>
        max === null || r.days_configured > max.pedida
          ? { pedida: r.days_configured, real: r.days_covered }
          : max,
      null,
    );
    if (mayor === null) {
      continue;
    }
    const completa = mayor.real >= mayor.pedida;
    filas.push({
      etiqueta: tr(
        lado.side === "buy" ? "procedencia.historiaCompra" : "procedencia.historiaVenta",
      ),
      valor: completa
        ? tr("procedencia.historiaCompleta", { dias: mayor.pedida })
        : tr("procedencia.historiaParcial", {
            dias: mayor.real,
            pedida: mayor.pedida,
          }),
      alerta: !completa,
    });
  }

  return filas;
}
