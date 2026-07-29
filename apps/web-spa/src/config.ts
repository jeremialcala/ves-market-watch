/**
 * Configuración del SPA. TODO aquí es público por diseño (ADR-0012/0017): el
 * client_id de una SPA no es un secreto, y las VITE_* se hornean en el bundle
 * — jamás poner un secreto en una VITE_*. Overrides vía .env.local (gitignored
 * por `*.local`); defaults alineados al compose de dev.
 */

export const config = {
  auth0Domain: import.meta.env.VITE_AUTH0_DOMAIN ?? "dev-higerotech.us.auth0.com",
  // App «VES Market Watch SPA» del tenant (aprovisionada 2026-07-27, ADR-0017 F1).
  auth0ClientId:
    import.meta.env.VITE_AUTH0_CLIENT_ID ?? "8CpfA64FlGTmuyF8w07rDFlrZHEeuRER",
  auth0Audience:
    import.meta.env.VITE_AUTH0_AUDIENCE ?? "https://api.vesmarketwatch/",
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8800",
} as const;

export const SCOPES =
  "openid profile read:rates read:indicators read:signals read:depth stream:events";

/** ws(s):// derivado de la base HTTP del gateway. */
export function wsUrl(token: string): string {
  const base = config.apiBaseUrl.replace(/^http/, "ws");
  return `${base}/ws/v1?token=${encodeURIComponent(token)}`;
}
