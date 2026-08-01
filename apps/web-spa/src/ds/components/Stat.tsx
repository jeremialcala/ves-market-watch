import type { HTMLAttributes, ReactNode } from "react";

export type TonoStat = "teal" | "coral" | "sage";

const TONOS: Record<TonoStat, string> = {
  teal: "var(--teal)",
  coral: "var(--coral)",
  sage: "var(--sage)",
};

interface Props extends HTMLAttributes<HTMLDivElement> {
  value: ReactNode;
  label: ReactNode;
  tone?: TonoStat;
}

/** Cifra + etiqueta (port de `components/core/Stat.jsx`).
 *
 * `fontVariantNumeric: tabular-nums` es añadido nuestro, no del sistema: en un
 * dashboard que refresca en vivo, las cifras no deben bailar de ancho. */
export function Stat({ value, label, tone = "teal", ...resto }: Props) {
  return (
    <div {...resto}>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "34px",
          fontWeight: 700,
          color: TONOS[tone],
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "13px",
          color: "var(--text-muted)",
          marginTop: "4px",
          lineHeight: 1.4,
        }}
      >
        {label}
      </div>
    </div>
  );
}
