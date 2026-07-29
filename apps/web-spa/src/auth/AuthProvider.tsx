/**
 * Auth0 con los controles de T12 (ADR-0017): tokens SOLO en memoria (nunca
 * localStorage), refresh rotation sin fallback iframe, PKCE contra Universal
 * Login. `TokenBridge` publica `getAccessTokenSilently` al puente de módulos
 * planos (REST/WSS).
 */

import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { useEffect, type ReactNode } from "react";

import { config, SCOPES } from "../config";
import { registrarTokenProvider } from "./tokenProvider";

function TokenBridge({ children }: { children: ReactNode }) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();

  useEffect(() => {
    if (!isAuthenticated) {
      registrarTokenProvider(null);
      return;
    }
    registrarTokenProvider({
      getToken: (opciones) =>
        getAccessTokenSilently(
          opciones?.forceRefresh ? { cacheMode: "off" } : undefined,
        ),
    });
    return () => registrarTokenProvider(null);
  }, [getAccessTokenSilently, isAuthenticated]);

  return children;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <Auth0Provider
      domain={config.auth0Domain}
      clientId={config.auth0ClientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: config.auth0Audience,
        scope: SCOPES,
      }}
      useRefreshTokens={true}
      // Fallback de iframe (prompt=none con la cookie de sesión SSO de Auth0):
      // al RECARGAR la página no hay tokens en memoria y sin esto el guard
      // manda a Universal Login visible en cada F5. El iframe re-autentica en
      // silencio sin tocar storage — T12 intacto (requiere Allowed Web Origins
      // en la app del tenant).
      useRefreshTokensFallback={true}
      cacheLocation="memory"
    >
      <TokenBridge>{children}</TokenBridge>
    </Auth0Provider>
  );
}
