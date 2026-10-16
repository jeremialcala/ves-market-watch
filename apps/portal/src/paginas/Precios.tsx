/**
 * Precios (`/precios`, RF-8): los dos niveles y la tabla comparativa.
 *
 * Contenido fijo, sin datos ni backend: se prerenderiza entero (RNF-4). El
 * contacto Empresa es `mailto:` y WhatsApp, sin formulario (ADR-0030: el alta
 * es manual, tras la firma y el pago). El precio de referencia no se publica:
 * el nivel Empresa es «Habla con nosotros».
 *
 * «Crear acceso gratis» lleva a Intradía, como en el diseño, aunque el acceso
 * Comunidad todavía no exista (decisión de Jeremi, 2026-10-15): esa página
 * dice «pronto» hasta la fase 5.
 */

import { Button, Icon } from "@criterio/ui";

import { BotonEnlace } from "../componentes/BotonEnlace";
import { CORREO, WHATSAPP } from "../componentes/Pie";
import { Resaltado } from "../componentes/Resaltado";
import { useT } from "../i18n/contexto";
import type { Clave } from "../i18n/dict";

const COMUNIDAD_INCLUYE = ["precios.comunidad.f1", "precios.comunidad.f2", "precios.comunidad.f3"] as const;
const EMPRESA_INCLUYE = [
  "precios.empresa.f1",
  "precios.empresa.f2",
  "precios.empresa.f3",
  "precios.empresa.f4",
  "precios.empresa.f5",
] as const;

/** Filas de la tabla: [concepto, Comunidad, Empresa, ¿Empresa en acento?]. Sin valor, «—». */
const FILAS: readonly (readonly [Clave, Clave | null, Clave, boolean])[] = [
  ["precios.tabla.dashboard", "precios.tabla.dashboard.c", "precios.tabla.si", false],
  ["precios.tabla.portal", "precios.tabla.portal.c", "precios.tabla.si", false],
  ["precios.tabla.rest", null, "precios.tabla.rest.e", true],
  ["precios.tabla.wss", null, "precios.tabla.wss.e", true],
  ["precios.tabla.historia", null, "precios.tabla.historia.e", false],
  ["precios.tabla.soporte", "precios.tabla.soporte.c", "precios.tabla.soporte.e", false],
];

function Incluye({ clave }: { clave: Clave }) {
  const t = useT();
  return (
    <li>
      <Icon name="check" size={15} className="nivel-marca" />
      {t(clave)}
    </li>
  );
}

export function Precios() {
  const t = useT();
  return (
    <main className="precios">
      <div className="contenido">
        <header className="seccion-cabecera">
          <div className="seccion-etiqueta">{t("precios.etiqueta")}</div>
          <h1>
            <Resaltado texto={t("precios.lema")} />
          </h1>
        </header>

        <div className="niveles">
          <section className="nivel" aria-labelledby="nivel-comunidad">
            <h2 id="nivel-comunidad">{t("precios.comunidad")}</h2>
            <div className="nivel-precio resaltado">{t("precios.comunidad.precio")}</div>
            <p className="nivel-para">{t("precios.comunidad.para")}</p>
            <ul className="nivel-lista">
              {COMUNIDAD_INCLUYE.map((clave) => (
                <Incluye key={clave} clave={clave} />
              ))}
              <li className="nivel-excluye">
                <Icon name="close" size={15} className="nivel-marca" />
                <span className="solo-lectores">{t("precios.noIncluye")} </span>
                {t("precios.comunidad.x1")}
              </li>
            </ul>
            <div className="nivel-acciones">
              <BotonEnlace to="/intradia" variant="secondary">
                {t("precios.comunidad.cta")}
              </BotonEnlace>
            </div>
          </section>

          <section className="nivel nivel-empresa" aria-labelledby="nivel-empresa">
            <h2 id="nivel-empresa">{t("precios.empresa")}</h2>
            <div className="nivel-precio">{t("precios.empresa.precio")}</div>
            <p className="nivel-para">{t("precios.empresa.para")}</p>
            <ul className="nivel-lista">
              {EMPRESA_INCLUYE.map((clave) => (
                <Incluye key={clave} clave={clave} />
              ))}
            </ul>
            <div className="nivel-acciones">
              <Button href={`mailto:${CORREO}`} icon="mail" iconPosition="start">
                {CORREO}
              </Button>
              <Button variant="secondary" href={WHATSAPP} target="_blank" rel="noopener noreferrer">
                {t("precios.empresa.whatsapp")}
              </Button>
            </div>
          </section>
        </div>

        <div className="panel comparativa">
          <table>
            <caption className="solo-lectores">{t("precios.tabla.titulo")}</caption>
            <thead>
              <tr>
                <td />
                <th scope="col">{t("precios.comunidad")}</th>
                <th scope="col">{t("precios.empresa")}</th>
              </tr>
            </thead>
            <tbody>
              {FILAS.map(([concepto, comunidad, empresa, acento]) => (
                <tr key={concepto}>
                  <th scope="row">{t(concepto)}</th>
                  <td>{comunidad === null ? <span aria-label={t("precios.tabla.no")}>—</span> : t(comunidad)}</td>
                  <td className={acento ? "resaltado" : undefined}>{t(empresa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
