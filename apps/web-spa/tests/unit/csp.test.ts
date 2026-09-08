/**
 * Canario de las cabeceras de seguridad del nginx.
 *
 * Lo que se vigila aquí no es el texto de la CSP por gusto, sino la trampa que
 * la dejó sin efecto: en nginx, un `location` que declara `add_header` propio
 * **descarta todos los heredados** del `server`. Los dos locations de cache
 * tenían el suyo, así que el sitio se sirvió sin CSP, sin nosniff y sin
 * Referrer-Policy pese a estar escritas en la config. Nada fallaba.
 *
 * Y `frame-src`: el SDK de Auth0 re-autentica en silencio con un iframe
 * `prompt=none` (`useRefreshTokensFallback`). Sin la directiva, cae en
 * `default-src 'self'`, el iframe se bloquea y cada recarga acaba en Universal
 * Login visible — que es justo lo que ese fallback existe para evitar.
 *
 * Desde que la CSP es plantilla, hay un tercer modo de fallo que vigilar: una
 * variable mal escrita rinde un `${...}` literal en la cabecera. Cabecera
 * escrita, cabecera inútil: la reencarnación exacta del bug de julio.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { config, wsUrl } from "../../src/config";

const raiz = process.cwd();
/** Sin comentarios: la palabra «location» aparece también en la prosa. */
const sinComentarios = (texto: string) => texto.replace(/^\s*#.*$/gm, "");
const NGINX = sinComentarios(readFileSync(resolve(raiz, "nginx.conf"), "utf8"));
const PLANTILLA = readFileSync(
  resolve(raiz, "nginx-security-headers.conf.template"),
  "utf8",
);
const DOCKERFILE = readFileSync(resolve(raiz, "Dockerfile"), "utf8");

const SNIPPET = "/etc/nginx/security-headers.conf";

/** Cuerpos de cada bloque `location …{ … }` (sin anidados, que aquí no hay). */
function locations(conf: string): { cabecera: string; cuerpo: string }[] {
  const salida: { cabecera: string; cuerpo: string }[] = [];
  const re = /location\s+([^{]+)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(conf)) !== null) {
    const desde = m.index + m[0].length;
    const hasta = conf.indexOf("}", desde);
    salida.push({ cabecera: m[1].trim(), cuerpo: conf.slice(desde, hasta) });
  }
  return salida;
}

/** Las `${VAR}` que la plantilla espera que alguien sustituya. */
function variablesDe(plantilla: string): string[] {
  return [...new Set(plantilla.match(/\$\{[A-Z0-9_]+\}/g) ?? [])];
}

/** Default de un `ARG NOMBRE=valor` del Dockerfile. */
function argDefault(nombre: string): string | undefined {
  return DOCKERFILE.match(new RegExp(`^ARG ${nombre}=(.+)$`, "m"))?.[1].trim();
}

describe("cabeceras de seguridad del nginx", () => {
  it("todo location con add_header propio incluye también el fragmento", () => {
    for (const { cabecera, cuerpo } of locations(NGINX)) {
      if (!cuerpo.includes("add_header")) {
        continue; // sin add_header propio, hereda los del server
      }
      expect(
        cuerpo.includes(SNIPPET),
        `el location "${cabecera}" declara add_header y NO incluye ${SNIPPET}: ` +
          "nginx descartará las cabeceras heredadas y se servirá sin CSP",
      ).toBe(true);
    }
  });

  it("el server incluye el fragmento para el resto de rutas", () => {
    const antesDelPrimerLocation = NGINX.split("location")[0];
    expect(antesDelPrimerLocation).toContain(SNIPPET);
  });

  it("la imagen genera el fragmento fuera de conf.d", () => {
    // En conf.d se auto-incluiría como server; tiene que ser un include suelto.
    expect(DOCKERFILE).toContain(`> ${SNIPPET}`);
  });
});

describe("contrato de sustitución de la plantilla", () => {
  const variables = variablesDe(PLANTILLA);

  it("la plantilla declara las variables que espera", () => {
    expect(variables).toContain("${VITE_AUTH0_DOMAIN}");
    expect(variables).toContain("${VITE_API_BASE_URL}");
    expect(variables).toContain("${VITE_WS_BASE_URL}");
  });

  it("cada variable de la plantilla se sustituye de verdad en el build", () => {
    // envsubst con lista EXPLÍCITA (sin ella se comería las $uri/$host de
    // nginx). Si una variable falta en esa lista, sale un `${...}` literal.
    const lista =
      DOCKERFILE.match(/envsubst\s+'([^']+)'/)?.[1] ?? "";
    for (const variable of variables) {
      expect(
        lista.includes(variable),
        `${variable} está en la plantilla pero NO en la lista de envsubst: ` +
          "quedaría literal en la cabecera servida",
      ).toBe(true);
    }
  });

  it("el build aborta si queda alguna variable sin sustituir", () => {
    // El cinturón: una CSP con `${...}` es una cabecera escrita que no protege.
    // Sobre líneas NO comentadas: la prosa de la plantilla nombra las variables,
    // y un guard ingenuo se matea a sí mismo (nos pasó, y rompió el build).
    expect(DOCKERFILE).toMatch(/grep -v '\^\[\[:space:\]\]\*#'/);
    expect(DOCKERFILE).toMatch(/grep -q '\\\$\{'/);
  });

  it("los ARG del build reproducen los defaults del bundle", () => {
    // Si divergen, el contenedor sirve un bundle que apunta al tenant X con una
    // CSP que permite el tenant Y. Un solo input, dos destinos: aquí se comprueba.
    expect(argDefault("VITE_AUTH0_DOMAIN")).toBe(config.auth0Domain);
    expect(argDefault("VITE_API_BASE_URL")).toBe(config.apiBaseUrl);
    expect(argDefault("VITE_AUTH0_CLIENT_ID")).toBe(config.auth0ClientId);
    expect(argDefault("VITE_AUTH0_AUDIENCE")).toBe(config.auth0Audience);
  });
});

describe("directivas de la CSP", () => {
  /** La plantilla renderizada con los defaults del bundle: lo que se sirve. */
  const csp = (() => {
    const origenWss = new URL(wsUrl("x")).origin;
    const rendered = PLANTILLA.replaceAll("${VITE_AUTH0_DOMAIN}", config.auth0Domain)
      .replaceAll("${VITE_API_BASE_URL}", config.apiBaseUrl)
      .replaceAll("${VITE_WS_BASE_URL}", origenWss);
    return rendered.match(/Content-Security-Policy\s+"([^"]+)"/)?.[1] ?? "";
  })();
  const directiva = (nombre: string) =>
    csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${nombre} `)) ?? "";

  it("no queda ninguna variable sin resolver", () => {
    expect(csp).not.toContain("${");
    expect(csp).not.toBe("");
  });

  it("frame-src permite el tenant del bundle (iframe de silent auth)", () => {
    expect(directiva("frame-src")).toContain(`https://${config.auth0Domain}`);
  });

  it("connect-src permite el tenant, la API y su WSS", () => {
    expect(directiva("connect-src")).toContain(`https://${config.auth0Domain}`);
    expect(directiva("connect-src")).toContain(config.apiBaseUrl);
    // El origen WSS se DERIVA de wsUrl(), no se escribe: así la regla
    // `^http → ws` no puede divergir entre el bundle y la CSP.
    expect(directiva("connect-src")).toContain(new URL(wsUrl("x")).origin);
  });

  it("worker-src permite blob: (el canje de tokens vive en un Web Worker)", () => {
    // Sin esto el worker de auth0-spa-js construye pero muere al cargar, SIN
    // excepción ni petición de red: el login se cuelga en «Verificando sesión…»
    // con el ?code= en la URL. Nos pasó al hacer que la CSP se enviara de
    // verdad (commit 798b83b). Es el canario más caro de esta suite.
    expect(directiva("worker-src")).toContain("blob:");
  });

  it("mantiene los controles de T12", () => {
    expect(directiva("script-src")).toBe("script-src 'self'"); // sin unsafe-inline
    expect(csp).toContain("frame-ancestors 'none'"); // clickjacking
    expect(directiva("default-src")).toBe("default-src 'self'");
    // `blob:` en worker-src NO relaja script-src: un blob solo puede llevar
    // código del propio origen.
    expect(directiva("script-src")).not.toContain("blob:");
  });
});
