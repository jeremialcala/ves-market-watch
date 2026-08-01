import { useState } from "react";

import isotipoOscuro from "../../ds/assets/isotipo.svg";
import isotipoClaro from "../../ds/assets/isotipo_charcoal.svg";
import { Button, Icon } from "../../ds/components";
import { useI18n } from "../../i18n/contexto";
import { IDIOMAS } from "../../i18n/idioma";
import { relativo } from "../../lib/freshness";
import { useCompacto } from "../../lib/useCompacto";
import { useMarket } from "../../state/marketStore";
import { useTema } from "../../theme/contexto";
import { VISTAS, type Vista } from "../../views/vistas";

interface Props {
  vista: Vista;
  onVista: (vista: Vista) => void;
  usuario: string;
  onSalir: () => void;
}

function Marca({ compacta = false }: { compacta?: boolean }) {
  const { tema } = useTema();
  const { t } = useI18n();
  return (
    <div className="vmw-nav__marca">
      <img src={tema === "light" ? isotipoClaro : isotipoOscuro} alt="" />
      <span className="vmw-nav__titulo">
        {compacta ? "VES Market Watch" : t("app.titulo")}
      </span>
    </div>
  );
}

function Idiomas() {
  const { idioma, setIdioma, t } = useI18n();
  return (
    <div className="vmw-toggle" role="group" aria-label={t("nav.idioma")}>
      {IDIOMAS.map((codigo) => (
        <button
          key={codigo}
          type="button"
          className="vmw-mini"
          aria-pressed={idioma === codigo}
          onClick={() => setIdioma(codigo)}
        >
          {codigo.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function BotonTema() {
  const { tema, alternar } = useTema();
  const { t } = useI18n();
  return (
    <button type="button" className="vmw-boton-suave" onClick={alternar}>
      {tema === "dark" ? t("nav.tema.claro") : t("nav.tema.oscuro")}
    </button>
  );
}

function Tabs({
  vista,
  onVista,
  className,
}: Pick<Props, "vista" | "onVista"> & { className: string }) {
  const { t } = useI18n();
  return (
    <nav className={className} role="tablist" aria-label={t("nav.vistas")}>
      {VISTAS.map(({ clave, etiqueta }) => (
        <button
          key={clave}
          type="button"
          role="tab"
          className="vmw-tab"
          aria-selected={vista === clave}
          onClick={() => onVista(clave)}
        >
          {t(etiqueta)}
        </button>
      ))}
    </nav>
  );
}

/** Barra de navegación del diseño, con su variante compacta (< 760 px) y el
 * menú desplegable. */
export function NavBar({ vista, onVista, usuario, onSalir }: Props) {
  const { t } = useI18n();
  const compacto = useCompacto();
  const [menu, setMenu] = useState(false);
  const { conexion, ultimoEventoEn } = useMarket();

  const seleccionar = (siguiente: Vista) => {
    onVista(siguiente);
    setMenu(false);
  };

  if (!compacto) {
    return (
      <div className="vmw-nav">
        <Marca />
        <Tabs vista={vista} onVista={seleccionar} className="vmw-nav__tabs" />
        <span className="vmw-nav__relleno" />
        <div className="vmw-nav__acciones">
          <Idiomas />
          <BotonTema />
          <span className="vmw-nav__usuario">{usuario}</span>
          <Button variant="nav" onClick={onSalir}>
            {t("nav.salir")}
          </Button>
        </div>
      </div>
    );
  }

  const { clave, n } = ultimoEventoEn !== null
    ? relativo(ultimoEventoEn)
    : { clave: "estado.sinEventos" as const, n: 0 };

  return (
    <>
      <div className="vmw-nav-compacta">
        <Marca compacta />
        <span className="vmw-nav__relleno" />
        <span
          className={
            conexion === "conectado" ? "vmw-punto" : "vmw-punto vmw-punto--alerta"
          }
        >
          {t(clave, { n })}
        </span>
        <button
          type="button"
          className="vmw-icono-boton"
          aria-label={t("nav.menu")}
          aria-expanded={menu}
          onClick={() => setMenu((abierto) => !abierto)}
        >
          <Icon name={menu ? "close" : "menu"} size={20} />
        </button>
      </div>
      {menu ? (
        <div className="vmw-menu">
          <Tabs vista={vista} onVista={seleccionar} className="vmw-menu__tabs" />
          <div className="vmw-menu__acciones">
            <Idiomas />
            <BotonTema />
            <span className="vmw-nav__relleno" />
            <Button variant="nav" onClick={onSalir}>
              {t("nav.salir")}
            </Button>
          </div>
          <div className="vmw-menu__meta">{usuario}</div>
        </div>
      ) : null}
    </>
  );
}
