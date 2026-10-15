/** El mecanismo de idioma del paquete: genérico sobre el diccionario de cada app. */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../src/i18n/I18nProvider";
import { useI18n } from "../src/i18n/contexto";
import { esIdioma, IDIOMAS } from "../src/i18n/idioma";
import { interpolar } from "../src/i18n/interpolar";

const DICCIONARIOS = {
  es: { saludo: "Hola, {nombre}", vacio: "" },
  en: { saludo: "Hi, {nombre}", vacio: "" },
} as const;
type Clave = keyof typeof DICCIONARIOS.es;

function Saludo() {
  const { t, idioma, setIdioma } = useI18n<Clave>();
  return (
    <>
      <p>{t("saludo", { nombre: "Ana" })}</p>
      <button type="button" onClick={() => setIdioma(idioma === "es" ? "en" : "es")}>
        cambiar
      </button>
    </>
  );
}

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

describe("I18nProvider", () => {
  it("traduce con el diccionario que le pasa la app, en español por defecto", () => {
    render(
      <I18nProvider diccionarios={DICCIONARIOS}>
        <Saludo />
      </I18nProvider>,
    );
    expect(screen.getByText("Hola, Ana")).toBeTruthy();
    expect(document.documentElement.lang).toBe("es");
  });

  it("cambia de idioma, lo pone en <html lang> y lo recuerda en su clave", async () => {
    render(
      <I18nProvider diccionarios={DICCIONARIOS} claveStorage="prueba.idioma">
        <Saludo />
      </I18nProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "cambiar" }));
    expect(screen.getByText("Hi, Ana")).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
    expect(window.localStorage.getItem("prueba.idioma")).toBe("en");
  });

  it("arranca con el idioma recordado", () => {
    window.localStorage.setItem("vmw.idioma", "en");
    render(
      <I18nProvider diccionarios={DICCIONARIOS}>
        <Saludo />
      </I18nProvider>,
    );
    expect(screen.getByText("Hi, Ana")).toBeTruthy();
  });

  it("ignora un valor guardado que no es un idioma", () => {
    window.localStorage.setItem("vmw.idioma", "fr");
    render(
      <I18nProvider diccionarios={DICCIONARIOS}>
        <Saludo />
      </I18nProvider>,
    );
    expect(screen.getByText("Hola, Ana")).toBeTruthy();
  });

  it("con el storage bloqueado funciona igual, sin recordar", async () => {
    const leer = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const escribir = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    render(
      <I18nProvider diccionarios={DICCIONARIOS}>
        <Saludo />
      </I18nProvider>,
    );
    expect(screen.getByText("Hola, Ana")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "cambiar" }));
    expect(screen.getByText("Hi, Ana")).toBeTruthy();
    leer.mockRestore();
    escribir.mockRestore();
  });

  it("useI18n fuera del proveedor falla con un mensaje claro", () => {
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Saludo />)).toThrow("useI18n fuera de <I18nProvider>");
    silencio.mockRestore();
  });
});

describe("utilidades", () => {
  it("interpolar sustituye lo que hay y deja el marcador de lo que falta", () => {
    expect(interpolar("{a} y {b}", { a: 1 })).toBe("1 y {b}");
    expect(interpolar("sin marcas")).toBe("sin marcas");
  });

  it("esIdioma solo acepta es y en", () => {
    expect(IDIOMAS).toEqual(["es", "en"]);
    expect(esIdioma("es")).toBe(true);
    expect(esIdioma("fr")).toBe(false);
    expect(esIdioma(null)).toBe(false);
  });
});
