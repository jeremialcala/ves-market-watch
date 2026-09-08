/** Tema del sistema de diseño: oscuro de marca por defecto, alternancia por
 * `data-theme` (el mecanismo que define el propio sistema) y persistencia. */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { useTema } from "../../src/theme/contexto";
import { ThemeProvider } from "../../src/theme/ThemeProvider";

function Sonda() {
  const { tema, alternar } = useTema();
  return (
    <button type="button" onClick={alternar}>
      {tema}
    </button>
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("ThemeProvider", () => {
  it("arranca en oscuro aunque el sistema prefiera claro (es la marca)", () => {
    render(
      <ThemeProvider>
        <Sonda />
      </ThemeProvider>,
    );
    expect(screen.getByRole("button").textContent).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("alterna, marca el documento y recuerda la elección", async () => {
    const usuario = userEvent.setup();
    render(
      <ThemeProvider>
        <Sonda />
      </ThemeProvider>,
    );
    await usuario.click(screen.getByRole("button"));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("vmw.tema")).toBe("light");
  });

  it("retoma el tema guardado al montar", () => {
    window.localStorage.setItem("vmw.tema", "light");
    render(
      <ThemeProvider>
        <Sonda />
      </ThemeProvider>,
    );
    expect(screen.getByRole("button").textContent).toBe("light");
  });

  it("fuera del proveedor falla con un mensaje claro", () => {
    expect(() => render(<Sonda />)).toThrow(/useTema fuera/);
  });
});
