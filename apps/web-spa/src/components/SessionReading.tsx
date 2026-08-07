/**
 * «Lectura de la sesión» — bloque rector del Intradía.
 *
 * Dice, del día operativo en curso, qué hace el ruleset AHORA: qué regla está
 * más cerca, cuántas condiciones cumple y cuál la bloquea. Describe el presente
 * —igual que la lectura del dashboard (RF-6, ADR-0019/ADR-0021)—: no anticipa el
 * disparo ni sugiere qué hacer.
 *
 * Dos fuentes, cada una para lo suyo:
 *
 * - el **veredicto y las condiciones** vienen de `analisis` (`summary` y
 *   `rule_proximity`), calculados por el motor. La regla más cercana la decide
 *   `summary.closest_rule` y no este panel: recalcularla aquí crearía una segunda
 *   fuente de verdad que ya mordió una vez (ver `RuleDistance`);
 * - los **hechos de sesión** —apertura, transcurrido, liquidez— salen de las
 *   series que la vista ya trajo para el día operativo. Son de la sesión, que es
 *   de lo que este panel habla.
 *
 * Ninguna cifra se deriva aquí salvo la resta contra la apertura, que es la
 * misma que hace cada panel de la parrilla.
 */

import type { Analisis } from "../api/endpoints";
import type { Clave } from "../i18n/dict";
import { useI18n, type Traducir } from "../i18n/contexto";
import { formatDecimal } from "../lib/decimal";
import { formatearDelta, valorConUnidad } from "../lib/delta";
import { relativo } from "../lib/freshness";
import {
  etiquetaDiaVET,
  horaVET,
  resumenIntradia,
  type PuntoIntradia,
} from "../lib/intradia";
import { useMarket } from "../state/marketStore";

type Proximidad = Analisis["rule_proximity"][number];

/** Indicadores de sesión que alimentan las pastillas de hecho. */
const LIQUIDEZ = "p2p_liquidez_sell";
const MOMENTUM = "p2p_momentum_bid_3h_pct";

/** Sin plantilla: una clave construida en tiempo de ejecución se escapa del
 *  tipado del diccionario y del test de paridad ES/EN. */
const CLAVE_CONFIANZA = {
  normal: "sesion.confianzaNormal",
  low: "sesion.confianzaBaja",
} as const satisfies Record<Analisis["confidence"], Clave>;

export function SessionReading({
  series,
  ahora,
}: {
  series: Map<string, PuntoIntradia[]>;
  /** Inyectable para que las pruebas no dependan del reloj. */
  ahora?: Date;
}) {
  const { t, idioma } = useI18n();
  const { analisis } = useMarket();
  const instante = ahora ?? new Date();

  const cercana = reglaMasCercana(analisis);
  const apertura = aperturaDeSesion(series);
  const num = (v: string, d = 2) => formatDecimal(v, { maxDecimales: d, idioma });

  return (
    <section className="vmw-sesion" aria-label={t("sesion.titulo")}>
      <div className="vmw-sesion__fila1">
        <span className="vmw-sesion__eyebrow">{t("sesion.titulo")}</span>
        {/* La frase de día operativo vive AQUÍ, no suelta bajo los controles:
            apertura y transcurrido son contexto de esta lectura, no una nota. */}
        <span className="vmw-sesion__sello">
          {apertura === null
            ? t("sesion.selloSinSesion", { dia: etiquetaDiaVET(instante, idioma) })
            : t("sesion.sello", {
                dia: etiquetaDiaVET(instante, idioma),
                hora: horaVET(apertura),
                transcurrido: transcurrido(apertura, instante, t),
              })}
        </span>
        <span className="vmw-sesion__empuje" />
        <button
          type="button"
          className="vmw-sesion__accion"
          disabled={series.size === 0}
          onClick={() => exportarSesion(series, instante, t, idioma)}
        >
          {t("sesion.exportar")}
        </button>
        {/* Deshabilitada y explicándose, como «Crear alerta» del dashboard:
            vigilar una regla exige persistencia por usuario, evaluación en el
            motor y un canal de aviso — es una funcionalidad, no un botón
            (ADR-0021). Un botón que no hace nada sin decirlo es peor que no
            tenerlo. */}
        <button
          type="button"
          className="vmw-sesion__accion vmw-sesion__accion--coral"
          disabled
          title={t("sesion.vigilarNoDisponible")}
        >
          {t("sesion.vigilar")}
        </button>
      </div>

      <div className="vmw-sesion__fila2">
        <span className="vmw-sesion__punto" aria-hidden="true" />
        <h2 className="vmw-sesion__veredicto">{veredicto(analisis, cercana, t)}</h2>
      </div>

      <p className="vmw-sesion__prosa">{prosa(analisis, cercana, t, num)}</p>

      <div className="vmw-sesion__hechos">
        {hechos(analisis, cercana, series, t, num, idioma).map((hecho) => (
          <span className="vmw-sesion__hecho" key={hecho}>
            <i aria-hidden="true" />
            {hecho}
          </span>
        ))}
      </div>

      {cercana !== null && (
        <div className="vmw-sesion__condiciones">
          {cercana.conditions.map((condicion) => (
            <div
              className="vmw-sesion__condicion"
              key={condicion.indicator}
              data-cumple={condicion.met ? "si" : "no"}
            >
              {/* snake_case literal: es el nombre canónico del contrato y no se
                  traduce ni se maquilla. */}
              <span className="vmw-sesion__cond-nombre">{condicion.indicator}</span>
              <span className="vmw-sesion__cond-valor">
                {condicion.value === null ? "—" : num(condicion.value)}
              </span>
              <span className="vmw-sesion__cond-umbral">
                {t(
                  condicion.op === "gt" || condicion.op === "gte"
                    ? "sesion.necesitaPorEncima"
                    : "sesion.necesitaPorDebajo",
                  { umbral: num(condicion.threshold) },
                )}
                {" · "}
                {condicion.met
                  ? t("sesion.condCumple")
                  : condicion.distance === null
                    ? t("sesion.condSinValor")
                    : t("sesion.condFalta", { distancia: num(condicion.distance) })}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * La regla más cercana la decide el MOTOR (`summary.closest_rule`).
 *
 * Misma razón que en `RuleDistance`: recalcularla en el SPA daba dos paneles de
 * la misma app nombrando reglas distintas ante un empate.
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

/** Instante del primer bucket del día entre TODAS las series: cuándo empezó a
 *  haber dato, que es lo que abre la sesión. */
function aperturaDeSesion(series: Map<string, PuntoIntradia[]>): number | null {
  let primera: number | null = null;
  for (const puntos of series.values()) {
    const t = puntos[0]?.t;
    if (t !== undefined && (primera === null || t < primera)) {
      primera = t;
    }
  }
  return primera;
}

function transcurrido(
  desde: number,
  hasta: Date,
  t: Traducir,
): string {
  const minutos = Math.max(0, Math.floor((hasta.getTime() - desde) / 60_000));
  const horas = Math.floor(minutos / 60);
  return horas === 0
    ? t("sesion.transcurridoM", { m: minutos })
    : t("sesion.transcurridoHm", { h: horas, m: minutos % 60 });
}

/** Qué dice el ruleset, en caja de oración. Nunca qué va a pasar. */
function veredicto(
  analisis: Analisis | null,
  cercana: Proximidad | null,
  t: Traducir,
): string {
  if (analisis === null) {
    return t("sesion.veredictoSinAnalisis");
  }
  const cumplidas = analisis.summary.rules_met;
  if (cumplidas.length > 0) {
    return t("sesion.veredictoCumple", {
      regla: legible(cumplidas[0]),
      n: cumplidas.length,
    });
  }
  if (cercana === null) {
    return t("sesion.veredictoSinRegla");
  }
  return t("sesion.veredictoCerca", {
    regla: legible(cercana.rule),
    cumplidas: cercana.conditions_met,
    totales: cercana.conditions_total,
  });
}

/** El término técnico y su consecuencia en la misma frase. */
function prosa(
  analisis: Analisis | null,
  cercana: Proximidad | null,
  t: Traducir,
  num: (v: string, d?: number) => string,
): string {
  if (analisis === null || cercana === null) {
    return t("sesion.prosaSinRegla");
  }
  if (cercana.blocked_by === null) {
    return t("sesion.prosaSinBloqueo", { regla: legible(cercana.rule) });
  }
  const condicion = cercana.conditions.find(
    (c) => c.indicator === cercana.blocked_by,
  );
  if (condicion === undefined || condicion.distance === null) {
    return t("sesion.prosaBloqueoSinDistancia", {
      indicador: cercana.blocked_by,
    });
  }
  return t(
    condicion.op === "gt" || condicion.op === "gte"
      ? "sesion.prosaFaltaSubir"
      : "sesion.prosaFaltaBajar",
    {
      indicador: cercana.blocked_by,
      umbral: num(condicion.threshold),
      distancia: num(condicion.distance),
    },
  );
}

/** Un hecho por pastilla, cada uno con su fuente declarada. */
function hechos(
  analisis: Analisis | null,
  cercana: Proximidad | null,
  series: Map<string, PuntoIntradia[]>,
  t: Traducir,
  num: (v: string, d?: number) => string,
  idioma: "es" | "en",
): string[] {
  const lista: string[] = [];

  if (cercana !== null) {
    lista.push(
      t("sesion.hechoCondiciones", {
        cumplidas: cercana.conditions_met,
        totales: cercana.conditions_total,
      }),
    );
  }

  const liquidez = resumenIntradia(series.get(LIQUIDEZ) ?? []);
  if (liquidez !== null) {
    lista.push(
      t("sesion.hechoLiquidez", {
        valor: valorConUnidad(liquidez.ultimo, {
          unidad: "USDT",
          decimales: 0,
          idioma,
        }),
        // Por la función común: el mismo signo y el mismo menos que el resto.
        delta: formatearDelta(liquidez, {
          decimales: 0,
          idioma,
          sinCambio: t("delta.sinCambio"),
        }).texto,
      }),
    );
  }

  const momentum = resumenIntradia(series.get(MOMENTUM) ?? []);
  if (momentum !== null) {
    lista.push(
      t("sesion.hechoMomentum", { valor: num(momentum.ultimo) }),
    );
  }

  if (analisis !== null) {
    const { clave, n } = relativo(analisis.as_of);
    lista.push(
      t("sesion.hechoFrescura", {
        cuando: t(clave, { n }),
        confianza: t(CLAVE_CONFIANZA[analisis.confidence]),
      }),
    );
  }

  return lista;
}

/** `arranque_alcista@v1` → `arranque alcista`. La versión se conserva en la
 *  rejilla de condiciones; el titular no la necesita. */
function legible(regla: string): string {
  return regla.split("@")[0].replaceAll("_", " ");
}

/**
 * Vuelca la sesión completa: una fila por indicador y bucket, con el valor
 * EXACTO del contrato. No agrega ni redondea — quien exporta quiere el dato,
 * no la presentación.
 */
function exportarSesion(
  series: Map<string, PuntoIntradia[]>,
  ahora: Date,
  t: Traducir,
  idioma: "es" | "en",
): void {
  const filas: string[][] = [
    [
      t("sesion.csv.indicador"),
      t("sesion.csv.instante"),
      t("sesion.csv.horaVet"),
      t("sesion.csv.valor"),
    ],
  ];
  for (const nombre of [...series.keys()].sort()) {
    for (const punto of series.get(nombre) ?? []) {
      filas.push([
        nombre,
        new Date(punto.t).toISOString(),
        horaVET(punto.t),
        punto.valor,
      ]);
    }
  }
  descargar(
    filas.map((f) => f.map(entrecomillar).join(",")).join("\r\n"),
    `criterio-sesion-${etiquetaArchivo(ahora)}.csv`,
    idioma,
  );
}

/** Comillas siempre: los nombres canónicos no llevan comas hoy, pero un
 *  separador nuevo en el contrato no debe romper el CSV en silencio. */
function entrecomillar(valor: string): string {
  return `"${valor.replaceAll('"', '""')}"`;
}

function etiquetaArchivo(ahora: Date): string {
  return new Date(ahora.getTime() - 240 * 60_000).toISOString().slice(0, 10);
}

function descargar(contenido: string, nombre: string, _idioma: "es" | "en"): void {
  // BOM para que Excel en Windows abra el UTF-8 sin destrozar los acentos.
  const blob = new Blob(["﻿", contenido], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}
