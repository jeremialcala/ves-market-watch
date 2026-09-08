import { useT } from "../i18n/contexto";

/**
 * Marca de bloque SIN fuente de datos.
 *
 * La regla de honestidad del dato (RF-5, ADR-0018) obliga a que un bloque sin
 * fuente se distinga del dato real de un vistazo: sin este sello, un número de
 * ejemplo se lee igual que uno servido por el gateway.
 *
 * **Hoy no lo usa nadie, y eso es la meta cumplida, no código muerto.** El
 * diseño importado traía cuatro bloques sin fuente; los medidores (ADR-0019),
 * la lectura del mercado (ADR-0021) y los riesgos (2026-09-07) pasaron a dato
 * servido, y los escenarios se retiraron el mismo día por inconstruibles. El
 * componente se conserva porque el mecanismo lo exige RF-5, no los bloques que
 * marcaba: el día que entre uno nuevo sin fuente tiene que llevar sello desde
 * el primer commit, no desde que alguien se acuerde de reescribirlo.
 */
export function DemoBadge({ className }: { className?: string }) {
  const t = useT();
  return (
    <span
      className={className}
      data-demo="true"
      title={t("generico.demoTitulo")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "3px 10px",
        borderRadius: "var(--radius-pill)",
        border: "1px dashed var(--coral-line)",
        background: "var(--coral-tint)",
        color: "var(--coral)",
        fontFamily: "var(--font-sans)",
        fontSize: "11.5px",
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {t("generico.demo")}
    </span>
  );
}
