import { useT } from "../i18n/contexto";

/**
 * Marca de bloque SIN fuente de datos.
 *
 * El diseño importado trae secciones (régimen de mercado, percentiles de
 * backtest, escenarios y riesgos) que la plataforma no calcula. Se implementan
 * porque el diseño las pide, pero la regla de honestidad del dato (RF-5) obliga
 * a que se distingan del dato real de un vistazo: sin este sello, un número de
 * ejemplo se lee igual que uno servido por el gateway.
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
