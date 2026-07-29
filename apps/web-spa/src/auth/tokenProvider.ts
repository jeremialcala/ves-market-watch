/**
 * Puente entre el SDK de Auth0 (que vive en el árbol React) y los clientes
 * REST/WSS (módulos planos). El componente `TokenBridge` registra aquí el
 * `getAccessTokenSilently`; los tokens nunca tocan storage (T12) — viven en
 * la memoria del SDK.
 */

export interface TokenProvider {
  getToken(opciones?: { forceRefresh?: boolean }): Promise<string>;
}

let actual: TokenProvider | null = null;

export function registrarTokenProvider(proveedor: TokenProvider | null): void {
  actual = proveedor;
}

export async function obtenerToken(opciones?: {
  forceRefresh?: boolean;
}): Promise<string> {
  if (actual === null) {
    throw new Error("tokenProvider no registrado: ¿sesión no iniciada?");
  }
  return actual.getToken(opciones);
}

/** Claim `exp` (epoch s) del JWT SIN validar — la validación es del gateway. */
export function expDelToken(token: string): number | null {
  const partes = token.split(".");
  if (partes.length !== 3) {
    return null;
  }
  try {
    const payload = JSON.parse(
      atob(partes[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}
