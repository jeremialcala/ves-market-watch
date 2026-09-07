/**
 * «Historial de las reglas»: último bloque del histórico.
 *
 * Qué ha hecho cada regla del ruleset desde que corre — casos emitidos, cuántos
 * son ya medibles, qué efecto medio se observó y si la muestra da para algo.
 *
 * ### Dos cosas que este bloque NO hace, y por qué
 *
 * **No tiene columna de aciertos.** El contrato de la API lo dice de su propio
 * campo `outcome`: «sin veredicto y sin contador agregado (…) un “N de M” se lee
 * como tasa de acierto». En su lugar, «con resultado» cuenta los casos con la
 * ventana cumplida: completitud de la muestra, no juicio sobre ninguno.
 *
 * **No se compara contra el backtest de 11–20 jul.** De aquel backtest
 * sobrevivieron sus umbrales —lo que `senales.v1.yaml` cita como procedencia—,
 * no sus resultados: no están en el repo ni en la base. Comparar contra ellos
 * habría exigido inventárselos.
 *
 * ### La nota del pie no se oculta nunca
 *
 * Ni cuando la tabla mejore. Es la advertencia de que una regla con una sola
 * aparición se lee como hipótesis y de que los umbrales v1 siguen pendientes de
 * recalibración HITL — condicionar su presencia a que las cifras sean buenas la
 * convertiría en un descargo que aparece solo cuando conviene.
 */

import type { Analisis, Senal } from "../api/endpoints";
import { useI18n } from "../i18n/contexto";
import type { Idioma } from "../i18n/idioma";
import {
  colorMedible,
  colorSuficiencia,
  formatearEfecto,
  historialDeReglas,
  type FilaRegla,
} from "../lib/historialReglas";

export function HistorialReglas({
  senales,
  analisis,
  idioma,
}: {
  senales: readonly Senal[];
  analisis: Analisis | null;
  idioma: Idioma;
}) {
  const { t } = useI18n();
  const filas = historialDeReglas(senales, analisis);

  if (filas.length === 0) {
    return null;
  }

  return (
    <section className="vmw-reglashist" aria-label={t("reglashist.titulo")}>
      <div className="vmw-reglashist__cabecera">
        <h3 className="vmw-reglashist__titulo">{t("reglashist.titulo")}</h3>
        <span className="vmw-reglashist__bajada">
          {t("reglashist.bajada", {
            casos: String(filas.reduce((n, f) => n + f.casos, 0)),
            horas: String(filas.find((f) => f.horas !== null)?.horas ?? 24),
          })}
        </span>
      </div>

      <div className="vmw-reglashist__caja">
        <div className="vmw-reglashist__scroll">
          <div className="vmw-reglashist__tabla">
            <div className="vmw-reglashist__cabtabla">
              <span>{t("reglashist.colRegla")}</span>
              <span>{t("reglashist.colCasos")}</span>
              <span>{t("reglashist.colMedibles")}</span>
              <span>{t("reglashist.colEfecto")}</span>
              <span>{t("reglashist.colMuestra")}</span>
            </div>
            {filas.map((fila) => (
              <Fila key={fila.regla} fila={fila} idioma={idioma} t={t} />
            ))}
          </div>
        </div>

        {/* Presente SIEMPRE, pasen las cifras lo que pasen. */}
        <p className="vmw-reglashist__nota">{t("reglashist.nota")}</p>
      </div>
    </section>
  );
}

function Fila({
  fila,
  idioma,
  t,
}: {
  fila: FilaRegla;
  idioma: Idioma;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const efecto = formatearEfecto(fila.efectoMedio, idioma);
  return (
    <div className="vmw-reglashist__fila">
      <span className="vmw-reglashist__regla">
        {/* El nombre sale de la CLAVE, no de un diccionario de reglas: el
            ruleset es config versionada del motor y una regla nueva aparecería
            aquí sin tocar el SPA. Mismo tratamiento que en `RuleDistance`. */}
        <span className="vmw-reglashist__nombre">
          {fila.clave.replaceAll("_", " ")}
        </span>
        <span className="vmw-reglashist__clave">{fila.clave}</span>
      </span>

      <span className="vmw-reglashist__casos">{fila.casos}</span>

      <span
        className="vmw-reglashist__medibles"
        style={{ color: colorMedible(fila) }}
      >
        {fila.conResultado}
      </span>

      <span className="vmw-reglashist__efecto">
        {efecto === null
          ? t("reglashist.sinEfecto")
          : t("reglashist.efecto", { delta: efecto, horas: String(fila.horas) })}
      </span>

      <span
        className="vmw-reglashist__muestra"
        style={{ color: colorSuficiencia(fila.suficiencia) }}
      >
        {t(`reglashist.muestra.${fila.suficiencia}`)}
      </span>
    </div>
  );
}
