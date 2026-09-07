/**
 * Vista de histórico: series de la tasa oficial (por value_date) y de un
 * indicador canónico agregado por bucket (5m/1h/1d), con rango ≤ 90 días
 * validado en cliente, paginación transparente con progreso y cancelación.
 * Un solo eje por gráfico (dataviz); tooltips muestran el string exacto.
 *
 * El rediseño cambia el cromo (chips, selects y tarjetas del sistema) y deja
 * intacta la mecánica de paginación: es la parte cara y ya verificada.
 */

import { useEffect, useRef, useState } from "react";

import {
  historialIndicadores,
  historialTasa,
  RANGO_MAX_DIAS,
  type Intervalo,
} from "../api/endpoints";
import { ApiError } from "../api/problem";
import { EpisodiosComparables } from "../components/EpisodiosComparables";
import { HistorialReglas } from "../components/HistorialReglas";
import { ControlesSerie } from "../components/ControlesSerie";
import { LecturaHistorico } from "../components/LecturaHistorico";
import { TasaOficialContexto } from "../components/TasaOficialContexto";
import { SerieEvaluada } from "../components/SerieEvaluada";
import { useI18n } from "../i18n/contexto";
import { toChartNumber } from "../lib/decimal";
import { condicionDe } from "../lib/reglas";
import { useMarket } from "../state/marketStore";
import { MONEDAS_BCV } from "../state/resync";

interface Punto {
  t: number;
  etiqueta: string;
  valor: number;
  valorStr: string;
}

export function HistoryView() {
  const { t, idioma } = useI18n();
  // Solo para el umbral de la capa de referencia: el SPA no evalua nada,
  // la condicion viene calculada del motor (RF-6, ADR-0019).
  const { analisis, senales, vigentes } = useMarket();
  const [dias, setDias] = useState<number>(30);
  const [moneda, setMoneda] = useState("USD");
  const [indicador, setIndicador] = useState("p2p_brecha_pct_buy");
  const [intervalo, setIntervalo] = useState<Intervalo>("1h");
  const [tasas, setTasas] = useState<Punto[]>([]);
  const [serie, setSerie] = useState<Punto[]>([]);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    const hasta = new Date();
    const desde = new Date(
      hasta.getTime() - Math.min(dias, RANGO_MAX_DIAS) * 86_400_000,
    );
    setError(null);
    setProgreso(t("generico.cargando"));

    // Filtro SIEMPRE en servidor (sin él se pagina el formato largo completo
    // y se agota la cuota): los p2p_* viven bajo VES; official_rate* bajo la
    // moneda BCV seleccionada.
    const filtro = indicador.startsWith("official_rate")
      ? { indicador, moneda }
      : { indicador, moneda: "VES" };

    void (async () => {
      try {
        const [filasTasa, filasIndicador] = await Promise.all([
          historialTasa(moneda, desde, hasta, { signal: abort.signal }),
          historialIndicadores(desde, hasta, intervalo, filtro, {
            signal: abort.signal,
            alProgresar: (paginas, items) =>
              setProgreso(t("historico.progreso", { paginas, items })),
          }),
        ]);
        if (abort.signal.aborted) {
          return;
        }
        setTasas(
          filasTasa
            .map((fila) => ({
              t: Date.parse(fila.value_date),
              etiqueta: fila.value_date,
              valor: toChartNumber(fila.rate),
              valorStr: fila.rate,
            }))
            .sort((a, b) => a.t - b.t),
        );
        setSerie(
          filasIndicador
            .map((fila) => ({
              t: Date.parse(fila.as_of),
              etiqueta: fila.as_of,
              valor: toChartNumber(fila.value),
              valorStr: fila.value,
            }))
            .sort((a, b) => a.t - b.t),
        );
        setProgreso(null);
      } catch (excepcion) {
        if (abort.signal.aborted) {
          return;
        }
        setProgreso(null);
        setError(
          excepcion instanceof ApiError
            ? excepcion.message
            : t("historico.error"),
        );
      }
    })();
    return () => abort.abort();
  }, [dias, moneda, indicador, intervalo, t]);

  return (
    <main className="vmw-vista">
      <div className="vmw-contenedor">
        {/* Barra GLOBAL: solo la moneda, que afecta a toda la vista —también
            al bloque de la tasa oficial—. Rango, serie y bucket viven dentro de
            la tarjeta que gobiernan. */}
        <section className="vmw-controles" aria-label={t("historico.controles")}>
          <select
            className="vmw-select"
            aria-label={t("historico.moneda")}
            value={moneda}
            onChange={(evento) => setMoneda(evento.target.value)}
          >
            {MONEDAS_BCV.map((codigo) => (
              <option key={codigo}>{codigo}</option>
            ))}
          </select>
          <span className="vmw-nav__relleno" />
          {progreso !== null && (
            <span
              role="status"
              style={{
                fontSize: "var(--fs-micro)",
                color: "var(--text-muted)",
              }}
            >
              {progreso}
            </span>
          )}
        </section>
        {error !== null ? <p className="vmw-sin-datos">{error}</p> : null}

        {/* Primer bloque de la vista: qué dice la ventana que se está mirando,
            antes de que nadie tenga que interpretar un trazo. */}
        <LecturaHistorico
          puntos={serie.map((p) => ({ t: p.t, valor: p.valorStr }))}
          condicion={condicionDe(analisis, indicador)}
          indicador={indicador}
          dias={dias}
          bucket={intervalo}
          idioma={idioma}
        />

        {/* LA PROTAGONISTA. Va antes que la oficial y con el gráfico entero:
            la jerarquía se dice con el tamaño, no con un rótulo. */}
        <section
          className="vmw-serieval__tarjeta"
          aria-label={t("historico.serieTitulo", { indicador, bucket: intervalo })}
        >
          {/* Sin `h3` aquí: la cabecera de la propia tarjeta ya da el nombre
              legible, la clave y el valor de hoy. Dos títulos seguidos diciendo
              lo mismo era ruido. */}
          <SerieEvaluada
            puntos={serie.map((p) => ({ t: p.t, valor: p.valorStr }))}
            condicion={condicionDe(analisis, indicador)}
            indicador={indicador}
            dias={dias}
            idioma={idioma}
            etiqueta={t("historico.serieTitulo", {
              indicador,
              bucket: intervalo,
            })}
            controles={
              <ControlesSerie
                dias={dias}
                setDias={setDias}
                indicador={indicador}
                setIndicador={setIndicador}
                intervalo={intervalo}
                setIntervalo={setIntervalo}
              />
            }
          />
        </section>

        {/* La oficial pasa a contexto: la mitad de alto, área rellena, sin eje
            Y. Sigue estando entera —es la pierna que explica el precio— pero ya
            no compite por la atención. */}
        <TasaOficialContexto
          puntos={tasas.map((p) => ({ t: p.t, valor: p.valorStr }))}
          moneda={moneda}
          dias={dias}
          brechaPct={vigentes["p2p_brecha_pct_sell"]?.value ?? null}
          evaluada={serie.map((p) => ({ t: p.t, valor: p.valorStr }))}
          idioma={idioma}
        />

        {/* Después de los gráficos: primero se ve la serie, luego con qué se
            parece. Al revés obligaría a comparar contra algo no visto. */}
        <EpisodiosComparables
          senales={senales}
          analisis={analisis}
          idioma={idioma}
        />

        {/* Último bloque: del caso concreto al comportamiento agregado. */}
        <HistorialReglas
          senales={senales}
          analisis={analisis}
          idioma={idioma}
        />
      </div>
    </main>
  );
}
