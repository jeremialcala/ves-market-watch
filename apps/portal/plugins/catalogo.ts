/**
 * Plugin de Vite que sirve `virtual:catalogo`: el catálogo de la página APIs
 * generado de los contratos del gateway en cada build (RF-7). En desarrollo
 * vigila los dos YAML y recarga si cambian.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { load } from "js-yaml";
import type { Plugin } from "vite";

import { generarCatalogo } from "../src/catalogo/generar.ts";

const ID = "virtual:catalogo";
const ID_RESUELTO = `\0${ID}`;

export function catalogo(raizApp: string): Plugin {
  const contratos = resolve(raizApp, "../api-gateway/docs");
  const openapi = resolve(contratos, "openapi.yaml");
  const asyncapi = resolve(contratos, "asyncapi.yaml");
  return {
    name: "criterio-catalogo",
    resolveId(id) {
      return id === ID ? ID_RESUELTO : undefined;
    },
    load(id) {
      if (id !== ID_RESUELTO) {
        return undefined;
      }
      this.addWatchFile(openapi);
      this.addWatchFile(asyncapi);
      const generado = generarCatalogo(
        load(readFileSync(openapi, "utf8")),
        load(readFileSync(asyncapi, "utf8")),
      );
      return `export default ${JSON.stringify(generado)};`;
    },
  };
}
