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
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { config } from "../../src/config";

const raiz = process.cwd();
/** Sin comentarios: la palabra «location» aparece también en la prosa. */
const sinComentarios = (texto: string) =>
  texto.replace(/^\s*#.*$/gm, "");
const NGINX = sinComentarios(readFileSync(resolve(raiz, "nginx.conf"), "utf8"));
const CABECERAS = readFileSync(
  resolve(raiz, "nginx-security-headers.conf"),
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

  it("la imagen copia el fragmento fuera de conf.d", () => {
    // En conf.d se auto-incluiría como server; tiene que ser un include suelto.
    expect(DOCKERFILE).toContain(`nginx-security-headers.conf ${SNIPPET}`);
  });
});

describe("directivas de la CSP", () => {
  const csp =
    CABECERAS.match(/Content-Security-Policy\s+"([^"]+)"/)?.[1] ?? "";
  const directiva = (nombre: string) =>
    csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${nombre} `)) ?? "";

  it("frame-src permite el tenant del bundle (iframe de silent auth)", () => {
    expect(directiva("frame-src")).toContain(`https://${config.auth0Domain}`);
  });

  it("connect-src permite el mismo tenant y la API", () => {
    expect(directiva("connect-src")).toContain(`https://${config.auth0Domain}`);
    expect(directiva("connect-src")).toContain(config.apiBaseUrl);
  });

  it("mantiene los controles de T12", () => {
    expect(directiva("script-src")).toBe("script-src 'self'"); // sin unsafe-inline
    expect(csp).toContain("frame-ancestors 'none'"); // clickjacking
    expect(directiva("default-src")).toBe("default-src 'self'");
  });
});
