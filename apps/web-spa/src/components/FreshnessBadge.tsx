import { useI18n } from "../i18n/contexto";
import { frescura, relativo } from "../lib/freshness";

/** Badge de frescura por fuente (RF-5): fresco/rancio/sin-datos. */
export function FreshnessBadge({
  asOf,
  umbralMs,
}: {
  asOf: string | null | undefined;
  umbralMs: number;
}) {
  const { t } = useI18n();
  const estado = frescura(asOf, umbralMs);
  if (estado === "sin-datos") {
    return <span className="vmw-badge">{t("frescura.sinDatos")}</span>;
  }
  const { clave, n } = relativo(asOf as string);
  const texto = t(clave, { n });
  return (
    <span
      className={
        estado === "rancio" ? "vmw-badge vmw-badge--alerta" : "vmw-badge"
      }
    >
      {estado === "rancio" ? t("frescura.rancio", { cuando: texto }) : texto}
    </span>
  );
}
