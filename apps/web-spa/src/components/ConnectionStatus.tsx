import { Tag } from "../ds/components";
import { useT } from "../i18n/contexto";
import { useMarket } from "../state/marketStore";

const CLAVE = {
  conectado: "estado.conectado",
  conectando: "estado.conectando",
  reconectando: "estado.reconectando",
  desconectado: "estado.desconectado",
  detenido: "estado.detenido",
} as const;

/**
 * Estado del WSS como Tag del sistema: salvia solo cuando hay stream Y el
 * gateway está sano.
 *
 * El **tooltip recoge el diagnóstico** que se sacó de la tira: cuota REST,
 * versiones de calc/ruleset y salud del gateway. Ahí no compiten por el renglón
 * con el estado del mercado, y siguen a un palmo de quien los busca. La misma
 * información vive además en «Calidad y procedencia», que es donde alguien
 * pregunta con qué se calculó lo que está viendo.
 *
 * Es una **región viva**: si el stream cae mientras el usuario mira otra cosa,
 * un lector de pantalla lo anuncia en vez de quedarse callado. `polite` porque
 * es contexto, no una alarma que deba interrumpir.
 *
 * Lo que NO va al tooltip: el estado en sí. Un tooltip no lo lee un lector de
 * pantalla ni existe en táctil, así que el estado va en el texto del Tag y el
 * color solo lo acompaña.
 */
export function ConnectionStatus() {
  const t = useT();
  const { conexion, detalleConexion, cuota, salud, indicadores } = useMarket();
  const enVivo = conexion === "conectado";
  const degradado = salud !== null && salud.status !== "ok";
  const titulo =
    [
      detalleConexion,
      cuota.remaining !== undefined
        ? t("estado.cuotaTitulo", {
            restante: cuota.remaining,
            limite: cuota.limit ?? "—",
          })
        : null,
      salud !== null ? t("estado.gateway", { estado: salud.status }) : null,
      indicadores !== null
        ? t("estado.version", { calc: indicadores.calc_version })
        : null,
    ]
      .filter(Boolean)
      .join(" · ") || undefined;

  return (
    <Tag
      tone={enVivo && !degradado ? "sage" : "coral"}
      title={titulo}
      role="status"
      aria-live="polite"
      // El Tag del sistema trae 7 px verticales, que sumados a los 7 de la tira
      // la dejaban en 51 px: una banda, no un renglón. Se comprime AQUÍ y no en
      // el componente del sistema, que lo usan otras superficies donde el aire
      // sí corresponde. `ConnectionStatus` vive solo en la tira.
      style={{ paddingTop: "2px", paddingBottom: "2px" }}
    >
      {t(CLAVE[conexion])}
      {degradado ? ` · ${t("estado.gateway", { estado: salud.status })}` : ""}
    </Tag>
  );
}
