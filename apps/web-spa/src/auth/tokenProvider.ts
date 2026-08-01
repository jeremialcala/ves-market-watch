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
let enEspera: ((proveedor: TokenProvider) => void)[] = [];

/**
 * Cuánto esperar a que `TokenBridge` registre el proveedor antes de rendirse.
 *
 * No es un número de confort: React ejecuta los efectos **de hijo a padre**, así
 * que el efecto de montaje de una vista dispara ANTES que el del `TokenBridge`
 * que la envuelve. Sin esta espera, toda petición lanzada al montar moría con
 * «tokenProvider no registrado» — y con `deps: []` no se reintentaba jamás. Es
 * lo que dejaba en blanco la sparkline de 24 h, las comparativas de la brecha y
 * el mapa de calor, las tres alimentadas por un efecto de montaje.
 */
const ESPERA_REGISTRO_MS = 10_000;

export function registrarTokenProvider(proveedor: TokenProvider | null): void {
  actual = proveedor;
  if (proveedor === null) {
    return;
  }
  const pendientes = enEspera;
  enEspera = [];
  for (const resolver of pendientes) {
    resolver(proveedor);
  }
}

function proveedorRegistrado(): Promise<TokenProvider> {
  if (actual !== null) {
    return Promise.resolve(actual);
  }
  return new Promise((resolver, rechazar) => {
    const temporizador = setTimeout(() => {
      enEspera = enEspera.filter((f) => f !== alRegistrarse);
      rechazar(new Error("tokenProvider no registrado: ¿sesión no iniciada?"));
    }, ESPERA_REGISTRO_MS);
    const alRegistrarse = (proveedor: TokenProvider): void => {
      clearTimeout(temporizador);
      resolver(proveedor);
    };
    enEspera.push(alRegistrarse);
  });
}

export async function obtenerToken(opciones?: {
  forceRefresh?: boolean;
}): Promise<string> {
  const proveedor = await proveedorRegistrado();
  return proveedor.getToken(opciones);
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
