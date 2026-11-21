/**
 * El catálogo de la página APIs (RF-7), **generado** desde los contratos del
 * gateway (`openapi.yaml` y `asyncapi.yaml`), no escrito a mano: un parámetro
 * que cambia en el YAML cambia la página en el siguiente build.
 *
 * Función pura sobre los documentos ya parseados. La llama el plugin de Vite
 * (`plugins/catalogo.ts`) en el build y en los tests; el navegador recibe solo el
 * resultado, como JSON.
 *
 * Sin imports: `vite.config.ts` la carga con `module: nodenext`.
 */

export interface Parametro {
  nombre: string;
  obligatorio: boolean;
  /** Valores admitidos si el contrato los enumera (`side=buy|sell`). */
  valores: string[] | null;
  /** El valor con el que el playground arma la petición de ejemplo. */
  ejemplo: string | null;
}

export interface Endpoint {
  /** Ruta completa con la base del contrato: `/api/v1/rates/p2p/current`. */
  ruta: string;
  resumen: string;
  /** Primera frase de la descripción, sin referencias internas a ADR. */
  descripcion: string;
  grupo: string;
  /** `security: []` en el contrato: responde sin token. */
  publico: boolean;
  parametros: Parametro[];
  /** Query de ejemplo con los obligatorios: `?side=buy`, o "". */
  consulta: string;
  /** Forma de la respuesta 200, armada con los `example` del esquema. */
  respuesta: unknown;
}

export interface CanalWss {
  ruta: string;
  topicos: string[];
  /** El mensaje de suscripción de ejemplo, tal como lo define el contrato. */
  suscribir: string;
}

export interface Catalogo {
  versionApi: string;
  endpoints: Endpoint[];
  wss: CanalWss;
}

type Nodo = Record<string, unknown>;

/** Grupos de la página por tag del contrato; un tag nuevo forma su propio grupo. */
const GRUPO_POR_TAG: Record<string, string> = {
  rates: "tasas",
  indicators: "indicadores",
  analysis: "indicadores",
  market: "mercado",
  signals: "mercado",
  system: "sistema",
};

const PROFUNDIDAD_MAXIMA = 8;

function objeto(valor: unknown, donde: string): Nodo {
  if (valor === null || typeof valor !== "object" || Array.isArray(valor)) {
    throw new Error(`catálogo: ${donde} no es un objeto`);
  }
  return valor as Nodo;
}

/** Sigue un `$ref` local (`#/components/...`). */
function resolver(doc: Nodo, nodo: unknown): Nodo {
  let actual = objeto(nodo, "nodo");
  for (let saltos = 0; typeof actual.$ref === "string"; saltos++) {
    if (saltos > 20) {
      throw new Error(`catálogo: $ref circular en ${actual.$ref}`);
    }
    const ref = actual.$ref;
    if (!ref.startsWith("#/")) {
      throw new Error(`catálogo: $ref no local ${ref}`);
    }
    actual = objeto(
      ref
        .slice(2)
        .split("/")
        .reduce<unknown>((n, parte) => (n as Nodo | undefined)?.[parte], doc),
      ref,
    );
  }
  return actual;
}

/** Un valor de ejemplo para el esquema: su `example`, su primer valor admitido o su tipo. */
function ejemploDe(doc: Nodo, esquema: unknown, profundidad = 0): unknown {
  const s = resolver(doc, esquema);
  if ("example" in s) {
    return s.example;
  }
  if ("const" in s) {
    return s.const;
  }
  if (Array.isArray(s.enum)) {
    return s.enum.find((v) => v !== null) ?? null;
  }
  for (const clave of ["oneOf", "anyOf"] as const) {
    const opciones = s[clave];
    if (Array.isArray(opciones)) {
      const util = opciones.find((o) => resolver(doc, o).type !== "null") ?? opciones[0];
      return ejemploDe(doc, util, profundidad);
    }
  }
  if (Array.isArray(s.allOf)) {
    // `allOf: [{$ref: Decimal}]` con una descripción al lado es un escalar: se
    // fusionan solo las partes que son objetos.
    const partes = s.allOf.map((p) => ejemploDe(doc, p, profundidad));
    const objetos = partes.filter((p) => p !== null && typeof p === "object" && !Array.isArray(p));
    return objetos.length === 0 ? (partes[0] ?? null) : Object.assign({}, ...objetos);
  }
  const tipo = Array.isArray(s.type) ? s.type.find((t) => t !== "null") : s.type;
  if (profundidad >= PROFUNDIDAD_MAXIMA) {
    return tipo === "array" ? [] : tipo === "object" ? {} : null;
  }
  if (tipo === "object" || (tipo === undefined && s.properties !== undefined)) {
    const props = (s.properties ?? {}) as Nodo;
    return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, ejemploDe(doc, v, profundidad + 1)]));
  }
  if (tipo === "array") {
    return s.items === undefined ? [] : [ejemploDe(doc, s.items, profundidad + 1)];
  }
  if (tipo === "integer" || tipo === "number") {
    return 0;
  }
  if (tipo === "boolean") {
    return true;
  }
  if (tipo === "string") {
    return typeof s.format === "string" ? `<${s.format}>` : "<string>";
  }
  return null;
}

/** La primera frase, sin «(ADR-0007)»: es para leer, no para auditar. */
function primeraFrase(texto: string): string {
  const parrafo = texto.trim().split(/\n\s*\n/)[0].replace(/\s+/g, " ");
  const limpio = parrafo.replace(/\s*\(ADR-\d+[^)]*\)/g, "");
  const fin = limpio.search(/\.(\s|$)/);
  return fin === -1 ? limpio : limpio.slice(0, fin + 1);
}

function texto(valor: unknown): string | null {
  return valor === undefined || valor === null ? null : String(valor);
}

function parametro(doc: Nodo, crudo: unknown): Parametro {
  const p = resolver(doc, crudo);
  const esquema = p.schema === undefined ? {} : resolver(doc, p.schema);
  const valores = Array.isArray(esquema.enum) ? esquema.enum.filter((v) => v !== null).map(String) : null;
  return {
    nombre: String(p.name),
    obligatorio: p.required === true,
    valores,
    ejemplo: texto(p.example ?? esquema.example ?? valores?.[0]),
  };
}

export function generarCatalogo(openapi: unknown, asyncapi: unknown): Catalogo {
  const doc = objeto(openapi, "openapi");
  const servidores = doc.servers as { url: string }[] | undefined;
  if (!servidores?.length) {
    throw new Error("catálogo: openapi sin servers");
  }
  const base = new URL(servidores[0].url).pathname.replace(/\/$/, "");
  const seguridadGlobal = doc.security;

  const endpoints: Endpoint[] = [];
  for (const [ruta, metodos] of Object.entries(objeto(doc.paths, "paths"))) {
    const op = (metodos as Nodo).get as Nodo | undefined;
    if (op === undefined) {
      continue;
    }
    const parametros = ((op.parameters ?? []) as unknown[]).map((p) => parametro(doc, p));
    const obligatorios = parametros.filter((p) => p.obligatorio && p.ejemplo !== null);
    const seguridad = op.security ?? seguridadGlobal;
    const tag = String((op.tags as string[] | undefined)?.[0] ?? "otros");
    const ok = resolver(doc, objeto(op.responses, `${ruta} responses`)["200"]);
    const cuerpo = (ok.content as Nodo | undefined)?.["application/json"] as Nodo | undefined;
    endpoints.push({
      ruta: `${base}${ruta}`,
      resumen: String(op.summary ?? ruta),
      descripcion: primeraFrase(String(op.description ?? "")),
      grupo: GRUPO_POR_TAG[tag] ?? tag,
      publico: Array.isArray(seguridad) && seguridad.length === 0,
      parametros,
      consulta:
        obligatorios.length === 0
          ? ""
          : `?${obligatorios.map((p) => `${p.nombre}=${encodeURIComponent(p.ejemplo ?? "").replaceAll("%3A", ":")}`).join("&")}`,
      respuesta: cuerpo?.schema === undefined ? null : ejemploDe(doc, cuerpo.schema),
    });
  }

  const asyn = objeto(asyncapi, "asyncapi");
  const canal = Object.values(objeto(asyn.channels, "channels"))[0] as Nodo;
  const componentes = objeto(asyn.components, "components");
  const topico = resolver(asyn, objeto(componentes.schemas, "schemas").topico);
  const topicos = (topico.enum as unknown[]).map(String);
  const suscribir = objeto(objeto(componentes.messages, "messages").suscribir, "suscribir");
  const accion = resolver(asyn, objeto(objeto(suscribir.payload, "payload").properties, "properties").action);

  return {
    versionApi: String(objeto(doc.info, "info").version),
    endpoints,
    wss: {
      ruta: String(canal.address),
      topicos,
      suscribir: JSON.stringify({ action: accion.const, topics: [topicos.includes("p2p.snapshot") ? "p2p.snapshot" : topicos[0]] }),
    },
  };
}
