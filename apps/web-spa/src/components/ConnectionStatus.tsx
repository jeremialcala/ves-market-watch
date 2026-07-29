import { useMarket } from "../state/marketStore";

const ETIQUETA: Record<string, string> = {
  desconectado: "desconectado",
  conectando: "conectando…",
  conectado: "en vivo",
  reconectando: "reconectando…",
  detenido: "stream detenido",
};

/** Estado del WSS + cuota REST + salud del gateway (RF-6). */
export function ConnectionStatus() {
  const { conexion, detalleConexion, cuota, salud } = useMarket();
  const alerta = conexion !== "conectado";
  return (
    <span
      className={alerta ? "badge badge-rancio" : "badge"}
      title={
        [
          detalleConexion,
          cuota.remaining !== undefined
            ? `cuota REST: ${cuota.remaining}/${cuota.limit} por minuto`
            : null,
          salud !== null ? `gateway: ${salud.status}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined
      }
    >
      {ETIQUETA[conexion] ?? conexion}
      {salud !== null && salud.status !== "ok" ? ` · gateway ${salud.status}` : ""}
    </span>
  );
}
