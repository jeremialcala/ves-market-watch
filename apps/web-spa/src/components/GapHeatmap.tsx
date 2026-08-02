import { useI18n } from "../i18n/contexto";
import { formatPct } from "../lib/decimal";
import { colorCalor, escalaCalor, esExceso, parrillaCalor } from "../lib/series";
import { DIAS_CALOR, useHistorialBrecha } from "../state/useHistorialBrecha";
import { NoDataState } from "./NoDataState";

/**
 * Mapa de calor día × hora (VET) de la brecha — dato REAL de
 * `/indicators/history` con bucket 1 h. Las horas sin bucket quedan vacías:
 * no se interpola para «rellenar bonito».
 *
 * La rampa llega hasta el p90 y el coral marca lo que lo supera. Ese p90 es de
 * los 14 días que se están pintando, y la leyenda lo dice: el lado venta no es
 * medidor del panel, así que no tiene percentiles publicados que citar.
 */
export function GapHeatmap() {
  const { t, idioma } = useI18n();
  // Venta, no compra: es el lado con historia real (242 días derivados,
  // ADR-0013 RF-7). Con el de compra las primeras filas del mapa salían vacías
  // porque su serie arranca el 2026-07-20.
  const { horario, cargando, fallo } = useHistorialBrecha("sell");
  const escala = escalaCalor(horario);

  return (
    <section className="vmw-seccion" aria-label={t("calor.titulo")}>
      <div className="vmw-seccion__cabecera">
        <h3 className="vmw-seccion__titulo">{t("calor.titulo")}</h3>
        <span className="vmw-seccion__bajada">{t("calor.bajada")}</span>
      </div>
      <div className="vmw-tarjeta">
        {escala === null ? (
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
                              : // El exceso se DICE, no solo se pinta: si la
                                // categoría viviera únicamente en el tono, para
                                // quien no lo distinga no existiría.
                                t(
                                  esExceso(celda.valor, escala)
                                    ? "calor.celdaExceso"
                                    : "calor.celda",
                                  {
                                    dia: fila.etiqueta,
                                    hora: celda.hora,
                                    valor: formatPct(celda.valor, 2, idioma),
                                  },
                                )
                          }
                          style={
                            celda.valor === null
                              ? undefined
                              : { background: colorCalor(celda.valor, escala) }
                          }
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="vmw-calor__leyenda">
              <span>
                {t("calor.p10", { valor: formatPct(escala.p10, 2, idioma) })}
              </span>
              <div className="vmw-calor__escala" aria-hidden="true" />
              <span>
                {t("calor.p90", { valor: formatPct(escala.p90, 2, idioma) })}
              </span>
              <span className="vmw-calor__exceso">
                <i className="vmw-calor__muestra" aria-hidden="true" />
                {t("calor.exceso")}
              </span>
              <span>{t("calor.leyenda")}</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
