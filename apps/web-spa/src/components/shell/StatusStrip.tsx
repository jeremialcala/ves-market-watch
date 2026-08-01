import { useT } from "../../i18n/contexto";
import { relativo } from "../../lib/freshness";
import { useCompacto } from "../../lib/useCompacto";
import { useMarket } from "../../state/marketStore";
import { TOPICOS } from "../../ws/messages";
import { ConnectionStatus } from "../ConnectionStatus";

/**
 * Tira superior del diseño: estado del stream, suscripciones, antigüedad del
 * último push, cuota REST y versión de cálculo. Todo sale del store — si no hay
 * evento todavía se dice, no se inventa un «hace 34 s».
 *
 * Responsive (el diseño la declara dentro de `isWide`): **en compacto no
 * existe**. Su información no se pierde, se reparte — el estado y la antigüedad
 * van al punto de la barra compacta, y el detalle completo a la línea meta del
 * menú. Pintarla igual en móvil era lo que la partía en dos filas.
 *
 * Entre medias (< 1080 px) se repliegan los datos secundarios —suscripciones y
 * cuota— antes que dejar que la tira envuelva: lo que no puede caerse es el
 * estado del stream.
 */
export function StatusStrip() {
  const t = useT();
  const compacto = useCompacto();
  const { indicadores, ultimoEventoEn, cuota } = useMarket();

  if (compacto) {
    return null;
  }

  const cuando =
    ultimoEventoEn !== null
      ? (() => {
          const { clave, n } = relativo(ultimoEventoEn);
          return t("estado.ultimoEvento", { cuando: t(clave, { n }) });
        })()
      : t("estado.sinEventos");

  return (
    <div className="vmw-tira">
      <ConnectionStatus />
      <span className="vmw-tira__sep vmw-tira__secundario" aria-hidden="true">
        ·
      </span>
      <span className="vmw-tira__secundario">
        {t("estado.flujo", { n: TOPICOS.length })}
      </span>
      <span className="vmw-tira__sep" aria-hidden="true">
        ·
      </span>
      <span>{cuando}</span>
      <span className="vmw-tira__relleno" />
      {cuota.remaining !== undefined && cuota.limit !== undefined ? (
        <span className="vmw-tira__secundario">
          {t("estado.cuota", {
            restante: cuota.remaining,
            limite: cuota.limit,
          })}
        </span>
      ) : null}
      <span>
        {indicadores !== null
          ? t("estado.version", { calc: indicadores.calc_version })
          : t("estado.versionSinDato")}
      </span>
    </div>
  );
}
