/** Pie con contacto y WhatsApp (RF-12): sin formulario ni backend propio. */

import { useT } from "../i18n/contexto";
import { Resaltado } from "./Resaltado";

export const CORREO = "contacto@higerotech.com";
export const WHATSAPP = "https://wa.me/13235543854";

export function Pie() {
  const t = useT();
  return (
    <footer className="pie">
      <div className="pie-contenido">
        <span>{t("pie.derechos")}</span>
        <a href="https://higerotech.com" target="_blank" rel="noopener noreferrer" className="pie-marca">
          higerotech.com
        </a>
        <a href={`mailto:${CORREO}`}>{CORREO}</a>
        <a href={WHATSAPP} target="_blank" rel="noopener noreferrer">
          WhatsApp +1 323 554 3854
        </a>
        <span className="pie-hueco" />
        <span>
          <Resaltado texto={t("pie.hecho")} clase="corazon" />
        </span>
      </div>
    </footer>
  );
}
