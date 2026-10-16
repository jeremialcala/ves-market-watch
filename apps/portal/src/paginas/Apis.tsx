/**
 * APIs (`/apis`, RF-7): el catálogo de REST y WSS y un playground que ejecuta
 * de verdad.
 *
 * El catálogo no está escrito aquí: llega de `virtual:catalogo`, que el build
 * genera desde `openapi.yaml` y `asyncapi.yaml` (plugins/catalogo.ts). Los
 * textos de cada endpoint son los del contrato, en español también con la
 * página en inglés: es el contrato, no una traducción.
 *
 * El playground llama al gateway sin token desde el navegador (CORS admite el
 * origen del portal): `/health` da 200 y el resto su 401 real; el WSS, su
 * cierre 4401. A los endpoints de pago se les enseña además la forma de la
 * respuesta 200 que fija el contrato, con sus valores de ejemplo.
 */

import { Button, Tag } from "@criterio/ui";
import catalogo from "virtual:catalogo";
import { useRef, useState } from "react";

import { BASE_API } from "../api/cliente";
import type { Endpoint } from "../catalogo/generar";
import { BotonEnlace } from "../componentes/BotonEnlace";
import { Resaltado } from "../componentes/Resaltado";
import { useT } from "../i18n/contexto";
import type { Clave } from "../i18n/dict";
import {
  baseWss,
  comandoCurl,
  comandoWscat,
  ejecutarHttp,
  json,
  probarWss,
  urlEndpoint,
  type Resultado,
} from "../lib/playground";

const REPO = "https://github.com/jeremialcala/ves-market-watch/blob/main/apps/api-gateway/docs";
const WSS = "wss";

/** Los grupos de la página, en este orden; uno nuevo del contrato va al final, con su tag por nombre. */
const ETIQUETA_GRUPO: Record<string, Clave> = {
  tasas: "apis.grupo.tasas",
  indicadores: "apis.grupo.indicadores",
  mercado: "apis.grupo.mercado",
  sistema: "apis.grupo.sistema",
};
const ORDEN_GRUPOS = Object.keys(ETIQUETA_GRUPO);

const CHIPS: readonly Clave[] = ["apis.chip.oauth", "apis.chip.cuota", "apis.chip.rango", "apis.chip.errores", "apis.chip.wss"];

function grupos(endpoints: readonly Endpoint[]): [string, Endpoint[]][] {
  const nombres = [...new Set(endpoints.map((e) => e.grupo))].sort(
    (a, b) => (ORDEN_GRUPOS.indexOf(a) + 1 || 99) - (ORDEN_GRUPOS.indexOf(b) + 1 || 99),
  );
  return nombres.map((g) => [g, endpoints.filter((e) => e.grupo === g)]);
}

function Parametros({ e }: { e: Endpoint }) {
  const t = useT();
  if (e.parametros.length === 0) {
    return null;
  }
  return (
    <span className="api-parametros">
      {e.parametros.map((p) => (
        <span key={p.nombre}>
          <code>{p.valores === null ? p.nombre : `${p.nombre}=${p.valores.join("|")}`}</code>{" "}
          {t(p.obligatorio ? "apis.obligatorio" : "apis.opcional")}
        </span>
      ))}
    </span>
  );
}

function EstadoEjecucion({ r, ejecutando }: { r: Resultado | null; ejecutando: boolean }) {
  const t = useT();
  if (ejecutando) {
    return <span className="api-estado">{t("apis.ejecutando")}</span>;
  }
  if (r === null) {
    return <span className="api-estado">{t("apis.sinEjecutar")}</span>;
  }
  if (r.tipo === "error") {
    return <span className="api-estado tono-coral">{t("apis.errorRed")}</span>;
  }
  if (r.tipo === "wss") {
    return <span className="api-estado tono-coral">{t("apis.cierreWss", { codigo: r.codigo, ms: r.ms })}</span>;
  }
  return (
    <span className={r.estado < 400 ? "api-estado resaltado" : "api-estado tono-coral"}>
      {`${r.estado} ${r.frase} · ${r.ms} ms`}
    </span>
  );
}

export function Apis() {
  const t = useT();
  const [elegido, setElegido] = useState<string>(
    catalogo.endpoints.find((e) => e.publico)?.ruta ?? catalogo.endpoints[0]?.ruta ?? WSS,
  );
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [ejecutando, setEjecutando] = useState(false);
  const playground = useRef<HTMLElement>(null);

  const endpoint = catalogo.endpoints.find((e) => e.ruta === elegido) ?? null;
  const esWss = endpoint === null;

  function elegir(ruta: string) {
    setElegido(ruta);
    setResultado(null);
    // En una columna, el playground queda debajo del catálogo: se lleva a la vista.
    if (window.matchMedia?.("(max-width: 900px)").matches) {
      playground.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }
  }

  async function ejecutar() {
    setEjecutando(true);
    const r =
      endpoint === null
        ? await probarWss(`${baseWss(BASE_API) || `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`}${catalogo.wss.ruta}`)
        : await ejecutarHttp(urlEndpoint(BASE_API, endpoint));
    setResultado(r);
    setEjecutando(false);
  }

  const publico = endpoint?.publico === true;
  const cerrado = resultado !== null && !publico;

  return (
    <main className="apis">
      <div className="contenido">
        <header className="apis-cabecera">
          <div className="seccion-etiqueta">{t("apis.etiqueta")}</div>
          <h1>
            <Resaltado texto={t("apis.lema")} />
          </h1>
          <p>{t("apis.lead")}</p>
          <ul className="apis-chips">
            {CHIPS.map((c) => (
              <li key={c}>{t(c)}</li>
            ))}
          </ul>
        </header>

        <div className="apis-cuerpo">
          <nav className="api-catalogo" aria-label={t("apis.catalogo")}>
            {grupos(catalogo.endpoints).map(([grupo, lista]) => (
              <section key={grupo}>
                <h2>{grupo in ETIQUETA_GRUPO ? t(ETIQUETA_GRUPO[grupo]) : grupo}</h2>
                {lista.map((e) => (
                  <button
                    key={e.ruta}
                    type="button"
                    className="api-item"
                    aria-pressed={elegido === e.ruta}
                    onClick={() => elegir(e.ruta)}
                  >
                    <span className="api-metodo">GET</span>
                    <span className="api-texto">
                      <code className="api-ruta">{e.ruta}</code>
                      <span className="api-resumen">{e.resumen}</span>
                      <Parametros e={e} />
                    </span>
                  </button>
                ))}
              </section>
            ))}
            <section>
              <h2>{t("apis.grupo.websocket")}</h2>
              <button
                type="button"
                className="api-item"
                aria-pressed={esWss}
                onClick={() => elegir(WSS)}
              >
                <span className="api-metodo">WSS</span>
                <span className="api-texto">
                  <code className="api-ruta">{catalogo.wss.ruta}</code>
                  <span className="api-resumen">
                    {t("apis.wss.resumen", { n: catalogo.wss.topicos.length, topicos: catalogo.wss.topicos.join(", ") })}
                  </span>
                </span>
              </button>
            </section>
          </nav>

          <section className="panel api-playground" ref={playground} aria-labelledby="playground-titulo" aria-live="polite">
            <div className="api-playground-cabecera">
              <span className="panel-cabecera">{t("apis.playground")}</span>
              <Tag tone={publico ? "sage" : "coral"}>{t(publico ? "apis.publico" : "apis.empresa")}</Tag>
            </div>
            <h2 id="playground-titulo">
              <code>{esWss ? `WSS ${catalogo.wss.ruta}` : `GET ${endpoint.ruta}`}</code>
            </h2>
            <p className="api-descripcion">
              {esWss
                ? t("apis.wss.descripcion", { topicos: catalogo.wss.topicos.join(", ") })
                : endpoint.descripcion || endpoint.resumen}
            </p>
            <p className="api-contrato">
              {t("apis.contrato")}{" "}
              <a href={`${REPO}/${esWss ? "asyncapi.yaml" : "openapi.yaml"}`} target="_blank" rel="noopener noreferrer">
                {esWss ? "AsyncAPI · asyncapi.yaml" : "OpenAPI · openapi.yaml"}
              </a>
            </p>
            <pre className="api-codigo">
              <code>
                {esWss
                  ? comandoWscat(BASE_API, catalogo.wss.ruta, catalogo.wss.suscribir)
                  : comandoCurl(BASE_API, endpoint)}
              </code>
            </pre>
            <div className="api-acciones">
              <Button onClick={() => void ejecutar()} disabled={ejecutando}>
                {t("apis.ejecutar")}
              </Button>
              <EstadoEjecucion r={resultado} ejecutando={ejecutando} />
            </div>
            {resultado?.tipo === "http" && (
              <pre className="api-codigo api-respuesta" aria-label={t("apis.respuesta")}>
                <code>{resultado.cuerpo}</code>
              </pre>
            )}
            {cerrado && endpoint !== null && (
              <pre className="api-codigo api-respuesta" aria-label={t("apis.forma")}>
                <code>{`// ${t("apis.forma")}\n${json(endpoint.respuesta)}`}</code>
              </pre>
            )}
            {cerrado && (
              <div className="api-empresa">
                <span>{t("apis.abreEmpresa")}</span>
                <BotonEnlace to="/precios">{t("precios.empresa.precio")}</BotonEnlace>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
