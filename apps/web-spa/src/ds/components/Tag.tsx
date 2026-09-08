import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export type TonoTag = "teal" | "coral" | "sage";

const TONOS: Record<TonoTag, CSSProperties> = {
  teal: {
    color: "var(--teal)",
    background: "var(--teal-tint)",
    borderColor: "var(--teal-line)",
  },
  coral: {
    color: "var(--coral)",
    background: "var(--coral-tint)",
    borderColor: "var(--coral-line)",
  },
  sage: {
    color: "var(--sage)",
    background: "var(--sage-tint)",
    borderColor: "var(--sage-line)",
  },
};

interface Props extends HTMLAttributes<HTMLSpanElement> {
  tone?: TonoTag;
  /** El punto con glow del tag; se apaga cuando el tag no señala un estado. */
  dot?: boolean;
  children?: ReactNode;
}

/** Etiqueta de estado con punto (port de `components/core/Tag.jsx`). */
export function Tag({
  tone = "teal",
  dot = true,
  children,
  style,
  ...resto
}: Props) {
  const t = TONOS[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        border: "1px solid",
        borderColor: t.borderColor,
        background: t.background,
        color: t.color,
        fontFamily: "var(--font-sans)",
        fontSize: "12.5px",
        fontWeight: 600,
        letterSpacing: "var(--ls-eyebrow)",
        textTransform: "uppercase",
        padding: "7px 15px",
        borderRadius: "var(--radius-pill)",
        ...style,
      }}
      {...resto}
    >
      {dot ? (
        <span
          aria-hidden="true"
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "currentcolor",
            boxShadow: "var(--glow-dot)",
          }}
        />
      ) : null}
      {children}
    </span>
  );
}
