import { frescura, haceRelativo } from "../lib/freshness";

/** Badge de frescura por fuente (RF-5): fresco/rancio/sin-datos. */
export function FreshnessBadge({
  asOf,
  umbralMs,
}: {
  asOf: string | null | undefined;
  umbralMs: number;
}) {
  const estado = frescura(asOf, umbralMs);
  if (estado === "sin-datos") {
    return <span className="badge">sin datos</span>;
  }
  const texto = haceRelativo(asOf as string);
  return (
    <span className={estado === "rancio" ? "badge badge-rancio" : "badge"}>
      {estado === "rancio" ? `rancio · ${texto}` : texto}
    </span>
  );
}
