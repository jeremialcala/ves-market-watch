import type { CSSProperties } from "react";

import type { Clave } from "../i18n/dict";
import { useI18n } from "../i18n/contexto";
import {
  compararDecimales,
  formatDecimal,
  formatPct,
  restarDecimales,
  signo,
  toChartNumber,
} from "../lib/decimal";
import { porcentajeDeMaximo } from "../lib/series";
import { useMarket } from "../state/marketStore";
import type { PayloadAnalisis } from "../ws/messages";
import { NoDataState } from "./NoDataState";

type GapHistory = NonNullable<PayloadAnalisis["gap_history"]>;
type LadoHistoria = GapHistory["sides"][number];
type Referencia = LadoHistoria["references"][number];
type Claim = NonNullable<PayloadAnalisis["reading"]>["claims"][number];
type GapLegs = NonNullable<PayloadAnalisis["gap_legs"]>;

/**
 * Descomposición de la brecha + comparativa contra la historia.
 *
 * Las dos mitades son dato REAL y ninguna se calcula aquí:
 *  · la barra parte el precio P2P en «pierna oficial» + «brecha» con la tasa
 *    oficial vigente y el VWAP de compra;
 *  · las referencias 7/30/90 llegan del contrato (`gap_history`), no de una
 *    media hecha en el cliente. El SPA solo dibuja y redacta.
 *
 * Lo que esta tarjeta hace distinto del resto: **rotula el tramo REAL** de cada
 * ventana. `days_covered < days_configured` significa que la serie no alcanza la
 * ventana pedida, y entonces la fila dice «Promedio 12 d (de 30)». Antes decía
 * «Promedio 30 días» sobre 12 días de historia: el número era real y la etiqueta
 * no.
 */
export function GapDecomposition() {
  const { t, idioma } = useI18n();
  const { tasas, p2p, analisis } = useMarket();

  const oficial = tasas["USD"];
  const vwapBuy = p2p.buy?.vwap;

  const anchoOficial =
    oficial !== undefined && vwapBuy !== undefined
      ? Math.min(
          100,
          Math.max(0, (toChartNumber(oficial.rate) / toChartNumber(vwapBuy)) * 100),
        )
      : null;

  const lados = analisis?.gap_history?.sides ?? [];
  const claims = analisis?.reading?.claims ?? [];
  const frases = claims
    .map((claim) => fraseDeHistoria(claim, t, idioma))
    .filter((frase): frase is string => frase !== null);

  // Las dos piernas del movimiento, tal como las midió el MOTOR.
  //
  // Vienen de `gap_legs` y NO del claim `atribucion` (ADR-0023). Cuando vivían
  // dentro del claim desaparecían con él: con la brecha estable o la oficial
  // rancia la tarjeta se quedaba en blanco, justo cuando el usuario quiere
  // comprobar que no está pasando nada. Las deltas son hechos; el responsable
  // es la afirmación, y ese sí puede faltar.
  const piernas = analisis?.gap_legs ?? null;

  return (
    <section className="vmw-seccion" aria-label={t("descomposicion.titulo")}>
      <div className="vmw-seccion__cabecera">
        <h3 className="vmw-seccion__titulo">{t("descomposicion.titulo")}</h3>
        <span className="vmw-seccion__bajada">{t("descomposicion.bajada")}</span>
      </div>

      <div className="vmw-grid" style={{ "--min": "360px" } as CSSProperties}>
        <div className="vmw-tarjeta vmw-tarjeta--reparte">
          {anchoOficial === null ? (
            <NoDataState detalle={t("descomposicion.sinPiernas")} />
          ) : (
            <>
              <div className="vmw-descomp__cifras">
                <span>
                  {t("brecha.oficialPar", {
                    valor: formatDecimal(oficial.rate, { maxDecimales: 4, idioma }),
                  })}
                </span>
                <span>
                  {t("brecha.vwap", {
                    valor: formatDecimal(vwapBuy, { maxDecimales: 2, idioma }),
                  })}
                </span>
              </div>
              <div className="vmw-descomp__barra">
                <div
                  className="vmw-descomp__pierna"
                  style={{ width: `${anchoOficial.toFixed(1)}%` }}
                >
                  {t("descomposicion.piernaOficial")}
                </div>
                <div
                  className="vmw-descomp__hueco"
                  style={{ width: `${(100 - anchoOficial).toFixed(1)}%` }}
                >
                  {t("descomposicion.brecha")}
                </div>
              </div>
              {piernas === null ? (
                // Sin ninguna pierna medible NO se rellena con una explicación
                // genérica: hubo hueco de captura y no hay reparto que contar.
                <p className="vmw-nota" style={{ marginTop: "20px" }}>
                  {t("descomposicion.sinPiernasMedibles")}
                </p>
              ) : (
                <Piernas piernas={piernas} />
              )}
              {frases.length > 0 && (
                <p className="vmw-nota vmw-descomp__interpretacion vmw-al-fondo">
                  {frases.join(" ")}
                </p>
              )}
            </>
          )}
        </div>

        <div className="vmw-tarjeta">
          <div className="vmw-eyebrow">{t("descomposicion.comparativas")}</div>
          {lados.length === 0 ? (
            <NoDataState detalle={t("descomposicion.sinHistoria")} />
          ) : (
            <div className="vmw-descomp__lados">
              {lados.map((lado) => (
                <BloqueLado key={lado.side} lado={lado} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Las dos piernas del movimiento y su neto, en VES absolutos.
 *
 * La unidad no es decorativa: `Δbrecha_abs = Δparalelo − Δoficial` es exacta
 * SOLO en VES: en puntos porcentuales las dos piernas no suman la brecha. Por
 * eso el motor publica estas dos en VES aunque clasifique el eje en pp, y por
 * eso el neto se resta aquí con BigInt y no se pide aparte — es una identidad,
 * no una tercera medición que pudiera discrepar de las otras dos.
 *
 * La pierna que el motor señala como responsable va destacada. La decide él
 * (`responsable`), no este panel: recalcularla sería la misma doble fuente de
 * verdad que ya obligó a `RuleDistance` a usar `summary.closest_rule`.
 */
function Piernas({ piernas }: { piernas: GapLegs }) {
  const { t, idioma } = useI18n();

  const { official: oficial, parallel: paralelo, responsible, hours } = piernas;
  const horas = String(hours);

  // El NETO es la identidad `Δparalelo − Δoficial`, no una tercera medición: por
  // eso el contrato no lo trae y se deriva aquí con BigInt. Si una de las dos
  // piernas no se pudo medir, tampoco hay neto — restar contra un hueco daría
  // una cifra falsa con toda la pinta de ser buena.
  const neto =
    oficial === null || paralelo === null
      ? null
      : restarDecimales(paralelo, oficial);

  const filas = [
    {
      etiqueta: t("descomposicion.movOficial", { horas }),
      valor: oficial,
      culpable: responsible === "oficial" || responsible === "ambos",
    },
    {
      etiqueta: t("descomposicion.movP2P", { horas }),
      valor: paralelo,
      culpable: responsible === "paralelo" || responsible === "ambos",
    },
    { etiqueta: t("descomposicion.movNeto"), valor: neto, culpable: false },
  ];

  return (
    <div className="vmw-descomp__piernas">
      {filas.map((fila) => (
        <div key={fila.etiqueta}>
          <span className="vmw-descomp__pierna-et">{fila.etiqueta}</span>
          <span
            className="vmw-descomp__pierna-val"
            data-responsable={fila.culpable ? "si" : undefined}
          >
            {/* Una pierna no medible sale como «—», jamás rellenada con cero:
                cero significa que NO se movió, que es otra cosa. */}
            {fila.valor === null
              ? "—"
              : t("descomposicion.movValor", {
                  valor: conSigno(fila.valor, idioma),
                })}
          </span>
        </div>
      ))}
    </div>
  );
}

/** `+26,9` / `−19,3`: el signo se escribe siempre, también el «+». */
function conSigno(valor: string, idioma: "es" | "en"): string {
  const texto = formatDecimal(valor, { maxDecimales: 2, idioma });
  return signo(valor) > 0 ? `+${texto}` : texto;
}

/** Un lado con su valor de hoy y sus referencias, cada una en su tramo real. */
function BloqueLado({ lado }: { lado: LadoHistoria }) {
  const { t, idioma } = useI18n();

  // Cada ventana aporta su MEDIA; la más ancha aporta además su MÁXIMO.
  //
  // La media va siempre porque es la cifra que cita la prosa del motor
  // («7,70 puntos por debajo de su promedio de 90 días»): si no estuviera a la
  // vista, esa frase sería incomprobable — y peor, restar el máximo daría otro
  // número y la tarjeta parecería contradecirse.
  const filas: { etiqueta: string; valor: string | null; tono: Tono }[] = [
    { etiqueta: t("descomposicion.hoy"), valor: lado.current, tono: "hoy" },
    ...lado.references.flatMap((referencia) => [
      {
        etiqueta: etiquetaMedia(referencia, t),
        valor: referencia.mean,
        tono: "media" as Tono,
      },
      ...(esVentanaAncha(referencia)
        ? [
            {
              etiqueta: etiquetaMaximo(referencia, t),
              valor: referencia.max,
              tono: "maximo" as Tono,
            },
          ]
        : []),
    ]),
  ];

  // La barra más larga es la referencia visual; sin ella no hay proporción que
  // dibujar y las barras se quedan a cero.
  const maximo = filas
    .map((f) => f.valor)
    .filter((v): v is string => v !== null)
    .reduce<string | null>(
      (max, v) => (max === null || compararDecimales(v, max) === 1 ? v : max),
      null,
    );

  const parcial = lado.references.find(
    (r) => r.days_covered < r.days_configured,
  );

  return (
    <div>
      <div className="vmw-descomp__lado">
        {t(lado.side === "buy" ? "descomposicion.ladoCompra" : "descomposicion.ladoVenta")}
      </div>
      <div className="vmw-descomp__filas">
        {filas.map((fila) => (
          <div key={fila.etiqueta}>
            <div className="vmw-descomp__fila">
              <span>{fila.etiqueta}</span>
              <span className="vmw-descomp__valor">
                {fila.valor === null ? "—" : formatPct(fila.valor, 2, idioma)}
              </span>
            </div>
            <div className="vmw-barra" style={{ marginTop: "7px" }}>
              <div
                className="vmw-barra__relleno"
                style={{
                  width:
                    fila.valor === null || maximo === null
                      ? "0%"
                      : porcentajeDeMaximo(fila.valor, maximo),
                  background: COLOR_FILA[fila.tono],
                }}
              />
            </div>
          </div>
        ))}
      </div>
      {parcial !== undefined && (
        <p className="vmw-nota vmw-descomp__parcial">
          {t("descomposicion.tramoParcial", {
            cubiertos: String(parcial.days_covered),
          })}
        </p>
      )}
    </div>
  );
}

type Tono = "hoy" | "media" | "maximo";

/**
 * Hoy destaca, las medias se atenúan y el MÁXIMO va en coral.
 *
 * El coral no es adorno: marca el extremo, exactamente el mismo significado que
 * tiene en el mapa de calor (por encima del p90). Que la misma pregunta —«¿esto
 * es lo alto que llega?»— se responda con el mismo color en las dos tarjetas es
 * lo que permite leerlas juntas.
 */
const COLOR_FILA: Record<Tono, string> = {
  hoy: "var(--series-buy)",
  media: "var(--teal-dim)",
  maximo: "var(--coral)",
};

/**
 * El máximo se muestra solo en la ventana más ancha.
 *
 * Responde otra pregunta que la media: cuán lejos se está del peor momento
 * conocido. En las ventanas cortas aporta poco y multiplicaría las filas.
 */
function esVentanaAncha(referencia: Referencia): boolean {
  return referencia.days_configured >= 90;
}

/** Las etiquetas declaran el TRAMO REAL cuando la serie no llega a la ventana. */
function etiquetaMedia(
  referencia: Referencia,
  t: (clave: Clave, params?: Record<string, string>) => string,
): string {
  const dias = String(referencia.days_configured);
  const cubiertos = String(referencia.days_covered);
  return completa(referencia)
    ? t("descomposicion.media", { dias })
    : t("descomposicion.mediaParcial", { dias, cubiertos });
}

function etiquetaMaximo(
  referencia: Referencia,
  t: (clave: Clave, params?: Record<string, string>) => string,
): string {
  const dias = String(referencia.days_configured);
  const cubiertos = String(referencia.days_covered);
  return completa(referencia)
    ? t("descomposicion.maximo", { dias })
    : t("descomposicion.maximoParcial", { dias, cubiertos });
}

function completa(referencia: Referencia): boolean {
  return referencia.days_covered >= referencia.days_configured;
}

/**
 * Una frase por claim de historia, en el orden que manda el motor.
 *
 * Los claims que no son de historia devuelven `null`: los redacta
 * `MarketRegimeCard`, y repetirlos aquí sería decir dos veces lo mismo.
 */
function fraseDeHistoria(
  claim: Claim,
  t: (clave: Clave, params?: Record<string, string>) => string,
  idioma: "es" | "en",
): string | null {
  const lado =
    claim.data.lado === "sell"
      ? t("descomposicion.ladoVenta").toLowerCase()
      : t("descomposicion.ladoCompra").toLowerCase();

  switch (claim.code) {
    case "brecha_vs_historia": {
      const params = {
        lado,
        dias: claim.data.dias,
        delta: formatDecimal(claim.data.delta_pp, { maxDecimales: 2, idioma }),
      };
      if (claim.data.posicion === "por_encima") {
        return t("brechaHist.porEncima", params);
      }
      if (claim.data.posicion === "por_debajo") {
        return t("brechaHist.porDebajo", params);
      }
      return t("brechaHist.enLinea", params);
    }
    case "brecha_extremo":
      return t(
        claim.data.tipo === "maximo" ? "brechaHist.maximo" : "brechaHist.minimo",
        { lado, dias: claim.data.dias },
      );
    case "historia_parcial":
      return t("brechaHist.parcial", {
        lado,
        dias: claim.data.dias,
        ventana: claim.data.ventana,
      });
    default:
      return null;
  }
}
