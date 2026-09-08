/** Utilidades de test compartidas: token falso decodificable y registro del
 * tokenProvider (los tokens de test jamás salen del proceso). */

import { registrarTokenProvider } from "../src/auth/tokenProvider";

function base64url(objeto: object): string {
  return btoa(JSON.stringify(objeto))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/** JWT sintáctico (sin firma real): suficiente para expDelToken y la URL WSS. */
export function tokenFalso(expEnSegundos = 900): string {
  const ahora = Math.floor(Date.now() / 1000);
  return [
    base64url({ alg: "RS256", typ: "JWT" }),
    base64url({ sub: "auth0|tester", exp: ahora + expEnSegundos }),
    "firma-falsa",
  ].join(".");
}

export function registrarTokenDeTest(expEnSegundos = 900): void {
  registrarTokenProvider({
    getToken: () => Promise.resolve(tokenFalso(expEnSegundos)),
  });
}

export function limpiarTokenDeTest(): void {
  registrarTokenProvider(null);
}
