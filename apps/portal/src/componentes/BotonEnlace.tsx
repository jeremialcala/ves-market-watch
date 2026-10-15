/** Un enlace interno con aspecto de botón del sistema de diseño. */

import { Button, type NombreIcono, type VarianteBoton } from "@criterio/ui";
import type { ReactNode } from "react";

import { useClicInterno } from "../router/contexto";

export function BotonEnlace({
  to,
  variant = "primary",
  icon,
  children,
}: {
  to: string;
  variant?: VarianteBoton;
  icon?: NombreIcono;
  children: ReactNode;
}) {
  const alClic = useClicInterno(to);
  return (
    <Button href={to} variant={variant} icon={icon} onClick={alClic}>
      {children}
    </Button>
  );
}
