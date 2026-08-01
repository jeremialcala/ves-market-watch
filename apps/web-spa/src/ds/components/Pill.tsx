import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export type TonoPill = "cielo" | "tierra";

const TONOS: Record<TonoPill, CSSProperties> = {
  tierra: {
    background: "var(--pill-tierra-bg)",
    color: "var(--coral)",
    borderColor: "var(--pill-tierra-line)",
  },
  cielo: {
    background: "var(--pill-cielo-bg)",
    color: "var(--teal)",
    borderColor: "var(--pill-cielo-line)",
  },
};

interface Props extends HTMLAttributes<HTMLSpanElement> {
  tone?: TonoPill;
  children?: ReactNode;
}

/** Cápsula de metadato (port de `components/core/Pill.jsx`). */
export function Pill({ tone = "cielo", children, style, ...resto }: Props) {
  return (
    <span
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: "13px",
        fontWeight: 600,
        padding: "6px 14px",
        borderRadius: "var(--radius-pill)",
        border: "1px solid",
        ...TONOS[tone],
        ...style,
      }}
      {...resto}
    >
      {children}
    </span>
  );
}
