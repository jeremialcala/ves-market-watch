import { useI18n } from "../../i18n/contexto";
import { relativo } from "../../lib/freshness";
import { selloVET } from "../../lib/intradia";
import { useCompacto } from "../../lib/useCompacto";
import { useMarket } from "../../state/marketStore";
import { TOPICOS } from "../../ws/messages";
import { ConnectionStatus } from "../ConnectionStatus";

/**
 * Tira superior: **estado del mercado en una línea**, no un panel de
 * diagnóstico.
 *
 * Lleva solo lo que responde «¿puedo fiarme de lo que estoy viendo ahora?»:
 * el estado del stream, cuándo llegó el último evento, cuántas suscripciones
 * hay vivas y a qué momento pertenecen los datos.
 *
 * Lo que SALIÓ de aquí y por qué: `flujo /ws/v1` (la ruta del canal), la cuota
 * REST y las versiones de calc/ruleset son **diagnóstico**. No cambian la
 * lectura del mercado y competían por el único renglón con lo que sí. Siguen
 * accesibles: cuota y versiones en el tooltip del punto de conexión y en la
 * tarjeta «Calidad y procedencia», que es donde alguien pregunta con qué se
 * calculó esto; y la línea meta del menú las repite en compacto.
 *
 * Responsive (el diseño la declara dentro de `isWide`): **en compacto no
 * existe**. Su información no se pierde, se reparte — el estado y la antigüedad
 * van al punto de la barra compacta, y el detalle completo a la línea meta del
 * menú. Pintarla igual en móvil era lo que la partía en dos filas.
 */
export function StatusStrip() {
  const { t, idioma } = useI18n();
  const compacto = useCompacto();
  const { ultimoEventoEn, analisis } = useMarket();

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

  // Sello de frescura: a qué momento pertenece el dato que se está mirando, en
  // hora de Venezuela. Sale del `as_of` del análisis —el instante del dato, no
  // el de la entrega— y si no hay análisis no se escribe: inventar una hora
  // sería justo lo contrario de lo que el sello existe para dar.
  const sello =
    analisis !== null
      ? t("estado.datosAl", { sello: selloVET(analisis.as_of, idioma) })
      : null;

  return (
    <div className="vmw-tira">
      <ConnectionStatus />
      <Separador />
      <span>{cuando}</span>
      <Separador />
      <span className="vmw-tira__secundario">
        {t("estado.suscripciones", { n: TOPICOS.length })}
      </span>
      <span className="vmw-tira__relleno" />
      {sello !== null && <span>{sello}</span>}
    </div>
  );
}

/** El punto medio que separa: decorativo, al 40 % — se lee la pausa, no el punto. */
function Separador() {
  return (
    <span className="vmw-tira__sep" aria-hidden="true">
      ·
    </span>
  );
}
