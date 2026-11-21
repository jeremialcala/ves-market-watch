/** El catálogo de APIs sale de los contratos del gateway (RF-7). */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

import { generarCatalogo } from "../../src/catalogo/generar";

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function contrato(nombre: string): Doc {
  return load(readFileSync(resolve(process.cwd(), "../api-gateway/docs", nombre), "utf8")) as Doc;
}

const openapi = () => contrato("openapi.yaml");
const asyncapi = () => contrato("asyncapi.yaml");

describe("catálogo desde los contratos reales", () => {
  const c = generarCatalogo(openapi(), asyncapi());

  it("8 endpoints de datos con token y /health público", () => {
    expect(c.endpoints).toHaveLength(9);
    expect(c.endpoints.filter((e) => !e.publico)).toHaveLength(8);
    expect(c.endpoints.filter((e) => e.publico).map((e) => e.ruta)).toEqual(["/api/v1/health"]);
  });

  it("agrupados como la página y con la base del contrato", () => {
    expect(Object.fromEntries(c.endpoints.map((e) => [e.ruta, e.grupo]))).toEqual({
      "/api/v1/rates/official/current": "tasas",
      "/api/v1/rates/official/history": "tasas",
      "/api/v1/rates/p2p/current": "tasas",
      "/api/v1/indicators/current": "indicadores",
      "/api/v1/indicators/history": "indicadores",
      "/api/v1/analysis/current": "indicadores",
      "/api/v1/market/depth": "mercado",
      "/api/v1/signals": "mercado",
      "/api/v1/health": "sistema",
    });
  });

  it("los parámetros reales, con la consulta de ejemplo de los obligatorios", () => {
    const p2p = c.endpoints.find((e) => e.ruta === "/api/v1/rates/p2p/current")!;
    expect(p2p.parametros).toEqual([{ nombre: "side", obligatorio: true, valores: ["buy", "sell"], ejemplo: "buy" }]);
    expect(p2p.consulta).toBe("?side=buy");
    const historia = c.endpoints.find((e) => e.ruta === "/api/v1/indicators/history")!;
    expect(historia.parametros.find((p) => p.nombre === "interval")?.valores).toEqual(["5m", "15m", "1h", "1d"]);
    expect(historia.consulta).toBe("?from=2026-07-10T00:00:00Z&to=2026-07-17T00:00:00Z");
  });

  it("la descripción es la primera frase, sin referencias a ADR", () => {
    const oficial = c.endpoints.find((e) => e.ruta === "/api/v1/rates/official/current")!;
    expect(oficial.descripcion).toBe("Última tasa oficial BCV en estado `valid`.");
  });

  it("la forma de la respuesta usa los ejemplos del esquema, también tras un allOf", () => {
    const p2p = c.endpoints.find((e) => e.ruta === "/api/v1/rates/p2p/current")!;
    expect(p2p.respuesta).toMatchObject({ side: "buy", best_price: "417.03", vwap: "417.03", as_of: "<date-time>" });
  });

  it("el WSS con sus cinco tópicos y el mensaje de suscripción del contrato", () => {
    expect(c.wss.ruta).toBe("/ws/v1");
    expect(c.wss.topicos).toEqual(["rates.official", "p2p.snapshot", "indicators", "signals", "analysis"]);
    expect(JSON.parse(c.wss.suscribir)).toEqual({ action: "subscribe", topics: ["p2p.snapshot"] });
  });
});

describe("el catálogo sigue al contrato", () => {
  it("un parámetro que cambia en openapi.yaml cambia el catálogo", () => {
    const doc = openapi();
    doc.components.parameters.Side.schema.enum = ["buy", "sell", "both"];
    doc.paths["/health"].get.summary = "Otro resumen";
    const c = generarCatalogo(doc, asyncapi());
    expect(c.endpoints.find((e) => e.ruta === "/api/v1/market/depth")!.parametros[0].valores).toEqual(["buy", "sell", "both"]);
    expect(c.endpoints.find((e) => e.publico)!.resumen).toBe("Otro resumen");
  });

  it("un endpoint nuevo con un tag nuevo forma su grupo; sin security propia hereda la global", () => {
    const doc = openapi();
    doc.paths["/nuevo"] = {
      get: { tags: ["nuevo"], summary: "Nuevo", responses: { "200": { description: "ok" } } },
      post: {},
    };
    doc.paths["/sin-get"] = { post: {} };
    const nuevo = generarCatalogo(doc, asyncapi()).endpoints.find((e) => e.ruta === "/api/v1/nuevo")!;
    expect(nuevo.grupo).toBe("nuevo");
    expect(nuevo.publico).toBe(false);
    expect(nuevo.respuesta).toBeNull();
    expect(nuevo.descripcion).toBe("");
  });

  it("un tópico nuevo del asyncapi llega a la página", () => {
    const doc = asyncapi();
    doc.components.schemas.topico.enum = ["depth"];
    const c = generarCatalogo(openapi(), doc);
    expect(c.wss.topicos).toEqual(["depth"]);
    expect(JSON.parse(c.wss.suscribir).topics).toEqual(["depth"]);
  });
});

describe("contratos rotos fallan el build", () => {
  it("sin servers", () => {
    const doc = openapi();
    delete doc.servers;
    expect(() => generarCatalogo(doc, asyncapi())).toThrow("sin servers");
  });

  it("un $ref externo o circular", () => {
    const externo = openapi();
    externo.paths["/health"].get.responses["200"] = { $ref: "otro.yaml#/x" };
    expect(() => generarCatalogo(externo, asyncapi())).toThrow("no local");
    const circular = openapi();
    circular.components.schemas.Health = { $ref: "#/components/schemas/Health" };
    expect(() => generarCatalogo(circular, asyncapi())).toThrow("circular");
  });

  it("un documento que no es un objeto", () => {
    expect(() => generarCatalogo(null, asyncapi())).toThrow("openapi no es un objeto");
  });
});

describe("ejemplos de esquemas", () => {
  function forma(esquema: unknown): unknown {
    const doc = openapi();
    doc.paths = {
      "/x": {
        get: { summary: "x", security: [], responses: { "200": { content: { "application/json": { schema: esquema } } } } },
      },
    };
    return generarCatalogo(doc, asyncapi()).endpoints[0].respuesta;
  }

  it.each([
    [{ type: "integer" }, 0],
    [{ type: "number" }, 0],
    [{ type: "boolean" }, true],
    [{ type: "string" }, "<string>"],
    [{ type: ["string", "null"], format: "date" }, "<date>"],
    [{ const: "subscribe" }, "subscribe"],
    [{ enum: [null, "a"] }, "a"],
    [{ oneOf: [{ type: "null" }, { type: "integer" }] }, 0],
    [{ anyOf: [{ type: "null" }] }, null],
    [{ type: "array" }, []],
    [{ properties: { a: { type: "boolean" } } }, { a: true }],
    [{ allOf: [{ properties: { a: { type: "integer" } } }, { properties: { b: { type: "boolean" } } }] }, { a: 0, b: true }],
    [{}, null],
  ])("%j → %j", (esquema, esperado) => {
    expect(forma(esquema)).toEqual(esperado);
  });

  it("corta la recursión a 8 niveles", () => {
    let esquema: Record<string, unknown> = { type: "object", properties: {} };
    const raiz = esquema;
    for (let i = 0; i < 10; i++) {
      const hijo = { type: "object", properties: {} };
      (esquema.properties as Record<string, unknown>).h = hijo;
      esquema = hijo;
    }
    (esquema.properties as Record<string, unknown>).lista = { type: "array", items: { type: "integer" } };
    const profundo = JSON.stringify(forma(raiz));
    expect(profundo.match(/"h"/g)).toHaveLength(8);
  });
});
