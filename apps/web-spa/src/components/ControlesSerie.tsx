/**
 * Controles de la serie evaluada, dentro de su propia tarjeta.
 *
 * Rango, serie y bucket viven **junto al gráfico que gobiernan**: los tres
 * cambian lo que esa tarjeta dibuja y nada más. La moneda se queda fuera, en la
 * barra global, porque afecta a la vista entera —también al bloque de la tasa
 * oficial— y meterla aquí sugeriría que solo toca a este gráfico.
 *
 * ### Los nombres del selector son legibles
 *
 * El desplegable decía `p2p_drenaje_oferta_6h_pct`. La clave sigue estando —en
 * la cabecera de la tarjeta, bajo el nombre—, pero elegir entre cinco cadenas
 * en `snake_case` obliga a traducir mentalmente antes de decidir.
 *
 * La lista es **la del ruleset más la brecha**: los cuatro indicadores que
 * evalúan las reglas de `senales.v1.yaml` y la brecha que las contextualiza. Es
 * lo que «serie evaluada» significa, y por eso ya no aparecen aquí la tasa
 * oficial —que tiene su propio bloque— ni las medianas y liquideces, que no
 * gobiernan ninguna regla.
 */

import type { Intervalo } from "../api/endpoints";
import { useI18n } from "../i18n/contexto";
import { PRESETS, SERIES } from "../lib/seriesEvaluables";

export function ControlesSerie({
  dias,
  setDias,
  indicador,
  setIndicador,
  intervalo,
  setIntervalo,
}: {
  dias: number;
  setDias: (dias: number) => void;
  indicador: string;
  setIndicador: (indicador: string) => void;
  intervalo: Intervalo;
  setIntervalo: (intervalo: Intervalo) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="vmw-ctrl" aria-label={t("historico.controles")}>
      <div className="vmw-ctrl__grupo">
        <span className="vmw-ctrl__etiqueta">{t("historico.grupoRango")}</span>
        <div className="vmw-ctrl__pastillas">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="vmw-ctrl__pastilla"
              aria-pressed={dias === preset}
              onClick={() => {
                setDias(preset);
                // 5m solo para rangos cortos: en 90 días serían ~26k buckets.
                if (preset > 7 && intervalo === "5m") {
                  setIntervalo("1h");
                }
              }}
            >
              {t(
                preset === 7
                  ? "historico.rango7"
                  : preset === 30
                    ? "historico.rango30"
                    : "historico.rango90",
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="vmw-ctrl__grupo">
        <span className="vmw-ctrl__etiqueta">{t("historico.grupoSerie")}</span>
        <select
          className="vmw-ctrl__select"
          aria-label={t("historico.indicador")}
          value={indicador}
          onChange={(evento) => setIndicador(evento.target.value)}
        >
          {SERIES.map(({ indicador: nombre, clave }) => (
            <option key={nombre} value={nombre}>
              {t(clave)}
            </option>
          ))}
        </select>
      </div>

      <div className="vmw-ctrl__grupo">
        <span className="vmw-ctrl__etiqueta">{t("historico.grupoBucket")}</span>
        <select
          className="vmw-ctrl__select"
          aria-label={t("historico.bucket")}
          value={intervalo}
          onChange={(evento) => setIntervalo(evento.target.value as Intervalo)}
        >
          <option value="5m" disabled={dias > 7}>
            {t("historico.bucket5m")}
          </option>
          <option value="1h">{t("historico.bucket1h")}</option>
          <option value="1d">{t("historico.bucket1d")}</option>
        </select>
      </div>

      <span className="vmw-ctrl__procedencia">{t("historico.procedencia")}</span>
    </div>
  );
}
