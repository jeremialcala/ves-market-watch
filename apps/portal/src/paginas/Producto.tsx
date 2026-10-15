/**
 * Landing de Producto (`/`, RF-1): el hero con la lectura de hoy, las cuatro
 * promesas con su panel en vivo, los casos de uso y el CTA.
 *
 * El texto es estático y llega prerenderizado (RNF-4); los paneles se llenan
 * del mismo snapshot que el Dashboard, una sola petición para los cinco.
 */

import { Button, Tag } from "@criterio/ui";
import type { ReactNode } from "react";

import { BotonEnlace } from "../componentes/BotonEnlace";
import {
  Medidores,
  PanelAnticipacion,
  PanelExplicacion,
  PanelProcedencia,
  TarjetaHero,
} from "../componentes/paneles";
import { CORREO } from "../componentes/Pie";
import { Resaltado } from "../componentes/Resaltado";
import { useT } from "../i18n/contexto";
import type { Clave } from "../i18n/dict";

const CASOS = ["fintech", "comercio", "tesoreria", "dev", "medios"] as const;
const ENDPOINT_CASO: Record<(typeof CASOS)[number], string> = {
  fintech: "WSS p2p.snapshot",
  comercio: "/signals",
  tesoreria: "/indicators/history",
  dev: "OpenAPI · AsyncAPI",
  medios: "/analysis/current",
};

function Promesa({
  numero,
  titulo,
  texto,
  endpoint,
  panel,
  invertida = false,
}: {
  numero: Clave;
  titulo: Clave;
  texto: Clave;
  endpoint: string;
  panel: ReactNode;
  invertida?: boolean;
}) {
  const t = useT();
  const relato = (
    <div className="promesa-relato">
      <div className="promesa-numero">{t(numero)}</div>
      <h3>{t(titulo)}</h3>
      <p>{t(texto)}</p>
      <div className="promesa-pie">
        <code>{endpoint}</code>
        <BotonEnlace to="/dashboard" variant="secondary" icon="arrowRight">
          {t("comun.verDashboard")}
        </BotonEnlace>
      </div>
    </div>
  );
  return (
    <div className="promesa">
      {invertida ? (
        <>
          {panel}
          {relato}
        </>
      ) : (
        <>
          {relato}
          {panel}
        </>
      )}
    </div>
  );
}

export function Producto() {
  const t = useT();
  return (
    <main>
      <section className="hero">
        <div className="hero-halo hero-halo-teal" aria-hidden="true" />
        <div className="hero-halo hero-halo-coral" aria-hidden="true" />
        <div className="hero-contenido">
          <div className="hero-texto">
            <div>
              <Tag tone="teal">{t("hero.etiqueta")}</Tag>
            </div>
            <h1>
              <Resaltado texto={t("hero.titulo")} clase="degradado" />
            </h1>
            <p className="hero-parrafo">{t("hero.texto")}</p>
            <div className="hero-acciones">
              <BotonEnlace to="/dashboard" icon="arrowRight">
                {t("hero.ctaDashboard")}
              </BotonEnlace>
              <BotonEnlace to="/apis" variant="secondary">
                {t("hero.ctaApis")}
              </BotonEnlace>
            </div>
          </div>
          <TarjetaHero />
        </div>
      </section>

      <section className="banda banda-oscura">
        <div className="contenido">
          <header className="seccion-cabecera">
            <div className="seccion-etiqueta">{t("promesas.etiqueta")}</div>
            <h2>
              <Resaltado texto={t("promesas.titulo")} />
            </h2>
            <p>{t("promesas.texto")}</p>
          </header>

          <div className="promesas">
            <Promesa
              numero="procedencia.numero"
              titulo="procedencia.titulo"
              texto="procedencia.texto"
              endpoint="/analysis/current"
              panel={<PanelProcedencia />}
            />
            <Promesa
              numero="anticipacion.numero"
              titulo="anticipacion.titulo"
              texto="anticipacion.texto"
              endpoint="/signals · WSS signals"
              panel={<PanelAnticipacion />}
              invertida
            />
            <div className="promesa-ancha">
              <div className="promesa-ancha-cabecera">
                <div>
                  <div className="promesa-numero">{t("contexto.numero")}</div>
                  <h3>{t("contexto.titulo")}</h3>
                </div>
                <div>
                  <p>{t("contexto.texto")}</p>
                  <code>/indicators/current · /indicators/history</code>
                </div>
              </div>
              <Medidores />
            </div>
            <Promesa
              numero="explicacion.numero"
              titulo="explicacion.titulo"
              texto="explicacion.texto"
              endpoint="/analysis/current"
              panel={<PanelExplicacion />}
            />
          </div>
        </div>
      </section>

      <section className="banda">
        <div className="contenido">
          <header className="seccion-cabecera">
            <div className="seccion-etiqueta">{t("casos.etiqueta")}</div>
            <h2>
              <Resaltado texto={t("casos.titulo")} />
            </h2>
          </header>
          <div className="casos">
            {CASOS.map((caso) => (
              <article key={caso} className="caso">
                <div className="caso-quien">{t(`casos.${caso}.quien`)}</div>
                <h3>{t(`casos.${caso}.t`)}</h3>
                <p>{t(`casos.${caso}.d`)}</p>
                <code>{ENDPOINT_CASO[caso]}</code>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="banda banda-oscura cta">
        <div className="hero-halo hero-halo-cta" aria-hidden="true" />
        <div className="cta-contenido">
          <h2>
            <Resaltado texto={t("cta.titulo")} />
          </h2>
          <p>{t("cta.texto")}</p>
          <div className="hero-acciones centradas">
            <BotonEnlace to="/precios">{t("cta.niveles")}</BotonEnlace>
            <Button variant="secondary" href={`mailto:${CORREO}`}>
              {CORREO}
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
