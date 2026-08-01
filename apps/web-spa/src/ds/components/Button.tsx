import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { useState } from "react";

import { Icon, type NombreIcono } from "./Icon";

export type VarianteBoton = "primary" | "secondary" | "nav";

const BASE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "9px",
  fontFamily: "var(--font-sans)",
  cursor: "pointer",
  borderRadius: "var(--radius-pill)",
  transition: "all .2s ease",
  whiteSpace: "nowrap",
  textDecoration: "none",
};

const VARIANTES: Record<
  VarianteBoton,
  { reposo: CSSProperties; hover: CSSProperties }
> = {
  primary: {
    reposo: {
      background: "var(--teal)",
      color: "var(--ink)",
      fontSize: "15px",
      fontWeight: 700,
      padding: "14px 28px",
      border: "none",
      boxShadow: "var(--shadow-teal)",
    },
    hover: {
      background: "var(--teal-hover)",
      transform: "var(--lift-sm)",
      boxShadow: "var(--shadow-teal-hover)",
    },
  },
  secondary: {
    reposo: {
      background: "transparent",
      color: "var(--text)",
      fontSize: "15px",
      fontWeight: 600,
      padding: "13px 26px",
      border: "1.5px solid var(--border-2)",
    },
    hover: {
      borderColor: "var(--teal)",
      color: "var(--teal)",
      transform: "var(--lift-sm)",
    },
  },
  nav: {
    reposo: {
      background: "var(--coral)",
      color: "var(--coral-ink)",
      fontSize: "14px",
      fontWeight: 700,
      padding: "10px 20px",
      border: "none",
      boxShadow: "var(--shadow-coral)",
    },
    hover: { background: "var(--coral-hover)", transform: "translateY(-1px)" },
  },
};

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: VarianteBoton;
  icon?: NombreIcono;
  iconPosition?: "start" | "end";
  children?: ReactNode;
}

/** Botón del sistema Higerotech (port de `components/core/Button.jsx`). */
export function Button({
  variant = "primary",
  icon,
  iconPosition = "end",
  disabled,
  children,
  style,
  ...resto
}: Props) {
  const [hover, setHover] = useState(false);
  const v = VARIANTES[variant];
  const css: CSSProperties = {
    ...BASE,
    ...v.reposo,
    ...(hover && disabled !== true ? v.hover : null),
    ...(disabled === true
      ? {
          opacity: 0.45,
          cursor: "not-allowed",
          boxShadow: "none",
          transform: "none",
        }
      : null),
    ...style,
  };
  const glifo =
    icon !== undefined ? <Icon name={icon} size={16} aria-hidden /> : null;
  return (
    <button
      type="button"
      style={css}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...resto}
    >
      {iconPosition === "start" ? glifo : null}
      <span>{children}</span>
      {iconPosition === "end" ? glifo : null}
    </button>
  );
}
