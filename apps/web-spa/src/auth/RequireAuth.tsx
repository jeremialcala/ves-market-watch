/**
 * Guard de sesión: sin autenticar → redirect a Universal Login (Auth Code +
 * PKCE). La recarga de página vuelve por aquí (sin storage persistente, T12);
 * con sesión SSO activa en Auth0 el round-trip es silencioso.
 */

import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, type ReactNode } from "react";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, error, loginWithRedirect } = useAuth0();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !error) {
      void loginWithRedirect({
        appState: { returnTo: window.location.pathname },
      });
    }
  }, [isLoading, isAuthenticated, error, loginWithRedirect]);

  if (error) {
    return (
      <main className="pantalla-centrada" role="alert">
        <h1>No se pudo iniciar sesión</h1>
        <p>{error.message}</p>
      </main>
    );
  }
  if (!isAuthenticated) {
    return (
      <main className="pantalla-centrada" aria-busy="true">
        <p>Redirigiendo al inicio de sesión…</p>
      </main>
    );
  }
  return children;
}
