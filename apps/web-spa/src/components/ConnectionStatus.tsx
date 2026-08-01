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
 * Estado del WSS + cuota REST + salud del gateway (RF-6), como Tag del
 * sistema: salvia solo cuando hay stream Y el gateway está sano.
 *
 * Es una **región viva**: si el stream cae mientras el usuario mira otra cosa,
 * un lector de pantalla lo anuncia en vez de quedarse callado. `polite` porque
 * es contexto, no una alarma que deba interrumpir.
 */
export function ConnectionStatus() {
  const t = useT();
  const { conexion, detalleConexion, cuota, salud } = useMarket();
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
    ]
      .filter(Boolean)
      .join(" · ") || undefined;

  return (
    <Tag
      tone={enVivo && !degradado ? "sage" : "coral"}
      title={titulo}
      role="status"
      aria-live="polite"
    >
      {t(CLAVE[conexion])}
      {degradado ? ` · ${t("estado.gateway", { estado: salud.status })}` : ""}
    </Tag>
  );
}
