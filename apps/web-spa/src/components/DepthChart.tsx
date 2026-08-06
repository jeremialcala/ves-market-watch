/**
 * Profundidad P2P por bandas de 0,5 % — small multiples por lado (nunca doble
 * eje). El rediseño cambia las barras de Recharts por barras horizontales del
 * sistema: menos cromo, el mismo dato y el string decimal exacto a la vista.
 * Un color fijo por lado (teal compra / coral venta).
 */

import type { CSSProperties } from "react";

import type { Profundidad } from "../api/endpoints";
import type { Clave } from "../i18n/dict";
import { useI18n } from "../i18n/contexto";
import { compararDecimales, formatDecimal } from "../lib/decimal";
import { porcentajeDeMaximo } from "../lib/series";
import { useMarket } from "../state/marketStore";
import { NoDataState } from "./NoDataState";

const COLOR = {
  buy: "var(--series-buy)",
  sell: "var(--series-sell)",
} as const;

const TITULO: Record<"buy" | "sell", Clave> = {
  buy: "profundidad.compra",
  sell: "profundidad.venta",
};

/** Mayor acumulado de los dos lados, o `null` si no hay ninguno. */
function escalaComun(...lados: (Profundidad | undefined)[]): string | null {
  let maximo: string | null = null;
  for (const lado of lados) {
    const total = lado?.levels?.at(-1)?.cum_volume;
    if (total !== undefined && (maximo === null || compararDecimales(total, maximo) === 1)) {
      maximo = total;
    }
  }
  return maximo;
}

function LadoProfundidad({
  lado,
  datos,
  maximo,
}: {
  lado: "buy" | "sell";
  datos?: Profundidad;
  /** Escala COMPARTIDA por los dos paneles. */
  maximo: string | null;
}) {
  const { t, idioma } = useI18n();
  const niveles = datos?.levels ?? [];
  const total =
    niveles.length === 0 ? null : niveles[niveles.length - 1].cum_volume;

  return (
    <div className="vmw-tarjeta vmw-profundidad vmw-tarjeta--reparte">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "10px",
          fontSize: "var(--fs-meta)",
        }}
      >
        <span style={{ color: COLOR[lado] }}>{t(TITULO[lado])}</span>
        {total !== null ? (
          <span style={{ color: "var(--text-dim)" }}>
            {formatDecimal(total, { maxDecimales: 0, idioma })} USDT
          </span>
        ) : null}
      </div>
      {total === null ? (
        <NoDataState detalle={t("profundidad.sinDatos")} />
      ) : (
        <div className="vmw-profundidad__filas vmw-crece">
          {niveles.map((nivel) => (
            <div className="vmw-profundidad__fila" key={nivel.price_band}>
              <span className="vmw-profundidad__precio">
                {formatDecimal(nivel.price_band, { maxDecimales: 1, idioma })}
              </span>
              <div className="vmw-barra">
                <div
                  className="vmw-barra__relleno"
                  style={{
                    width: porcentajeDeMaximo(nivel.cum_volume, maximo ?? total),
                    // Filete mínimo cuando hay volumen pero es despreciable a
                    // esta escala: con la escala compartida, 200 USDT sobre 3 M
                    // redondean a 0,0 % y la barra desaparece. «Poco» y «nada»
                    // tienen que verse distinto — la misma regla que el hueco
                    // sin dato del mapa de calor.
                    minWidth: nivel.cum_volume === "0" ? undefined : "2px",
                    background: COLOR[lado],
                  }}
                />
              </div>
              <span className="vmw-profundidad__vol">
                {formatDecimal(nivel.cum_volume, { maxDecimales: 0, idioma })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DepthChart() {
  const { t } = useI18n();
  const { profundidad } = useMarket();
  return (
    <section className="vmw-seccion" aria-label={t("profundidad.titulo")}>
      <div className="vmw-seccion__cabecera">
        <h3 className="vmw-seccion__titulo">{t("profundidad.titulo")}</h3>
        <span className="vmw-seccion__bajada">{t("profundidad.bajada")}</span>
      </div>
      {/* Small multiples con escala COMPARTIDA. Escalando cada lado contra su
          propio total, la última barra siempre llena el ancho y dos libros que
          difieren en tres órdenes de magnitud se dibujan idénticos — pasó el
          2026-08-06: 651.963 USDT del lado compra y 372 del de venta, con la
          misma pinta. Las cifras exactas seguían impresas al lado, así que el
          panel no mentía en los números; mentía en la comparación, que es lo que
          un small multiple invita a hacer. */}
      <div className="vmw-grid" style={{ "--min": "380px" } as CSSProperties}>
        <LadoProfundidad
          lado="buy"
          datos={profundidad.buy}
          maximo={escalaComun(profundidad.buy, profundidad.sell)}
        />
        <LadoProfundidad
          lado="sell"
          datos={profundidad.sell}
          maximo={escalaComun(profundidad.buy, profundidad.sell)}
        />
      </div>
    </section>
  );
}
