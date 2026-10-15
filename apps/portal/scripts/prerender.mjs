// Prerender del portal (RNF-4, ADR-0031): escribe el HTML de cada ruta en
// `dist/<ruta>/index.html`, con el contenido ya pintado, su título y su
// descripción. Un buscador lo lee sin ejecutar JavaScript; el navegador lo
// hidrata.
//
// Corre tras `vite build` (cliente) y `vite build --ssr` (servidor). Falla si
// alguna ruta sale vacía: es la comprobación de la ADR («HTML con contenido, no
// un `<div id="root">` vacío»), hecha en cada build y no solo a mano.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadEnv } from "vite";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(raiz, "dist");
const servidor = join(raiz, "dist-ssr", "entry-server.js");

const { RUTAS, RUTA_404, cabeceras, pintar, metadatos } = await import(pathToFileURL(servidor).href);
const plantilla = readFileSync(join(dist, "index.html"), "utf8");

const escapar = (texto) =>
  texto.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const MARCA = "<!--app-->";
if (!plantilla.includes(MARCA)) {
  console.error(`prerender: index.html no tiene la marca ${MARCA}`);
  process.exit(1);
}

function escribir(ruta, destino, { indexar = true } = {}) {
  const html = pintar(ruta);
  if (html.length < 500 || !html.includes("<main")) {
    console.error(`prerender: la ruta ${ruta} salió vacía (${html.length} bytes)`);
    process.exit(1);
  }
  const { titulo, descripcion } = metadatos(ruta);
  const robots = indexar ? "" : '\n    <meta name="robots" content="noindex" />';
  const pagina = plantilla
    .replace(MARCA, () => html)
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapar(titulo)}</title>`)
    .replace(
      /<meta name="description" content="[^"]*" \/>/,
      () => `<meta name="description" content="${escapar(descripcion)}" />${robots}`,
    );
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, pagina);
  console.log(`prerender: ${ruta.padEnd(11)} ${String(pagina.length).padStart(7)} bytes`);
}

for (const { ruta } of RUTAS) {
  escribir(ruta, ruta === "/" ? join(dist, "index.html") : join(dist, ruta.slice(1), "index.html"));
}

// La página 404: Workers la sirve, con estado 404, a cualquier ruta que no
// sea un fichero (`not_found_handling: "404-page"`, ADR-0035). Al hidratar, el
// router ve una ruta desconocida y pinta lo mismo.
escribir(RUTA_404, join(dist, "404.html"), { indexar: false });

// Las cabeceras de Workers, con el mismo VITE_PORTAL_API que vio `vite build`
// (loadEnv lee el entorno y los .env igual que Vite).
const { VITE_PORTAL_API } = loadEnv("production", raiz, "VITE_");
writeFileSync(join(dist, "_headers"), cabeceras(VITE_PORTAL_API));
console.log(`prerender: _headers    connect-src ${VITE_PORTAL_API || "(solo el propio origen)"}`);

// El bundle de servidor solo sirve para esto: no se despliega.
rmSync(join(raiz, "dist-ssr"), { recursive: true, force: true });
