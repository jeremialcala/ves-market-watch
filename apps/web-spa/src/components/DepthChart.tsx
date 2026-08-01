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
import { formatDecimal } from "../lib/decimal";
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

function LadoProfundidad({
  lado,
  datos,
}: {
  lado: "buy" | "sell";
  datos?: Profundidad;
}) {
  const { t, idioma } = useI18n();
  const niveles = datos?.levels ?? [];
  const total =
    niveles.length === 0 ? null : niveles[niveles.length - 1].cum_volume;

  return (
    <div className="vmw-tarjeta vmw-profundidad">
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
        <div style={{ display: "grid", gap: "7px", marginTop: "18px" }}>
          {niveles.map((nivel) => (
            <div className="vmw-profundidad__fila" key={nivel.price_band}>
              <span className="vmw-profundidad__precio">
                {formatDecimal(nivel.price_band, { maxDecimales: 1, idioma })}
              </span>
              <div className="vmw-barra">
                <div
                  className="vmw-barra__relleno"
                  style={{
                    width: porcentajeDeMaximo(nivel.cum_volume, total),
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
      <div className="vmw-grid" style={{ "--min": "380px" } as CSSProperties}>
        <LadoProfundidad lado="buy" datos={profundidad.buy} />
        <LadoProfundidad lado="sell" datos={profundidad.sell} />
      </div>
    </section>
  );
}
