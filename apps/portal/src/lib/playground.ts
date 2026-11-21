/**
 * El playground de APIs (RF-7): arma la llamada de ejemplo y la ejecuta DE
 * VERDAD contra el gateway, sin token. `/health` responde 200; el resto, el
 * 401 real; `/ws/v1` cierra con 4401. No hay campo para pegar un token: el
 * portal es anónimo y una credencial Empresa no se escribe en una web.
 */

import type { Endpoint } from "../catalogo/generar";

/** Las frases de estado que HTTP/2 ya no manda (`statusText` llega vacío). */
const FRASES: Record<number, string> = {
  200: "OK",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  422: "Unprocessable Content",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
};

export function frase(estado: number, statusText = ""): string {
  return statusText !== "" ? statusText : (FRASES[estado] ?? "");
}

export function urlEndpoint(base: string, e: Endpoint): string {
  return `${base}${e.ruta}${e.consulta}`;
}

/** `wss://host` desde la base https; sin base (desarrollo), el mismo origen. */
export function baseWss(base: string): string {
  return base.replace(/^http/, "ws");
}

export function comandoCurl(base: string, e: Endpoint): string {
  const url = `"${urlEndpoint(base, e)}"`;
  return e.publico ? `curl ${url}` : `curl -H "Authorization: Bearer $CRITERIO_TOKEN" \\\n  ${url}`;
}

export function comandoWscat(base: string, ruta: string, suscribir: string): string {
  return `wscat -c "${baseWss(base)}${ruta}?token=$CRITERIO_TOKEN"\n> ${suscribir}`;
}

export function json(valor: unknown): string {
  return JSON.stringify(valor, null, 2);
}

export type Resultado =
  | { tipo: "http"; estado: number; frase: string; ms: number; cuerpo: string }
  | { tipo: "wss"; codigo: number; razon: string; ms: number }
  | { tipo: "error"; ms: number };

/** El cuerpo, formateado si es JSON; si no, tal cual. */
function legible(texto: string): string {
  try {
    return json(JSON.parse(texto));
  } catch {
    return texto;
  }
}

export async function ejecutarHttp(url: string, ahora: () => number = () => performance.now()): Promise<Resultado> {
  const inicio = ahora();
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    const cuerpo = legible(await r.text());
    return { tipo: "http", estado: r.status, frase: frase(r.status, r.statusText), ms: Math.round(ahora() - inicio), cuerpo };
  } catch {
    // Red caída o CORS: el navegador no deja ver más.
    return { tipo: "error", ms: Math.round(ahora() - inicio) };
  }
}

/**
 * Abre `/ws/v1` sin token y espera el cierre. El gateway acepta el handshake
 * y cierra con 4401 (asyncapi.yaml): así el código llega al navegador. A los
 * `limite` ms sin cierre, lo cierra el cliente.
 */
export function probarWss(url: string, limite = 10_000, ahora: () => number = () => performance.now()): Promise<Resultado> {
  const inicio = ahora();
  return new Promise((resolver) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      resolver({ tipo: "error", ms: 0 });
      return;
    }
    const reloj = setTimeout(() => ws.close(), limite);
    ws.onclose = (e) => {
      clearTimeout(reloj);
      resolver({ tipo: "wss", codigo: e.code, razon: e.reason, ms: Math.round(ahora() - inicio) });
    };
  });
}
