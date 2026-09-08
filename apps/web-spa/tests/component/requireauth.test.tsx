/** Guard de sesión: los cuatro estados son disjuntos, el error tiene salida y
 * el redirect se dispara una sola vez.
 *
 * Las aserciones van contra `ES["auth.*"]`, no contra literales: un cambio de
 * copy no debe romper el guard, pero un cambio de ESTADO sí.
 */

import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RequireAuth } from "../../src/auth/RequireAuth";
import { ES } from "../../src/i18n/dict";
import { renderConProveedores as render } from "../render";

const estadoAuth = {
  isAuthenticated: false,
  isLoading: false,
  error: undefined as Error | undefined,
  loginWithRedirect: vi.fn(() => Promise.resolve()),
};

vi.mock("@auth0/auth0-react", () => ({
  useAuth0: () => estadoAuth,
}));

afterEach(() => {
  cleanup();
  estadoAuth.isAuthenticated = false;
  estadoAuth.isLoading = false;
  estadoAuth.error = undefined;
  estadoAuth.loginWithRedirect.mockClear();
  window.history.replaceState({}, "", "/");
});

const privado = <p>contenido privado</p>;

describe("RequireAuth", () => {
  it("mientras comprueba la sesión NO dice que está redirigiendo", () => {
    // La comprobación silenciosa contra la cookie SSO puede tardar; decir
    // «redirigiendo» ahí es mentira, y con dominio propio la espera es MÁS
    // larga, así que el mensaje engañoso empeora.
    estadoAuth.isLoading = true;
    render(<RequireAuth>{privado}</RequireAuth>);

    expect(screen.getByText(ES["auth.verificando"])).toBeTruthy();
    expect(screen.queryByText(ES["auth.redirigiendo"])).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("contenido privado")).toBeNull();
    // Y sobre todo: no se redirige mientras el SDK aún está resolviendo.
    expect(estadoAuth.loginWithRedirect).not.toHaveBeenCalled();
  });

  it("sin sesión redirige a Universal Login", () => {
    render(<RequireAuth>{privado}</RequireAuth>);
    expect(estadoAuth.loginWithRedirect).toHaveBeenCalledOnce();
    expect(screen.queryByText("contenido privado")).toBeNull();
    expect(screen.getByText(ES["auth.redirigiendo"])).toBeTruthy();
  });

  it("no redispara el redirect al re-renderizar", () => {
    const { rerender } = render(<RequireAuth>{privado}</RequireAuth>);
    rerender(<RequireAuth>{privado}</RequireAuth>);
    expect(estadoAuth.loginWithRedirect).toHaveBeenCalledOnce();
  });

  it("con sesión renderiza el contenido sin redirigir", () => {
    estadoAuth.isAuthenticated = true;
    render(<RequireAuth>{privado}</RequireAuth>);
    expect(screen.getByText("contenido privado")).toBeTruthy();
    expect(estadoAuth.loginWithRedirect).not.toHaveBeenCalled();
  });

  it("un error de Auth0 se muestra sin bucle de redirects, pero CON salida", () => {
    estadoAuth.error = new Error("acceso denegado por el tenant");
    render(<RequireAuth>{privado}</RequireAuth>);

    expect(screen.getByRole("alert").textContent).toContain(
      "acceso denegado por el tenant",
    );
    // No se redirige solo (eso sí sería un bucle)…
    expect(estadoAuth.loginWithRedirect).not.toHaveBeenCalled();
    // …pero el usuario tiene cómo salir. Sin este botón el estado es terminal.
    expect(
      screen.getByRole("button", { name: ES["auth.entrar"] }),
    ).toBeTruthy();
  });

  it("el reintento limpia el callback fallido de la URL", async () => {
    // Si el `?code=&state=` se queda puesto, cada recarga vuelve a entrar por
    // `handleRedirectCallback`, vuelve a fallar y el usuario no sale nunca.
    window.history.replaceState({}, "", "/?code=abc&state=xyz");
    estadoAuth.error = new Error("Invalid state");
    render(<RequireAuth>{privado}</RequireAuth>);

    await userEvent.click(
      screen.getByRole("button", { name: ES["auth.entrar"] }),
    );

    expect(window.location.search).toBe("");
    expect(estadoAuth.loginWithRedirect).toHaveBeenCalledOnce();
  });
});
