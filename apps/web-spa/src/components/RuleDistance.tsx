import type { Analisis } from "../api/endpoints";
import { useI18n } from "../i18n/contexto";
import { formatDecimal } from "../lib/decimal";
import { useMarket } from "../state/marketStore";
import { NoDataState } from "./NoDataState";

type Proximidad = Analisis["rule_proximity"][number];
type CondicionRegla = Proximidad["conditions"][number];

/**
 * «Distancia al disparo»: cuánto le falta al aviso más cercano.
 *
 * Todo sale de `analisis.rule_proximity` (RF-6, ADR-0019). El SPA no evalúa
 * nada: qué condición se cumple, a cuánto está cada una y cuál bloquea vienen
 * calculadas del motor.
 *
 * Describe el presente, no lo anticipa: dice a cuánto está una regla YA
 * versionada, no que vaya a dispararse. Y no habla de señales emitidas, porque
 * el cooldown pudo suprimir la emisión — eso vive en la cronología.
 */
export function RuleDistance() {
  const { t } = useI18n();
  const { analisis } = useMarket();

  const cercana = reglaMasCercana(analisis);

  return (
    <div className="vmw-tarjeta vmw-tarjeta--reparte" aria-label={t("disparo.titulo")}>
      <div className="vmw-eyebrow">
        <span>{t("disparo.titulo")}</span>
      </div>
      <div className="vmw-disparo vmw-crece">
        {cercana === null ? (
          <NoDataState detalle={t("disparo.sinRegla")} />
        ) : (
          <>
            <div className="vmw-disparo__cabecera">
              <span className="vmw-disparo__regla">
                {nombrePropio(cercana.type)}
              </span>
              <span className="vmw-disparo__conteo">
                {t("disparo.conteo", {
                  cumplidas: cercana.conditions_met,
                  totales: cercana.conditions_total,
                })}
              </span>
            </div>

            <ul className="vmw-disparo__lista">
              {cercana.conditions.map((condicion) => (
                <Fila key={condicion.indicator} condicion={condicion} />
              ))}
            </ul>

            {cercana.blocked_by !== null && (
              <p className="vmw-nota vmw-disparo__nota">
                {t("disparo.bloquea", {
                  indicador: nombrePropio(cercana.blocked_by),
                })}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Fila({ condicion }: { condicion: CondicionRegla }) {
  const { t, idioma } = useI18n();
  const num = (v: string) => formatDecimal(v, { maxDecimales: 2, idioma });

  return (
    // Dos bloques, no cuatro columnas: a la izquierda QUÉ mide y cuánto vale; a
    // la derecha CUÁNTO le falta y contra qué. Así cada mitad se lee de un
    // vistazo en vez de recorrer una fila de cuatro celdas.
    <li className="vmw-disparo__fila" data-cumple={condicion.met ? "si" : "no"}>
      <span className="vmw-disparo__que">
        <span className="vmw-disparo__nombre">
          {nombrePropio(condicion.indicator)}
        </span>
        <span className="vmw-disparo__valor">
          {/* Un indicador sin valor vigente viaja como `null`: se dice, jamás se
              rellena con el último conocido rancio. */}
          {condicion.value === null ? "—" : num(condicion.value)}
        </span>
      </span>
      <span className="vmw-disparo__cuanto">
        <span className="vmw-disparo__falta">
          {condicion.met
            ? t("disparo.cumple")
            : condicion.distance === null
              ? "—"
              : t("disparo.falta", { distancia: num(condicion.distance) })}
        </span>
        <span className="vmw-disparo__umbral">
          {t(
            condicion.op === "gt" || condicion.op === "gte"
              ? "disparo.necesitaPorEncima"
              : "disparo.necesitaPorDebajo",
            { umbral: num(condicion.threshold) },
          )}
        </span>
      </span>
    </li>
  );
}

/**
 * La regla más cercana la decide el MOTOR, no este panel.
 *
 * `summary.closest_rule` ya viene calculada con sus desempates deterministas
 * (ADR-0019). Recalcularla aquí «por comodidad» creaba una segunda fuente de
 * verdad: con dos reglas empatadas a cero condiciones cumplidas, este panel
 * nombraba una y la síntesis del panel de instrumentos otra, en la misma
 * pantalla.
 *
 * Sin `closest_rule` no hay regla que mostrar: significa que ninguna es
 * evaluable —con confianza baja el motor no calculó la microestructura— y
 * hablar de proximidad citaría cifras que nadie computó.
 */
function reglaMasCercana(analisis: Analisis | null): Proximidad | null {
  const cercana = analisis?.summary.closest_rule;
  if (analisis == null || cercana == null) {
    return null;
  }
  return (
    analisis.rule_proximity.find((r) => r.rule === cercana && r.evaluable) ?? null
  );
}

/** `p2p_momentum_bid_3h_pct` → `p2p momentum bid 3h pct`. El nombre canónico NO
 *  se traduce (es vocabulario del contrato), solo se hace legible. */
function nombrePropio(valor: string): string {
  return valor.replaceAll("_", " ");
}
