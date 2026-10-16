/** Precios (`/precios`, RF-8): contenido fijo, sin datos en vivo. */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/App";
import { pintar } from "../../src/entry-server";

function montar() {
  window.history.replaceState(null, "", "/precios");
  return render(<App rutaInicial="/precios" />);
}

function nivel(nombre: string): HTMLElement {
  return screen.getByRole("region", { name: nombre });
}

beforeEach(() => {
  window.localStorage.clear();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(cleanup);

describe("Precios", () => {
  it("el lema con su tramo resaltado y los dos niveles", () => {
    montar();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("Gratis para leer, a medida para integrar");
    expect(h1.querySelector(".resaltado")?.textContent).toBe("a medida para integrar");
    expect(within(nivel("Comunidad")).getByText("Gratis")).toBeTruthy();
    expect(within(nivel("Empresa")).getByText("Habla con nosotros")).toBeTruthy();
  });

  it("Comunidad: lo que incluye y lo que no, dicho también al lector de pantalla", () => {
    montar();
    const comunidad = within(nivel("Comunidad"));
    expect(comunidad.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Dashboard en vivo, sin cuenta",
      "Intradía e Histórico con acceso Comunidad gratis",
      "Ventana de 90 días en el portal",
      "No incluye: Sin llamadas REST ni WSS desde tu código",
    ]);
  });

  it("Empresa: las cifras del contrato y el contacto sin formulario", () => {
    montar();
    const empresa = within(nivel("Empresa"));
    expect(empresa.getByText("REST /api/v1: 8 endpoints de datos")).toBeTruthy();
    expect(empresa.getByText("WSS /ws/v1 con 5 tópicos en push")).toBeTruthy();
    expect(empresa.getByRole("link", { name: "contacto@higerotech.com" }).getAttribute("href")).toBe(
      "mailto:contacto@higerotech.com",
    );
    const whatsapp = empresa.getByRole("link", { name: "Soporte corporativo por WhatsApp" });
    expect(whatsapp.getAttribute("href")).toBe("https://wa.me/13235543854");
    expect(whatsapp.getAttribute("rel")).toBe("noopener noreferrer");
    // Ningún precio publicado: el nivel Empresa es «Habla con nosotros» (ADR-0030).
    expect(document.body.textContent).not.toMatch(/USDT|\$/);
  });

  it("«Crear acceso gratis» lleva a Intradía sin recargar", async () => {
    montar();
    await userEvent.click(within(nivel("Comunidad")).getByRole("link", { name: "Crear acceso gratis" }));
    expect(window.location.pathname).toBe("/intradia");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Intradía");
  });

  it("la tabla comparativa, con encabezados de fila y de columna", () => {
    montar();
    const tabla = screen.getByRole("table", { name: "Qué incluye cada nivel" });
    const filas = within(tabla)
      .getAllByRole("row")
      .map((fila) => [...fila.querySelectorAll("th, td")].map((c) => c.textContent));
    expect(filas).toEqual([
      ["", "Comunidad", "Empresa"],
      ["Dashboard", "Sí, sin cuenta", "Sí"],
      ["Intradía e Histórico", "Con email", "Sí"],
      ["REST /api/v1", "—", "8 endpoints de datos"],
      ["WSS /ws/v1", "—", "5 tópicos"],
      ["Historia por API", "—", "Paginada: 90 días o 26.000 buckets por consulta"],
      ["Soporte", "Estado público", "WhatsApp y email corporativo"],
    ]);
    expect(within(tabla).getAllByLabelText("No incluido")).toHaveLength(3);
    expect(within(tabla).getByRole("rowheader", { name: "REST /api/v1" })).toBeTruthy();
  });

  it("en inglés, todo en inglés", async () => {
    montar();
    await userEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Free to read, tailored to integrate");
    expect(within(nivel("Enterprise")).getByText("Talk to us")).toBeTruthy();
    expect(screen.getByRole("table", { name: "What each tier includes" })).toBeTruthy();
    expect(document.title).toBe("Pricing · Criterio");
  });

  it("el prerender trae la página entera para indexarse (RNF-4)", () => {
    const html = pintar("/precios");
    expect(html).toContain("<main");
    expect(html).toContain("Habla con nosotros");
    expect(html).toContain("8 endpoints de datos");
    expect(html).toContain('href="mailto:contacto@higerotech.com"');
  });
});
