/**
 * Barra superior: la tira «en vivo» y la navegación.
 *
 * La tira dice la edad del DATO (`as_of` del snapshot), no la de la última
 * petición: un gateway que responde con datos viejos no se presenta como
 * fresco (ADR-0028 §5).
 */

import { Icon, Tag, useTema } from "@criterio/ui";
import isotipoClaro from "@criterio/ui/assets/isotipo_charcoal.svg";
import isotipoOscuro from "@criterio/ui/assets/isotipo.svg";
import { useState } from "react";

import { useAhora, useDatos } from "../datos/contexto";
import { useI18n } from "../i18n/contexto";
import { edad, fechaVet } from "../lib/lectura";
import { BotonEnlace } from "./BotonEnlace";
import { Enlace } from "../router";
import { useRuta } from "../router/contexto";
import { RUTAS, ULTIMA_DE_DATOS } from "../rutas";

function TiraEnVivo() {
  const { t, idioma } = useI18n();
  const { snapshot } = useDatos();
  const ahora = useAhora();
  const asOf = snapshot.datos?.as_of ?? null;

  let estado;
  if (snapshot.estado === "cargando" || ahora === null) {
    estado = <Tag tone="teal">{t("vivo.conectando")}</Tag>;
  } else if (snapshot.estado === "sin-conexion") {
    estado = <Tag tone="coral">{t("vivo.sinConexion")}</Tag>;
  } else {
    estado = <Tag tone="sage">{t("vivo.etiqueta")}</Tag>;
  }
  const cuando = asOf !== null && ahora !== null ? edad(asOf, ahora) : null;

  return (
    <div className="tira" role="status" aria-live="polite">
      {estado}
      {cuando !== null && (
        <>
          <span className="tira-sep">·</span>
          <span>{t("vivo.actualizado", { cuando: t(cuando.clave, { n: cuando.n }) })}</span>
        </>
      )}
      <span className="tira-sep">·</span>
      <span className="tira-publico">{t("vivo.publico")}</span>
      <span className="tira-hueco" />
      {asOf !== null && <span>{t("vivo.datosAl", { fecha: fechaVet(asOf, idioma) })}</span>}
    </div>
  );
}

export function BarraSuperior() {
  const { t, idioma, setIdioma } = useI18n();
  const { tema, alternar } = useTema();
  const { ruta } = useRuta();
  const [menuAbierto, setMenuAbierto] = useState(false);

  const enlaces = RUTAS.map((r) => (
    <span key={r.ruta} className="nav-item">
      <Enlace
        to={r.ruta}
        className={ruta === r.ruta ? "nav-enlace activo" : "nav-enlace"}
        aria-current={ruta === r.ruta ? "page" : undefined}
        onClick={() => setMenuAbierto(false)}
      >
        {t(r.nav)}
      </Enlace>
      {r.ruta === ULTIMA_DE_DATOS && <span className="nav-sep" aria-hidden="true" />}
    </span>
  ));

  return (
    <header className="cabecera">
      <TiraEnVivo />
      <div className="barra">
        <Enlace to="/" className="marca" aria-label={t("app.nombre")}>
          <img src={tema === "light" ? isotipoClaro : isotipoOscuro} alt="" width={26} height={26} />
          <span>{t("app.nombre")}</span>
        </Enlace>

        <nav className="nav" aria-label={t("nav.principal")} data-abierto={menuAbierto}>
          {enlaces}
        </nav>

        <span className="barra-hueco" />

        <div className="controles">
          <div className="idiomas" role="group" aria-label={t("nav.idioma")}>
            {(["es", "en"] as const).map((i) => (
              <button
                key={i}
                type="button"
                className={idioma === i ? "idioma activo" : "idioma"}
                aria-pressed={idioma === i}
                onClick={() => setIdioma(i)}
              >
                {i.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" className="tema" onClick={alternar}>
            {tema === "dark" ? t("nav.tema.claro") : t("nav.tema.oscuro")}
          </button>
          <span className="acceso">
            <BotonEnlace variant="nav" to="/precios">
              {t("nav.acceso")}
            </BotonEnlace>
          </span>
          <button
            type="button"
            className="menu"
            aria-expanded={menuAbierto}
            aria-label={menuAbierto ? t("nav.cerrarMenu") : t("nav.menu")}
            onClick={() => setMenuAbierto((abierto) => !abierto)}
          >
            <Icon name={menuAbierto ? "close" : "menu"} size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
