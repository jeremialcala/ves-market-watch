import { useI18n } from "../i18n/contexto";
import { formatPct, toChartNumber } from "../lib/decimal";
import { colorCalor, extremos, parrillaCalor } from "../lib/series";
import { DIAS_CALOR, useHistorialBrecha } from "../state/useHistorialBrecha";
import { NoDataState } from "./NoDataState";

/**
 * Mapa de calor día × hora (VET) de la brecha — dato REAL de
 * `/indicators/history` con bucket 1 h. Las horas sin bucket quedan vacías:
 * no se interpola para «rellenar bonito».
 */
export function GapHeatmap() {
  const { t, idioma } = useI18n();
  const { horario, cargando, fallo } = useHistorialBrecha();
  const rango = extremos(horario);

  return (
    <section className="vmw-seccion" aria-label={t("calor.titulo")}>
      <div className="vmw-seccion__cabecera">
        <h3 className="vmw-seccion__titulo">{t("calor.titulo")}</h3>
        <span className="vmw-seccion__bajada">{t("calor.bajada")}</span>
      </div>
      <div className="vmw-tarjeta">
        {rango === null ? (
          <NoDataState
            detalle={
              cargando
                ? t("generico.cargando")
                : fallo
                  ? t("calor.fallo")
                  : t("calor.sinSerie")
            }
          />
        ) : (
          <>
            <div className="vmw-calor">
              <div className="vmw-calor__dias">
                {parrillaCalor(horario, DIAS_CALOR).map((fila) => (
                  <div className="vmw-calor__dia" key={fila.dia}>
                    {fila.etiqueta}
                  </div>
                ))}
              </div>
              <div className="vmw-calor__parrilla">
                <div className="vmw-calor__horas" aria-hidden="true">
                  {Array.from({ length: 24 }, (_, hora) => (
                    <div key={hora}>{hora % 3 === 0 ? hora : ""}</div>
                  ))}
                </div>
                <div style={{ display: "grid", gap: "4px" }}>
                  {parrillaCalor(horario, DIAS_CALOR).map((fila) => (
                    <div className="vmw-calor__fila" key={fila.dia}>
                      {fila.celdas.map((celda) => (
                        <div
                          key={celda.hora}
                          className="vmw-calor__celda"
                          title={
                            celda.valor === null
                              ? t("calor.sinDato", {
                                  dia: fila.etiqueta,
                                  hora: celda.hora,
                                })
                              : t("calor.celda", {
                                  dia: fila.etiqueta,
                                  hora: celda.hora,
                                  valor: formatPct(celda.valor, 2, idioma),
                                })
                          }
                          style={
                            celda.valor === null
                              ? undefined
                              : {
                                  background: colorCalor(
                                    celda.valor,
                                    toChartNumber(rango.min),
                                    toChartNumber(rango.max),
                                  ),
                                }
                          }
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="vmw-calor__leyenda">
              <span>{formatPct(rango.min, 2, idioma)}</span>
              <div className="vmw-calor__escala" aria-hidden="true" />
              <span>{formatPct(rango.max, 2, idioma)}</span>
              <span>{t("calor.leyenda")}</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
