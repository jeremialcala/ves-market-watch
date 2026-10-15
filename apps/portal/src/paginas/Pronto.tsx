/**
 * Las secciones que todavía no están construidas (Dashboard, Intradía,
 * Histórico, APIs, Precios y Estado). Dicen qué serán, con contenido real para
 * el prerender, y no fingen datos.
 */

import { Tag } from "@criterio/ui";

import { BotonEnlace } from "../componentes/BotonEnlace";
import { useT } from "../i18n/contexto";
import type { Ruta } from "../rutas";

export function Pronto({ ruta }: { ruta: Ruta }) {
  const t = useT();
  return (
    <main className="pagina-simple">
      <div className="contenido estrecho">
        <Tag tone="teal">{t("pronto.etiqueta")}</Tag>
        <h1>{t(ruta.titulo)}</h1>
        <p className="pagina-lead">{t(ruta.descripcion)}</p>
        <p>{t("pronto.texto")}</p>
        <BotonEnlace to="/" variant="secondary">
          {t("pronto.volver")}
        </BotonEnlace>
      </div>
    </main>
  );
}

export function NoEncontrada() {
  const t = useT();
  return (
    <main className="pagina-simple">
      <div className="contenido estrecho">
        <h1>{t("noEncontrada.titulo")}</h1>
        <p className="pagina-lead">{t("noEncontrada.desc")}</p>
        <BotonEnlace to="/" variant="secondary">
          {t("pronto.volver")}
        </BotonEnlace>
      </div>
    </main>
  );
}
