/**
 * El fichero `_headers` del portal en Workers (ADR-0035): cabeceras de
 * seguridad y de caché para los assets estáticos.
 *
 * Lo escribe el prerender con el mismo `VITE_PORTAL_API` que hornea el bundle.
 * Es la regla del `web-spa` (nginx-security-headers.conf.template): el origen
 * de la API en el código y en `connect-src` salen de un único input. Si
 * divergieran, el navegador bloquearía el sondeo con la cabecera escrita y
 * aparentemente correcta.
 *
 * Sin `main` en `wrangler.jsonc`, Workers sirve solo assets y aplica este
 * fichero a todas las respuestas. Si algún día hay un script, sus respuestas
 * no lo heredan.
 */

/** El origen de la API, validado: `https://host` sin ruta ni barra final. */
export function origenApi(api: string | undefined): string | null {
  if (api === undefined || api === "") {
    return null;
  }
  const url = new URL(api);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search !== "" || api.endsWith("/")) {
    throw new Error(`VITE_PORTAL_API tiene que ser un origen https sin ruta: ${api}`);
  }
  return url.origin;
}

/**
 * La CSP. Sin `'unsafe-inline'` en scripts ni en hojas de estilo: el bundle no
 * tiene ni uno ni otro. Sí en `style-src-attr`, porque los componentes de
 * `@criterio/ui` pintan con atributos `style` y el HTML prerenderizado los
 * lleva: sin eso, la primera pintura saldría sin estilo hasta hidratar. Un
 * atributo `style` no ejecuta código.
 */
export function politica(api: string | null): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${api === null ? "" : ` ${api}`}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function cabeceras(api: string | undefined): string {
  const origen = origenApi(api);
  return [
    "# Generado por scripts/prerender.mjs desde src/cabeceras.ts: no editar a mano.",
    "/*",
    `  Content-Security-Policy: ${politica(origen)}`,
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()",
    "  Strict-Transport-Security: max-age=31536000",
    "",
    // Vite pone el hash del contenido en el nombre: lo de /assets no cambia nunca.
    "/assets/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
  ].join("\n");
}
