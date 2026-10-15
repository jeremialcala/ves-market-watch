/**
 * Los paneles en vivo de la landing (RF-1). Cada uno lee del snapshot y, sin
 * dato, lo dice en su sitio: un panel vacío nunca se rellena con un ejemplo.
 */

import { formatDecimal, formatPct, restarDecimales, type Idioma } from "@criterio/ui";
import type { ReactNode } from "react";

import type { Medidor, Snapshot } from "../api/cliente";
import { useAhora, useDatos } from "../datos/contexto";
import { useEdad } from "../datos/useEdad";
import { useI18n } from "../i18n/contexto";
import { REGIMENES } from "../i18n/dict";
import {
  conSigno,
  cuotaOficial,
  deltaVsSieteDias,
  descomposicion,
  medidoresLanding,
  menos,
  operador,
  puntosSparkline,
  reglaCercana,
  tasaUsd,
  valorIndicador,
  vistaMedidor,
} from "../lib/lectura";
import { useClicInterno } from "../router/contexto";

export function SinDatos() {
  const { t } = useI18n();
  return (
    <div className="sin-datos">
      <strong>{t("comun.sinDatos")}</strong>
      <span>{t("comun.sinDatosDetalle")}</span>
    </div>
  );
}

function Pulso() {
  return <span className="pulso" aria-hidden="true" />;
}

export function Cabecera({ children }: { children: ReactNode }) {
  return (
    <div className="panel-cabecera">
      <Pulso />
      <span>{children}</span>
    </div>
  );
}

// -- hero ------------------------------------------------------------------------

export function TarjetaHero() {
  const { t, idioma } = useI18n();
  const { snapshot, series } = useDatos();
  const s = snapshot.datos;
  const irDashboard = useClicInterno("/dashboard");
  const actualizado = useEdad(s?.as_of);

  const brecha = s?.gap ?? null;
  const delta = s === null ? null : deltaVsSieteDias(s);
  const regimen = s?.analysis?.reading?.regime ?? null;
  const usd = s === null ? null : tasaUsd(s);
  const vwap = s?.p2p.buy?.vwap ?? null;
  const puntos = series.datos?.series.gap_buy_24h.points ?? [];
  const linea = puntosSparkline(puntos, 640, 110);

  return (
    <a href="/dashboard" className="tarjeta-hero" onClick={irDashboard}>
      <Cabecera>{t("hero.tarjeta")}</Cabecera>
      {brecha === null ? (
        <SinDatos />
      ) : (
        <>
          <span className="hero-cifra">
            <span className="hero-brecha">{formatPct(brecha.pct, 2, idioma)}</span>
            <span className="hero-detalle">
              {brecha.abs !== null && (
                <span>{t("hero.sobreOficial", { abs: formatDecimal(brecha.abs, { maxDecimales: 2, minDecimales: 2, idioma }) })}</span>
              )}
              {delta !== null && (
                <span className="hero-delta">{t("hero.vs7", { delta: conSigno(delta, idioma) })}</span>
              )}
            </span>
          </span>
          {regimen !== null && (
            <span className="hero-regimen">
              <span className="punto" aria-hidden="true" />
              {REGIMENES[idioma][regimen] ?? regimen}
            </span>
          )}
        </>
      )}
      {linea !== "" && (
        <svg viewBox="0 0 640 110" preserveAspectRatio="none" className="chispa" role="img" aria-label={t("hero.sparkline")}>
          <polyline points={`0,110 ${linea} 640,110`} className="chispa-area" />
          <polyline points={linea} className="chispa-linea" />
        </svg>
      )}
      <span className="hero-cifras">
        <Cifra etiqueta={t("hero.oficial")} valor={usd === null ? "—" : formatDecimal(usd, { maxDecimales: 4, minDecimales: 2, idioma })} />
        <Cifra etiqueta={t("hero.vwap")} valor={vwap === null ? "—" : formatDecimal(vwap, { maxDecimales: 2, minDecimales: 2, idioma })} />
        <Cifra etiqueta={t("hero.actualizado")} valor={actualizado ?? "—"} />
      </span>
    </a>
  );
}

export function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <span className="cifra">
      <span className="cifra-etiqueta">{etiqueta}</span>
      <span className="cifra-valor">{valor}</span>
    </span>
  );
}

// -- 01 · procedencia -----------------------------------------------------------------

const UMBRAL_P2P_MS = 20 * 60 * 1000; // la frescura P2P del gateway

export function PanelProcedencia() {
  const { t, idioma } = useI18n();
  const { snapshot } = useDatos();
  const ahora = useAhora();
  const s = snapshot.datos;
  const p2p = s?.p2p.buy ?? null;
  const usd = s?.official_rates.find((tasa) => tasa.currency === "USD") ?? null;
  const edadP2P = useEdad(p2p?.as_of);
  const edadOficial = useEdad(usd?.captured_at);

  if (s === null || (p2p === null && usd === null)) {
    return (
      <div className="panel">
        <Cabecera>{t("procedencia.panel")}</Cabecera>
        <SinDatos />
      </div>
    );
  }
  const p2pFresco =
    p2p !== null && ahora !== null && ahora - Date.parse(p2p.as_of) <= UMBRAL_P2P_MS;
  const filas: { etiqueta: string; valor: string; tono: "sage" | "coral" | "teal" | "dim" }[] = [];
  if (p2p !== null) {
    filas.push({ etiqueta: t("procedencia.snapshot"), valor: edadP2P ?? "—", tono: p2pFresco ? "sage" : "coral" });
  }
  if (usd !== null) {
    filas.push({
      etiqueta: t("procedencia.oficial"),
      valor: `${edadOficial ?? "—"} · ${usd.stale ? t("procedencia.rancia") : t("procedencia.vigente")}`,
      tono: usd.stale ? "coral" : "sage",
    });
  }
  if (p2p?.outliers_pct) {
    filas.push({ etiqueta: t("procedencia.outliers"), valor: `${formatPct(p2p.outliers_pct, 2, idioma)} · MAD/IQR`, tono: "sage" });
  }
  if (p2p?.merchants_pct) {
    filas.push({
      etiqueta: t("procedencia.merchants"),
      valor: t("procedencia.delVolumen", { pct: formatPct(p2p.merchants_pct, 2, idioma) }),
      tono: "teal",
    });
  }
  if (s.calc_version !== null) {
    filas.push({
      etiqueta: t("procedencia.motor"),
      valor: t("vivo.version", { calc: s.calc_version, ruleset: s.ruleset_version ?? "—" }),
      tono: "dim",
    });
  }
  return (
    <div className="panel">
      <Cabecera>{t("procedencia.panel")}</Cabecera>
      <dl className="procedencia">
        {filas.map((fila) => (
          <div key={fila.etiqueta} className="procedencia-fila">
            <dt>
              <span className={`punto punto-${fila.tono}`} aria-hidden="true" />
              {fila.etiqueta}
            </dt>
            <dd>{fila.valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// -- 02 · anticipación ----------------------------------------------------------------

export function PanelAnticipacion() {
  const { t, idioma } = useI18n();
  const { snapshot } = useDatos();
  const s = snapshot.datos;
  const regla = s === null ? null : reglaCercana(s);
  if (regla === null) {
    return (
      <div className="panel">
        <Cabecera>{t("anticipacion.panel")}</Cabecera>
        <SinDatos />
      </div>
    );
  }
  let nota: string;
  if (!regla.evaluable) {
    nota = t("anticipacion.noEvaluable");
  } else if (regla.conditions_met === regla.conditions_total) {
    nota = t("anticipacion.todas");
  } else {
    nota = t("anticipacion.bloquea", { indicador: regla.blocked_by ?? "—" });
  }
  return (
    <div className="panel">
      <Cabecera>{t("anticipacion.panel")}</Cabecera>
      <div className="regla-titulo">
        <span className="regla-nombre">{regla.rule}</span>
        <span className="chip chip-sage">
          {t("anticipacion.conteo", { cumplidas: regla.conditions_met, totales: regla.conditions_total })}
        </span>
      </div>
      <ul className="condiciones">
        {regla.conditions.map((c) => (
          <li key={c.indicator} className="condicion">
            <span className="condicion-nombre">{c.indicator}</span>
            <span className={c.met ? "condicion-estado cumple" : "condicion-estado"}>
              {c.met
                ? t("anticipacion.cumple")
                : c.distance === null
                  ? t("anticipacion.sinValor")
                  : t("anticipacion.falta", { d: valorIndicador(c.distance.replace("-", ""), c.indicator, idioma) })}
            </span>
            <span className="condicion-valor">{c.value === null ? "—" : valorIndicador(c.value, c.indicator, idioma)}</span>
            <span className="condicion-umbral">
              {t("anticipacion.necesita", { op: operador(c.op), umbral: valorIndicador(c.threshold, c.indicator, idioma) })}
            </span>
          </li>
        ))}
      </ul>
      <p className="panel-nota">{nota}</p>
    </div>
  );
}

// -- 03 · contexto --------------------------------------------------------------------

export function Medidores() {
  const { snapshot } = useDatos();
  const s = snapshot.datos;
  const medidores = s === null ? [] : medidoresLanding(s);
  if (medidores.length === 0) {
    return (
      <div className="panel">
        <SinDatos />
      </div>
    );
  }
  return (
    <div className="medidores">
      {medidores.map((m) => (
        <TarjetaMedidor key={m.indicator} m={m} />
      ))}
    </div>
  );
}

/** Los cortes de la escala, sin unidad y con dos decimales: «0,00», no «0». */
function corte(valor: string | null, idioma: Idioma): string {
  return valor === null ? "—" : menos(formatDecimal(valor, { maxDecimales: 2, minDecimales: 2, idioma }));
}

export function TarjetaMedidor({ m }: { m: Medidor }) {
  const { t, idioma } = useI18n();
  const vista = vistaMedidor(m);
  const cumple = vista.regla?.cumple === true;
  const etiqueta = t(`medidor.${m.indicator}` as Parameters<typeof t>[0]);
  // Sin posición ni cortes (p. ej. los outliers, `unscaled`) no hay escala que
  // dibujar: una barra vacía diría «0» donde no se sabe nada.
  const sinEscala = m.position === null && m.scale.cuts.length === 0;
  let nota: string;
  if (vista.guarda !== null) {
    nota = t("medidor.guarda", { v: valorIndicador(vista.guarda.valor, m.indicator, idioma) });
  } else if (vista.regla === null) {
    nota = sinEscala ? t("medidor.sinEscala") : t("contexto.sinRegla");
  } else if (vista.regla.cumple) {
    nota = t("contexto.cumple", { regla: vista.regla.nombre });
  } else {
    nota = t("contexto.distancia", {
      d: valorIndicador(vista.regla.distancia, m.indicator, idioma),
      regla: vista.regla.nombre,
    });
  }
  return (
    <div className={cumple ? "medidor medidor-alerta" : "medidor"}>
      <div className="medidor-cabecera">
        <span className="medidor-etiqueta">{etiqueta}</span>
        <span className={cumple ? "chip chip-coral" : "chip chip-teal"}>{t(`banda.${m.band}`)}</span>
      </div>
      <div className="medidor-valor">
        <span className="medidor-cifra">{valorIndicador(m.value, m.indicator, idioma)}</span>
        {vista.percentil !== null && (
          <span className="medidor-percentil">{t("contexto.percentil", { p: vista.percentil })}</span>
        )}
      </div>
      {!sinEscala && (
        <>
          <div className="escala" aria-hidden="true">
            <div className="escala-pista">
              {vista.zona !== null && (
                <div className="escala-zona" style={{ left: `${vista.zona.izquierda}%`, width: `${vista.zona.ancho}%` }} />
              )}
            </div>
            {vista.umbral !== null && <div className="escala-umbral" style={{ left: `${vista.umbral}%` }} />}
            <div className="escala-marcador" style={{ left: `${vista.marcador}%` }} />
          </div>
          <div className="escala-cortes">
            <span>{corte(vista.cortes.bajo, idioma)}</span>
            <span>{corte(vista.cortes.medio, idioma)}</span>
            <span>{corte(vista.cortes.alto, idioma)}</span>
          </div>
        </>
      )}
      <p className="medidor-nota">{nota}</p>
    </div>
  );
}

// -- 04 · explicación ------------------------------------------------------------------

export function PanelExplicacion() {
  const { t, idioma } = useI18n();
  const { snapshot } = useDatos();
  const s: Snapshot | null = snapshot.datos;
  const partes = s === null ? null : descomposicion(s);
  if (s === null || partes === null) {
    return (
      <div className="panel">
        <SinDatos />
      </div>
    );
  }
  const piernas = s.analysis?.gap_legs ?? null;
  const fmt = (v: string) => formatDecimal(v, { maxDecimales: 2, minDecimales: 2, idioma });
  let texto: string | null = null;
  if (piernas !== null) {
    const h = piernas.hours;
    const cuota = cuotaOficial(piernas.official_share);
    if (piernas.responsible === "oficial" && cuota !== null) {
      texto = t("explicacion.oficialMueve", { h, pct: `${cuota} %` });
    } else if (piernas.responsible === "paralelo") {
      texto = t("explicacion.paraleloMueve", { h });
    } else if (piernas.responsible === "ambos") {
      texto = t("explicacion.ambasMueven", { h });
    } else {
      texto = t("explicacion.quieta", { h });
    }
  }
  return (
    <div className="panel">
      <div className="explicacion-cabecera">
        <span>{t("explicacion.oficial", { v: formatDecimal(partes.oficial, { maxDecimales: 4, minDecimales: 2, idioma }) })}</span>
        <span>{t("explicacion.vwap", { v: fmt(partes.vwap) })}</span>
      </div>
      <div className="barra-piernas">
        <div className="pierna-oficial" style={{ width: `${partes.pctOficial}%` }}>
          {t("explicacion.piernaOficial")}
        </div>
        <div className="pierna-brecha" style={{ width: `${partes.pctBrecha}%` }}>
          {t("explicacion.brecha")}
        </div>
      </div>
      {piernas !== null && piernas.official !== null && piernas.parallel !== null && (
        <div className="piernas-cifras">
          <Cifra etiqueta={t("explicacion.oficialH", { h: piernas.hours })} valor={`${conSigno(piernas.official, idioma)} VES`} />
          <Cifra etiqueta={t("explicacion.paraleloH", { h: piernas.hours })} valor={`${conSigno(piernas.parallel, idioma)} VES`} />
          <Cifra
            etiqueta={t("explicacion.neto")}
            valor={`${conSigno(restarDecimales(piernas.parallel, piernas.official), idioma)} VES`}
          />
        </div>
      )}
      {texto !== null && <p className="panel-nota">{texto}</p>}
    </div>
  );
}
