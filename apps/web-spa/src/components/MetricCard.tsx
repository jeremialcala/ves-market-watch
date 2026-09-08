/**
 * La tarjeta de métrica del Intradía. Una sola, para todos los bloques.
 *
 * La usan «qué se movió» y microestructura, y es la que debe usar cualquier
 * bloque futuro. Antes eran dos componentes con el mismo dibujo y valores
 * ligeramente distintos —gap 10 contra 12, trazo 1,6 contra 1,8— y esa clase de
 * deriva ya costó cara en esta vista: dos definiciones del mismo título dejaron
 * cuatro secciones en blanco sobre blanco durante ocho commits.
 *
 * **La identidad de la serie entra como `indicador`, no como label + clave
 * sueltos.** El catálogo (`presentacionDe`) es el único dueño de ese par desde
 * que se separaron; aceptar las dos cadenas por props reabriría la puerta a que
 * dos bloques nombren la misma serie de forma distinta, que es justo lo que se
 * cerró. Lo opcional —umbral, pastilla, nota, pie— sí viaja por props, porque
 * eso sí cambia de un bloque a otro.
 *
 * Estilo fijo, todo en tokens que ya existían con el valor pedido: `--dark-3`,
 * radio 22, padding 22/24, gap 12, `--border` (8 %) y en hover `--border-2`
 * (14 %) con `--lift` (−4 px) en `--dur-card` (0,25 s). **Sin sombra en reposo,
 * sin scale y sin estado de pulsado**: el sistema no los define y inventarlos
 * aquí sería crear vocabulario nuevo por la puerta de atrás. **Sin degradado y
 * sin borde lateral de color** — el relieve lo dan el borde y la elevación.
 */

import type { ReactNode } from "react";

import { useI18n } from "../i18n/contexto";
import type { DeltaIntradia } from "../lib/delta";
import { presentacionDe, serieEnCero, type PuntoIntradia } from "../lib/intradia";
import { areaSparkline, trazoConUmbral } from "../lib/movimiento";
import { ChispaConTooltip } from "./ChispaConTooltip";
import { NombreSerie } from "./NombreSerie";
import { SerieEnCero } from "./SerieEnCero";

const ANCHO = 160;
const ALTO = 44;

export interface PastillaMetrica {
  texto: string;
  /** `alerta` tiñe de coral; `calma`, de teal; `neutra` no tiñe. */
  tono: "alerta" | "calma" | "neutra";
}

export function MetricCard({
  indicador,
  valor,
  delta,
  colorSerie,
  apertura,
  puntos,
  umbral = null,
  pastilla = null,
  nota = null,
  pieDerecho = null,
  tono = "neutro",
  descripcionSerie,
}: {
  /** Nombre canónico: de ahí salen etiqueta, clave, unidad y decimales. */
  indicador: string;
  /** Cifra principal, ya formateada con su unidad. */
  valor: string;
  delta: DeltaIntradia;
  /** Color del trazo. Qué codifica lo decide el bloque, no la tarjeta. */
  colorSerie: string;
  /** Apertura ya formateada, para el pie. */
  apertura: string;
  puntos: readonly PuntoIntradia[];
  /** Umbral del ruleset en el dominio de la chispa, si la métrica lo tiene. */
  umbral?: string | null;
  pastilla?: PastillaMetrica | null;
  nota?: ReactNode;
  /** Extremo derecho del pie («dispara < −40 %», «ahora»…). */
  pieDerecho?: ReactNode;
  /** `alerta` pinta el borde en coral. */
  tono?: "alerta" | "neutro";
  descripcionSerie: string;
}) {
  const { t } = useI18n();
  const { unidad, decimales, etiquetaCero } = presentacionDe(indicador);
  const { trazo, yUmbral } = trazoConUmbral(puntos, umbral, ANCHO, ALTO);
  const enCero = etiquetaCero !== null && serieEnCero(puntos);

  return (
    <article className="vmw-metrica" data-tono={tono}>
      <div className="vmw-metrica__cabecera">
        <span className="vmw-metrica__nombre-serie">
          <NombreSerie indicador={indicador} claseEtiqueta="vmw-metrica__etiqueta" />
        </span>
        {pastilla !== null && (
          <span className="vmw-metrica__pastilla" data-tono={pastilla.tono}>
            {pastilla.texto}
          </span>
        )}
      </div>

      <p className="vmw-metrica__cifra-fila">
        <span className="vmw-metrica__cifra">{valor}</span>
        {/* La Δ lleva su color de dirección; el signo va escrito igualmente
            (`lib/delta.ts`), así que no depende de distinguirlo. */}
        <span className="vmw-metrica__delta" style={{ color: delta.color }}>
          {delta.texto}
        </span>
      </p>

      {enCero ? (
        <SerieEnCero etiqueta={etiquetaCero} className="vmw-metrica__spark" />
      ) : (
        <ChispaConTooltip
          puntos={puntos}
          ancho={ANCHO}
          alto={ALTO}
          color={colorSerie}
          unidad={unidad}
          decimales={decimales}
        >
          <svg
            className="vmw-metrica__spark"
            viewBox={`0 0 ${ANCHO} ${ALTO}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={descripcionSerie}
          >
            <polyline
              points={areaSparkline(trazo, ANCHO, ALTO)}
              fill="var(--overlay-soft)"
              stroke="none"
            />
            {/* El umbral va DEBAJO de la serie y comparte su escala: es el fondo
                contra el que se lee la línea, no un dato más. */}
            {yUmbral !== null && (
              <polyline
                points={`0,${yUmbral} ${ANCHO},${yUmbral}`}
                fill="none"
                stroke="var(--coral)"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.7"
              />
            )}
            <polyline
              points={trazo}
              fill="none"
              stroke={colorSerie}
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </ChispaConTooltip>
      )}

      <div className="vmw-metrica__pie">
        <span>{t("metrica.apertura", { valor: apertura })}</span>
        {pieDerecho !== null && <span>{pieDerecho}</span>}
      </div>

      {nota !== null && <p className="vmw-metrica__nota">{nota}</p>}
    </article>
  );
}
