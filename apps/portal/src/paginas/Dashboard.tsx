/**
 * Dashboard público (`/dashboard`, RF-2): sin cuenta y en vivo.
 *
 * El orden es el del diseño: la lectura de hoy; la brecha con la distancia al
 * disparo; los seis medidores; la descomposición; el mapa de calor; la
 * referencia P2P con la procedencia; la tasa oficial; la cronología de señales
 * y la profundidad. Todo sale de un snapshot y de las series, las mismas
 * peticiones que la barra superior.
 *
 * Los paneles son del portal y no del `web-spa` (decisión del 2026-10-15): los
 * del panel interno leen `/api/v1` y su store, no el snapshot público.
 */

import {
  CifrasBrecha,
  CronologiaSenales,
  LecturaDeHoy,
  MapaDeCalor,
  PanelHistoria,
  PanelInstrumentos,
  Profundidad,
  ReferenciaP2P,
  TarjetaBrecha,
  TasaOficial,
} from "../componentes/dashboard";
import { BotonEnlace } from "../componentes/BotonEnlace";
import { PanelAnticipacion, PanelExplicacion, PanelProcedencia } from "../componentes/paneles";
import { useT } from "../i18n/contexto";

export function Dashboard() {
  const t = useT();
  return (
    <main className="dashboard">
      <div className="contenido">
        <h1 className="solo-lectores">{t("dashboard.titulo")}</h1>

        <div className="dashboard-aviso">
          <span>{t("dashboard.publico")}</span>
          <span className="hueco" />
          <BotonEnlace to="/apis" variant="secondary" icon="arrowRight">
            {t("dashboard.verApis")}
          </BotonEnlace>
        </div>

        <LecturaDeHoy />

        <section className="dash-principal">
          <TarjetaBrecha />
          <div className="dash-lateral">
            <PanelAnticipacion />
            <CifrasBrecha />
          </div>
        </section>

        <PanelInstrumentos />

        <section className="dash-seccion">
          <header className="dash-seccion-cabecera">
            <h2>{t("descomposicion.titulo")}</h2>
            <span>{t("descomposicion.sub")}</span>
          </header>
          <div className="dos-columnas">
            <PanelExplicacion />
            <PanelHistoria />
          </div>
        </section>

        <MapaDeCalor />

        <section className="dash-seccion dos-columnas">
          <ReferenciaP2P />
          <div className="procedencia-dashboard">
            <PanelProcedencia />
            <p className="panel-nota">{t("procedencia.nota")}</p>
          </div>
        </section>

        <TasaOficial />
        <CronologiaSenales />
        <Profundidad />
      </div>
    </main>
  );
}
