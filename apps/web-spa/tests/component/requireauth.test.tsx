/** Guard de sesión: redirect al login cuando no hay sesión; error visible;
 * contenido solo autenticado. */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RequireAuth } from "../../src/auth/RequireAuth";

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
});

describe("RequireAuth", () => {
  it("sin sesión redirige a Universal Login", () => {
    render(
      <RequireAuth>
        <p>contenido privado</p>
      </RequireAuth>,
    );
    expect(estadoAuth.loginWithRedirect).toHaveBeenCalledOnce();
    expect(screen.queryByText("contenido privado")).toBeNull();
    expect(screen.getByText(/redirigiendo al inicio de sesión/i)).toBeTruthy();
  });

  it("con sesión renderiza el contenido sin redirigir", () => {
    estadoAuth.isAuthenticated = true;
    render(
      <RequireAuth>
        <p>contenido privado</p>
      </RequireAuth>,
    );
    expect(screen.getByText("contenido privado")).toBeTruthy();
    expect(estadoAuth.loginWithRedirect).not.toHaveBeenCalled();
  });

  it("un error de Auth0 se muestra sin bucle de redirects", () => {
    estadoAuth.error = new Error("acceso denegado por el tenant");
    render(
      <RequireAuth>
        <p>contenido privado</p>
      </RequireAuth>,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "acceso denegado por el tenant",
    );
    expect(estadoAuth.loginWithRedirect).not.toHaveBeenCalled();
  });
});
