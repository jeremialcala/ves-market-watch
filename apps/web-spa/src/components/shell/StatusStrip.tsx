import { useT } from "../../i18n/contexto";
import { relativo } from "../../lib/freshness";
import { useMarket } from "../../state/marketStore";
import { TOPICOS } from "../../ws/messages";
import { ConnectionStatus } from "../ConnectionStatus";

/**
 * Tira superior del diseño: estado del stream, suscripciones, antigüedad del
 * último push y versión de cálculo. Todo sale del store — si no hay evento
 * todavía se dice, no se inventa un «hace 34 s».
 */
export function StatusStrip() {
  const t = useT();
  const { indicadores, ultimoEventoEn, cuota } = useMarket();
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
      <span className="vmw-tira__sep" aria-hidden="true">
        ·
      </span>
      <span>{t("estado.flujo", { n: TOPICOS.length })}</span>
      <span className="vmw-tira__sep" aria-hidden="true">
        ·
      </span>
      <span>{cuando}</span>
      <span className="vmw-tira__relleno" />
      {cuota.remaining !== undefined && cuota.limit !== undefined ? (
        <span>
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
