/**
 * Guard de sesión: sin autenticar → redirect a Universal Login (Auth Code +
 * PKCE). La recarga de página vuelve por aquí (sin storage persistente, T12);
 * con sesión SSO activa en Auth0 el round-trip es silencioso.
 *
 * Cuatro estados DISJUNTOS y en este orden, porque confundirlos era el problema:
 * comprobando · error (con salida) · redirigiendo · dentro.
 */

import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useRef, type ReactNode } from "react";

import { Button } from "../ds/components";
import { useI18n } from "../i18n/contexto";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, error, loginWithRedirect } = useAuth0();
  const { t } = useI18n();
  // `loginWithRedirect` es estable, pero el doble montaje de efectos de
  // StrictMode lo llamaría dos veces y la segunda transacción PKCE pisaría a la
  // primera. El ref lo cierra sin depender de ese detalle del SDK.
  const yaRedirigido = useRef(false);

  useEffect(() => {
    if (isLoading || isAuthenticated || error || yaRedirigido.current) {
      return;
    }
    yaRedirigido.current = true;
    void loginWithRedirect({ appState: { returnTo: window.location.pathname } });
  }, [isLoading, isAuthenticated, error, loginWithRedirect]);

  /**
   * Reintento explícito tras un fallo del callback.
   *
   * Limpiar la URL es la parte que NO se puede omitir: en `@auth0/auth0-react`
   * el `onRedirectCallback` que la limpia corre DESPUÉS de
   * `handleRedirectCallback()`, así que si ésta lanza, el `?code=&state=` se
   * queda puesto y cada recarga vuelve a entrar por el mismo camino y vuelve a
   * fallar. Sin esto, el usuario no sale del error ni recargando.
   */
  const reintentar = (): void => {
    window.history.replaceState({}, document.title, window.location.pathname);
    yaRedirigido.current = true;
    void loginWithRedirect({ appState: { returnTo: window.location.pathname } });
  };

  // Comprobación silenciosa en curso: decir eso, no que se está redirigiendo.
  if (isLoading) {
    return (
      <main className="pantalla-centrada" aria-busy="true">
        <p>{t("auth.verificando")}</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="pantalla-centrada" role="alert">
        <h1>{t("auth.error")}</h1>
        <p>{error.message}</p>
        <Button variant="primary" onClick={reintentar}>
          {t("auth.entrar")}
        </Button>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="pantalla-centrada" aria-busy="true">
        <p>{t("auth.redirigiendo")}</p>
      </main>
    );
  }

  return children;
}
