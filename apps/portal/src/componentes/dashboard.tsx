/**
 * Los paneles del Dashboard público (RF-2). Leen del mismo snapshot que la
 * landing (una petición cada 10 s para toda la página) y de las series (cada
 * 60 s). Como en la landing, un panel sin dato lo dice en su sitio y nunca se
 * rellena con un ejemplo.
 */

import { formatDecimal, formatPct, type Idioma } from "@criterio/ui";
import { useState, type CSSProperties, type ReactNode } from "react";

import type { Snapshot } from "../api/cliente";
import { useAhora, useDatos } from "../datos/contexto";
import { useI18n } from "../i18n/contexto";
import { REGIMENES } from "../i18n/dict";
import {
  comparativasBrecha,
  deltaVsTreintaDias,
  extremos,
  filasProfundidad,
  frasesLectura,
  gruposSenales,
  mapaCalor,
  medidoresDashboard,
  mejorPrecioP2P,
  percentilBrecha,
  reglasCumplidas,
  tonoCalor,
  volumenCorto,
  type GrupoSenales,
  type Senal,
} from "../lib/dashboard";
import { conSigno, deltaVsSieteDias, fechaVet, puntosSparkline, tasaUsd, valorIndicador } from "../lib/lectura";
import { useClicInterno } from "../router/contexto";
import { useEdad } from "../datos/useEdad";
import { SinDatos, TarjetaMedidor } from "./paneles";

const UMBRAL_P2P_MS = 20 * 60 * 1000; // la frescura P2P del gateway

const dosDecimales = (v: string, idioma: Idioma) => formatDecimal(v, { maxDecimales: 2, minDecimales: 2, idioma });

function Seccion({ titulo, sub, children }: { titulo: string; sub?: string; children: ReactNode }) {
  return (
    <section className="dash-seccion">
      <header className="dash-seccion-cabecera">
        <h2>{titulo}</h2>
        {sub !== undefined && <span>{sub}</span>}
      </header>
      {children}
    </section>
  );
}

// -- lectura de hoy -------------------------------------------------------------------

/**
 * Lo que una integración haría con estos mismos números. Las variables son del
 * lector: el host de producción del API depende de D15.
 */
const FRAGMENTOS = {
  exportar: [
    'curl -H "Authorization: Bearer $TOKEN" \\',
    '  "$CRITERIO_API/api/v1/indicators/history?indicator=p2p_brecha_pct_buy&from=$DESDE&to=$HASTA&interval=1h&page_size=100"',
  ].join("\n"),
  alertas: [
    'wscat -c "$CRITERIO_WSS/ws/v1?token=$TOKEN"',
    '> {"action": "subscribe", "topics": ["signals"]}',
  ].join("\n"),
} as const;

export function LecturaDeHoy() {
  const { t, idioma } = useI18n();
  const { snapshot } = useDatos();
  const ahora = useAhora();
  const s = snapshot.datos;
  const [fragmento, setFragmento] = useState<keyof typeof FRAGMENTOS | null>(null);
  const irPrecios = useClicInterno("/precios");
  const edadP2P = useEdad(s?.p2p.buy?.as_of);

  const analisis = s?.analysis ?? null;
  const lectura = analisis?.reading ?? null;

  const alternar = (cual: keyof typeof FRAGMENTOS) => () => setFragmento((f) => (f === cual ? null : cual));

  const chips: { texto: string; tono: "sage" | "teal" | "coral" }[] = [];
  if (s !== null && analisis !== null) {
    const p2pAsOf = s.p2p.buy?.as_of ?? null;
    if (p2pAsOf !== null && edadP2P !== null) {
      const fresco = ahora !== null && ahora - Date.parse(p2pAsOf) <= UMBRAL_P2P_MS;
      chips.push({
        texto: t(fresco ? "lectura.chip.frescos" : "lectura.chip.viejos", { cuando: edadP2P }),
        tono: fresco ? "sage" : "coral",
      });
    }
    const reglas = reglasCumplidas(s);
    chips.push({
      texto: reglas === 1 ? t("lectura.chip.reglasUna") : t("lectura.chip.reglas", { n: reglas }),
      tono: reglas > 0 ? "teal" : "sage",
    });
    if (lectura !== null) {
      const cerca = lectura.gauges_near_threshold;
      chips.push({
        texto: cerca === 1 ? t("lectura.chip.cercaUno") : t("lectura.chip.cerca", { n: cerca }),
        tono: cerca > 0 ? "coral" : "sage",
      });
    }
    const outliers = s.p2p.buy?.outliers_pct;
    chips.push({
      texto: t(analisis.confidence === "low" ? "lectura.chip.confianzaBaja" : "lectura.chip.confianzaNormal", {
        outliers: outliers ? formatPct(outliers, 2, idioma) : "—",
      }),
      tono: analisis.confidence === "low" ? "coral" : "teal",
    });
  }

  return (
    <section className="lectura-hoy">
      <div className="lectura-cabecera">
        <span className="lectura-etiqueta">{t("lectura.etiqueta")}</span>
        {analisis !== null && <span className="lectura-sello">{t("lectura.al", { fecha: fechaVet(analisis.as_of, idioma) })}</span>}
        <span className="hueco" />
        <div className="lectura-botones">
          <button
            type="button"
            className={fragmento === "exportar" ? "boton-fragmento activo" : "boton-fragmento"}
            aria-expanded={fragmento === "exportar"}
            onClick={alternar("exportar")}
          >
            {t("lectura.exportar")}
          </button>
          <button
            type="button"
            className={fragmento === "alertas" ? "boton-fragmento activo" : "boton-fragmento"}
            aria-expanded={fragmento === "alertas"}
            onClick={alternar("alertas")}
          >
            {t("lectura.alertas")}
          </button>
        </div>
      </div>
      {fragmento !== null && (
        <div className="fragmento">
          <div className="fragmento-cabecera">
            <strong>{t(`lectura.${fragmento}.titulo`)}</strong>
            <span>{t(`lectura.${fragmento}.nota`)}</span>
            <span className="hueco" />
            <a href="/precios" className="chip chip-coral" onClick={irPrecios}>
              {t("lectura.empresa")}
            </a>
          </div>
          <pre>{FRAGMENTOS[fragmento]}</pre>
        </div>
      )}
      {analisis === null ? (
        <p className="lectura-prosa">{t("lectura.sinLectura")}</p>
      ) : (
        <>
          <div className="lectura-titulo">
            <span className="pulso" aria-hidden="true" />
            <h2>{lectura?.regime ? (REGIMENES[idioma][lectura.regime] ?? lectura.regime) : t("lectura.etiqueta")}</h2>
          </div>
          {lectura !== null && (
            <p className="lectura-prosa">
              {frasesLectura(lectura.claims, idioma)
                .map((f) => t(f.clave, f.params))
                .join(" ")}
            </p>
          )}
          <div className="lectura-chips">
            {chips.map((c) => (
              <span key={c.texto} className={`chip chip-${c.tono}`}>
                <span className={`punto punto-${c.tono}`} aria-hidden="true" />
                {c.texto}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// -- brecha, distancia al disparo y dos cifras ------------------------------------------

export function TarjetaBrecha() {
  const { t, idioma } = useI18n();
  const { snapshot, series } = useDatos();
  const s = snapshot.datos;
  const actualizado = useEdad(s?.gap?.as_of ?? s?.as_of);
  const brecha = s?.gap ?? null;
  const puntos = series.datos?.series.gap_buy_24h.points ?? [];
  const linea = puntosSparkline(puntos, 640, 110, 8);
  const rango = extremos(puntos);
  const delta = s === null ? null : deltaVsSieteDias(s);
  const usd = s === null ? null : tasaUsd(s);
  const vwap = s?.p2p.buy?.vwap ?? null;

  return (
    <div className="tarjeta-brecha">
      <div className="tarjeta-brecha-cabecera">
        <span>{t("brecha.titulo")}</span>
        {actualizado !== null && <span className="chip chip-cielo">{actualizado}</span>}
      </div>
      {brecha === null ? (
        <SinDatos />
      ) : (
        <>
          <div className="hero-cifra">
            <span className="brecha-cifra">{formatPct(brecha.pct, 2, idioma)}</span>
            <span className="hero-detalle">
              {brecha.abs !== null && (
                <span>{t("hero.sobreOficial", { abs: dosDecimales(brecha.abs, idioma) })}</span>
              )}
              {delta !== null && <span className="hero-delta">{t("hero.vs7", { delta: conSigno(delta, idioma) })}</span>}
            </span>
          </div>
          {linea !== "" && (
            <>
              <svg viewBox="0 0 640 110" preserveAspectRatio="none" className="chispa" role="img" aria-label={t("hero.sparkline")}>
                <polyline points={`0,110 ${linea} 640,110`} className="chispa-area" />
                <polyline points={linea} className="chispa-linea" />
              </svg>
              <div className="chispa-pie">
                <span>{t("brecha.24h")}</span>
                {rango !== null && (
                  <span>
                    {t("brecha.minMax", { min: formatPct(rango.min, 2, idioma), max: formatPct(rango.max, 2, idioma) })}
                  </span>
                )}
              </div>
            </>
          )}
          <div className="brecha-pie">
            {brecha.spread_pct !== null && <span>{t("brecha.spread", { v: formatPct(brecha.spread_pct, 2, idioma) })}</span>}
            {usd !== null && (
              <span>{t("brecha.oficial", { v: formatDecimal(usd, { maxDecimales: 4, minDecimales: 2, idioma }) })}</span>
            )}
            {vwap !== null && <span>{t("brecha.vwap", { v: dosDecimales(vwap, idioma) })}</span>}
          </div>
        </>
      )}
    </div>
  );
}

export function CifrasBrecha() {
  const { t, idioma } = useI18n();
  const { snapshot } = useDatos();
  const s = snapshot.datos;
  const vs30 = s === null ? null : deltaVsTreintaDias(s);
  const ratio = s?.analysis?.indicators.find((i) => i.indicator === "p2p_ratio_oferta_demanda") ?? null;
  const p50 = ratio?.scale.cuts.find((c) => c.key === "p50")?.value ?? null;
  return (
    <div className="cifras-brecha">
      <div className="cifra-tarjeta">
        <div className="cifra-tarjeta-etiqueta">{t("brecha.vs30")}</div>
        <div className="cifra-tarjeta-valor tono-sage">{vs30 === null ? "—" : `${conSigno(vs30.delta, idioma)} pts`}</div>
        {vs30 !== null && (
          <div className="cifra-tarjeta-detalle">{t("brecha.vs30Detalle", { media: formatPct(vs30.media, 2, idioma) })}</div>
        )}
      </div>
      <div className="cifra-tarjeta">
        <div className="cifra-tarjeta-etiqueta">{t("brecha.ratio")}</div>
        <div className="cifra-tarjeta-valor tono-teal">
          {ratio === null ? "—" : valorIndicador(ratio.value, ratio.indicator, idioma)}
        </div>
        {p50 !== null && <div className="cifra-tarjeta-detalle">{t("brecha.ratioDetalle", { p50: dosDecimales(p50, idioma) })}</div>}
      </div>
    </div>
  );
}

// -- panel de instrumentos ----------------------------------------------------------------

export function PanelInstrumentos() {
  const { t } = useI18n();
  const { snapshot } = useDatos();
  const s = snapshot.datos;
  const medidores = s === null ? [] : medidoresDashboard(s);
  return (
    <Seccion titulo={t("instrumentos.titulo")} sub={t("instrumentos.sub", { n: medidores.length || 6 })}>
      {medidores.length === 0 ? (
        <div className="panel">
          <SinDatos />
        </div>
      ) : (
        <div className="medidores medidores-dashboard">
          {medidores.map((m) => (
            <TarjetaMedidor key={m.indicator} m={m} />
          ))}
        </div>
      )}
    </Seccion>
  );
}

// -- brecha hoy vs. historia ------------------------------------------------------------------

export function PanelHistoria() {
  const { t, idioma } = useI18n();
  const { snapshot } = useDatos();
  const s = snapshot.datos;
  const filas = s === null ? [] : comparativasBrecha(s);
  const percentil = s === null ? null : percentilBrecha(s);
  return (
    <div className="panel">
      <div className="panel-titulo">{t("historia.panel")}</div>
      {filas.length === 0 ? (
        <SinDatos />
      ) : (
        <>
          <ul className="comparativas">
            {filas.map((f) => {
              const etiqueta = t(`historia.${f.clave}`);
              return (
                <li key={f.clave} className={`comparativa comparativa-${f.clave}`}>
                  <div className="comparativa-fila">
                    <span>{f.cubiertos === null ? etiqueta : t("historia.cubiertos", { etiqueta, n: f.cubiertos })}</span>
                    <span>{formatPct(f.valor, 2, idioma)}</span>
                  </div>
                  <div className="comparativa-pista">
                    <div className="comparativa-barra" style={{ width: `${f.ancho}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          {percentil !== null && s?.gap && (
            <p className="panel-nota">{t("historia.percentil", { v: formatPct(s.gap.pct, 2, idioma), p: percentil })}</p>
          )}
        </>
      )}
    </div>
  );
}

// -- mapa de calor -----------------------------------------------------------------------

export function MapaDeCalor() {
  const { t, idioma } = useI18n();
  const { series } = useDatos();
  const serie = series.datos?.series.gap_sell_14d ?? null;
  const lado = serie?.indicator.endsWith("_buy") ? "buy" : "sell";
  const mapa = mapaCalor(serie?.points ?? []);
  const fmt = (v: number) => formatPct(v.toFixed(2), 1, idioma);
  const etiquetaDia = (dia: string) => {
    const [, mes, d] = dia.split("-");
    return `${Number(d)}/${Number(mes)}`;
  };
  return (
    <Seccion titulo={t("calor.titulo")} sub={t("calor.sub", { lado })}>
      <div className="panel">
        {mapa.filas.length === 0 || mapa.p10 === null || mapa.p90 === null ? (
          <SinDatos />
        ) : (
          <>
            <div className="calor" role="img" aria-label={t("calor.aria", { lado })}>
              <div className="calor-horas" aria-hidden="true">
                <span />
                {Array.from({ length: 24 }, (_, h) => (
                  <span key={h}>{h % 3 === 0 ? h : ""}</span>
                ))}
              </div>
              {mapa.filas.map((fila) => (
                <div key={fila.dia} className="calor-fila">
                  <span className="calor-dia">{etiquetaDia(fila.dia)}</span>
                  {fila.celdas.map((v, h) => {
                    const hora = String(h).padStart(2, "0");
                    if (v === null) {
                      return <span key={h} className="calor-celda vacia" title={t("calor.vacia", { dia: fila.dia, hora })} />;
                    }
                    const { tono, intensidad } = tonoCalor(v, mapa.p10!, mapa.p90!);
                    return (
                      <span
                        key={h}
                        className={`calor-celda calor-${tono}`}
                        style={{ "--intensidad": intensidad.toFixed(2) } as CSSProperties}
                        title={t("calor.celda", { dia: fila.dia, hora, v: formatPct(v, 2, idioma) })}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="calor-leyenda">
              <span>{t("calor.p10", { v: fmt(mapa.p10) })}</span>
              <span className="calor-degradado" aria-hidden="true" />
              <span>{t("calor.p90", { v: fmt(mapa.p90) })}</span>
              <span>{t("calor.leyenda")}</span>
            </div>
          </>
        )}
      </div>
    </Seccion>
  );
}

// -- referencia P2P y procedencia ------------------------------------------------------------------

function LadoP2P({ lado, s }: { lado: "buy" | "sell"; s: Snapshot | null }) {
  const { t, idioma } = useI18n();
  const ref = s?.p2p[lado] ?? null;
  const precio = ref === null ? null : mejorPrecioP2P(ref);
  return (
    <div className="cifra-tarjeta">
      <div className="cifra-tarjeta-etiqueta-suave">{t(`p2p.${lado}`)}</div>
      {ref === null || precio === null ? (
        <div className="cifra-tarjeta-valor">—</div>
      ) : (
        <>
          <div className="cifra-tarjeta-valor">{dosDecimales(ref.median, idioma)}</div>
          <div className="cifra-tarjeta-detalle">
            {t("p2p.detalle", { vwap: dosDecimales(ref.vwap, idioma), mejor: dosDecimales(precio.mejor, idioma) })}
            <br />
            {t("p2p.liquidez", { v: formatDecimal(ref.volume, { maxDecimales: 0, idioma }) })}
            {precio.escaparate !== null && (
              <>
                <br />
                <span className="tono-coral">
                  {t("p2p.escaparate", { precio: dosDecimales(precio.escaparate, idioma) })}
                </span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function ReferenciaP2P() {
  const { t } = useI18n();
  const { snapshot } = useDatos();
  const s = snapshot.datos;
  return (
    <div className="panel">
      <div className="panel-titulo">{t("p2p.titulo")}</div>
      <div className="lados-p2p">
        <LadoP2P lado="buy" s={s} />
        <LadoP2P lado="sell" s={s} />
      </div>
    </div>
  );
}

// -- tasa oficial -----------------------------------------------------------------------------

/** Las cinco monedas que captura el ingestor del BCV, en el orden del diseño. */
const MONEDAS = ["USD", "EUR", "CNY", "TRY", "RUB"] as const;

export function TasaOficial() {
  const { t, idioma } = useI18n();
  const { snapshot } = useDatos();
  const s = snapshot.datos;
  const tasas = s?.official_rates ?? [];
  const usd = tasas.find((r) => r.currency === "USD") ?? tasas[0] ?? null;
  const capturada = useEdad(usd?.captured_at);
  const orden = (moneda: string) => {
    const i = MONEDAS.indexOf(moneda as (typeof MONEDAS)[number]);
    return i === -1 ? MONEDAS.length : i;
  };
  return (
    <Seccion
      titulo={t("oficial.titulo")}
      sub={usd === null ? undefined : t("oficial.sub", { fecha: usd.value_date, cuando: capturada ?? "—" })}
    >
      {tasas.length === 0 ? (
        <div className="panel">
          <SinDatos />
        </div>
      ) : (
        <div className="tasas">
          {[...tasas]
            .sort((a, b) => orden(a.currency) - orden(b.currency))
            .map((tasa) => (
              <div key={tasa.currency} className="cifra-tarjeta">
                <div className="cifra-tarjeta-etiqueta">{`${tasa.currency}/VES`}</div>
                <div className="cifra-tarjeta-valor">
                  {formatDecimal(tasa.rate, { maxDecimales: 4, minDecimales: 4, idioma })}
                </div>
                <div className={tasa.stale ? "cifra-tarjeta-detalle tono-coral" : "cifra-tarjeta-detalle"}>
                  {tasa.stale ? t("oficial.rancia") : t("oficial.vigente")}
                </div>
              </div>
            ))}
        </div>
      )}
    </Seccion>
  );
}

// -- cronología de señales ------------------------------------------------------------------------

function efecto(senal: Senal, idioma: Idioma): { delta: string; h: number } | null {
  return senal.outcome === null ? null : { delta: conSigno(senal.outcome.gap_delta_pp, idioma), h: senal.outcome.hours };
}

function GrupoCronologia({ grupo, abierto, alternar }: { grupo: GrupoSenales; abierto: boolean; alternar: () => void }) {
  const { t, idioma } = useI18n();
  const ultima = grupo.instancias[0];
  const cuando = useEdad(ultima.as_of);
  const efectoUltima = efecto(ultima, idioma);
  const regla = `${grupo.tipo}@v1`;
  const tono = grupo.direccion === "alcista" ? "teal" : grupo.direccion === "bajista" ? "coral" : "sage";
  const n = grupo.instancias.length;
  return (
    <li className="cronologia-grupo">
      <button
        type="button"
        className="cronologia-boton"
        aria-expanded={abierto}
        aria-label={t("senales.verDisparos", { regla })}
        onClick={alternar}
      >
        <span className="cronologia-titulo">
          <span className={`punto punto-${tono}`} aria-hidden="true" />
          <strong>{grupo.tipo.replaceAll("_", " ")}</strong>
          <span className={`chip chip-${tono}`}>{n === 1 ? t("senales.disparo") : t("senales.disparos", { n })}</span>
        </span>
        <span className="cronologia-signo" aria-hidden="true">
          {abierto ? "−" : "+"}
        </span>
        <span className="cronologia-detalle">
          <span>{regla}</span>
          <span>{t("senales.ultima", { cuando: cuando ?? fechaVet(ultima.as_of, idioma) })}</span>
          <span className="cronologia-efecto">
            {efectoUltima === null ? t("senales.sinEfecto") : t("senales.efecto", efectoUltima)}
          </span>
        </span>
      </button>
      {abierto && (
        <ol className="cronologia-instancias">
          {grupo.instancias.map((senal) => {
            const e = efecto(senal, idioma);
            return (
              <li key={senal.as_of} className="cronologia-instancia">
                <span className="cronologia-fecha">{fechaVet(senal.as_of, idioma)}</span>
                <span className={`tono-${tono}`}>{e === null ? t("senales.instSinEfecto") : t("senales.instEfecto", e)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </li>
  );
}

export function CronologiaSenales() {
  const { t } = useI18n();
  const { snapshot } = useDatos();
  const s = snapshot.datos;
  const [abierta, setAbierta] = useState<string | null>(null);
  const dias = s?.signals.window_days ?? 30;
  const grupos = s === null ? [] : gruposSenales(s.signals.items);
  return (
    <Seccion titulo={t("senales.titulo")} sub={t("senales.sub", { v: s?.ruleset_version ?? 1, dias })}>
      <div className="panel cronologia">
        {s === null ? (
          <SinDatos />
        ) : grupos.length === 0 ? (
          <p className="panel-nota">{t("senales.ninguna", { dias })}</p>
        ) : (
          <>
            <ul className="cronologia-grupos">
              {grupos.map((g) => (
                <GrupoCronologia
                  key={g.tipo}
                  grupo={g}
                  abierto={abierta === g.tipo}
                  alternar={() => setAbierta((a) => (a === g.tipo ? null : g.tipo))}
                />
              ))}
            </ul>
            <p className="panel-nota">{t("senales.nota")}</p>
          </>
        )}
      </div>
    </Seccion>
  );
}

// -- profundidad ------------------------------------------------------------------------------------

function LadoProfundidad({ lado, s }: { lado: "buy" | "sell"; s: Snapshot | null }) {
  const { t, idioma } = useI18n();
  const prof = s?.depth[lado] ?? null;
  const filas = prof === null ? [] : filasProfundidad(prof.levels);
  const total = filas.at(-1)?.volumen ?? null;
  return (
    <div className="panel">
      <div className="profundidad-cabecera">
        <span className={lado === "buy" ? "tono-teal" : "tono-coral"}>{t(`profundidad.${lado}`)}</span>
        {total !== null && (
          <span className="tono-dim">{t("profundidad.total", { v: formatDecimal(total, { maxDecimales: 0, idioma }) })}</span>
        )}
      </div>
      {filas.length === 0 ? (
        <SinDatos />
      ) : (
        <ul className="profundidad">
          {filas.map((f) => (
            <li key={f.precio} className="profundidad-fila">
              <span className="profundidad-precio">{formatDecimal(f.precio, { maxDecimales: 1, minDecimales: 1, idioma })}</span>
              <span className="profundidad-pista">
                <span className={`profundidad-barra profundidad-${lado}`} style={{ width: `${f.ancho}%` }} />
              </span>
              <span className="profundidad-volumen">{volumenCorto(f.volumen, idioma)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Profundidad() {
  const { t } = useI18n();
  const { snapshot } = useDatos();
  const s = snapshot.datos;
  return (
    <Seccion titulo={t("profundidad.titulo")} sub={t("profundidad.sub")}>
      <div className="dos-columnas">
        <LadoProfundidad lado="buy" s={s} />
        <LadoProfundidad lado="sell" s={s} />
      </div>
    </Seccion>
  );
}

