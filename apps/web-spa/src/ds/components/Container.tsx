import type { ElementType, HTMLAttributes, ReactNode } from "react";

interface Props extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  children?: ReactNode;
}

/** Ancho máximo y padding del sistema (port de `components/layout/Container.jsx`). */
export function Container({ as: Etiqueta = "div", children, style, ...resto }: Props) {
  return (
    <Etiqueta
      style={{
        maxWidth: "var(--maxw)",
        margin: "0 auto",
        padding: "0 24px",
        ...style,
      }}
      {...resto}
    >
      {children}
    </Etiqueta>
  );
}
