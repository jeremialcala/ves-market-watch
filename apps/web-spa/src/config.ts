/**
 * Configuración del SPA. TODO aquí es público por diseño (ADR-0012/0017): el
 * client_id de una SPA no es un secreto, y las VITE_* se hornean en el bundle
 * — jamás poner un secreto en una VITE_*. Overrides vía .env.local (gitignored
 * por `*.local`); defaults alineados al compose de dev.
 */

export const config = {
  // Dominio PROPIO del tenant (verificado 2026-08-01). No es cosmética: con el
  // dominio canónico `*.auth0.com` la cookie SSO es de TERCERA parte respecto
  // de la app, así que el silent auth se bloquea y cada recarga acaba pidiendo
  // login. Compartiendo dominio registrable con el SPA, es de primera parte.
  // El `iss` de los tokens pasa a ser https://auth.higerotech.com/ — el gateway
  // valida issuer de forma estricta, así que ambos se mueven juntos o es 401.
  auth0Domain: import.meta.env.VITE_AUTH0_DOMAIN ?? "auth.higerotech.com",
  // App «VES Market Watch SPA» del tenant (aprovisionada 2026-07-27, ADR-0017 F1).
  auth0ClientId:
    import.meta.env.VITE_AUTH0_CLIENT_ID ?? "8CpfA64FlGTmuyF8w07rDFlrZHEeuRER",
  auth0Audience:
    import.meta.env.VITE_AUTH0_AUDIENCE ?? "https://api.vesmarketwatch/",
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8800",
} as const;

/**
 * `offline_access` va explícito por LEGIBILIDAD, no porque cambie nada: el SDK
 * ya lo inyecta solo por tener `useRefreshTokens: true`
 * (`auth0-spa-js`, `injectDefaultScopes` fusiona en vez de reemplazar), así que
 * el `/authorize` lo pide con o sin esta línea.
 *
 * Si no llega refresh token, el culpable NO es este string: es
 * `allow_offline_access: false` en la API del tenant, que descarta el scope en
 * silencio. Anotado aquí porque la trampa es cara: añadir el scope, no ver
 * cambio y concluir que el tenant está bien configurado.
 */
export const SCOPES =
  "openid profile offline_access read:rates read:indicators read:signals read:depth stream:events";

/** ws(s):// derivado de la base HTTP del gateway. */
export function wsUrl(token: string): string {
  const base = config.apiBaseUrl.replace(/^http/, "ws");
  return `${base}/ws/v1?token=${encodeURIComponent(token)}`;
}
