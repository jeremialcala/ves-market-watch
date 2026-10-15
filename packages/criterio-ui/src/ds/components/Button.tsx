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
  /*
   * `nav`: los controles de la barra, no una llamada a la acción.
   *
   * Era **coral sólido con sombra**, que es el tratamiento del CTA de la vista.
   * En la barra ese peso convertía «Salir» —la acción que menos se quiere
   * pulsar— en lo más llamativo de la pantalla, y gastaba el coral, que en este
   * producto significa alerta. Ahora comparte tratamiento con el conmutador de
   * idioma y el botón de tema: pastilla discreta sobre `--overlay-soft` que se
   * aclara al pasar por encima.
   */
  nav: {
    reposo: {
      background: "var(--overlay-soft)",
      color: "var(--text-muted)",
      fontSize: "14px",
      fontWeight: 600,
      padding: "8px 18px",
      border: "1px solid var(--border)",
    },
    hover: { color: "var(--text)", borderColor: "var(--border-2)" },
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
