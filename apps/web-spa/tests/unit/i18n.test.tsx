/** Capa de idioma: el diccionario está completo en ambos idiomas, la
 * interpolación no inventa valores y el proveedor persiste la elección. */

import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { EN, ES, interpolar } from "../../src/i18n/dict";
import { useI18n, useT } from "../../src/i18n/contexto";
import { esIdioma, IDIOMAS } from "../../src/i18n/idioma";
import { renderConProveedores as render } from "../render";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("diccionario", () => {
  it("tiene exactamente las mismas claves en ES y EN", () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(ES).sort());
  });

  it("no deja ninguna cadena vacía", () => {
    for (const [clave, valor] of Object.entries({ ...ES, ...EN })) {
      expect(valor.trim(), clave).not.toBe("");
    }
  });

  it("mantiene los mismos marcadores en la traducción", () => {
    const marcadores = (texto: string) =>
      (texto.match(/\{\w+\}/g) ?? []).sort();
    for (const clave of Object.keys(ES) as (keyof typeof ES)[]) {
      expect(marcadores(EN[clave]), clave).toEqual(marcadores(ES[clave]));
    }
  });
});

describe("interpolar", () => {
  it("sustituye los marcadores presentes", () => {
    expect(interpolar("hace {n} min", { n: 3 })).toBe("hace 3 min");
  });

  it("deja el marcador si falta el parámetro (nunca «undefined»)", () => {
    expect(interpolar("hace {n} min", {})).toBe("hace {n} min");
    expect(interpolar("hace {n} min")).toBe("hace {n} min");
  });
});

describe("esIdioma", () => {
  it("solo acepta los idiomas soportados", () => {
    expect(IDIOMAS).toEqual(["es", "en"]);
    expect(esIdioma("es")).toBe(true);
    expect(esIdioma("fr")).toBe(false);
    expect(esIdioma(null)).toBe(false);
  });
});

function Sonda() {
  const { idioma, setIdioma } = useI18n();
  const t = useT();
  return (
    <div>
      <span data-testid="texto">{t("nav.historico")}</span>
      <span data-testid="idioma">{idioma}</span>
      <button type="button" onClick={() => setIdioma("en")}>
        cambiar
      </button>
    </div>
  );
}

describe("I18nProvider", () => {
  it("arranca en español y traduce al cambiar", async () => {
    const usuario = userEvent.setup();
    render(<Sonda />);
    expect(screen.getByTestId("texto").textContent).toBe("Histórico");

    await usuario.click(screen.getByRole("button", { name: "cambiar" }));
    expect(screen.getByTestId("texto").textContent).toBe("History");
    expect(document.documentElement.lang).toBe("en");
    expect(window.localStorage.getItem("vmw.idioma")).toBe("en");
  });

  it("recuerda el idioma guardado al montar", () => {
    render(<Sonda />, { idioma: "en" });
    expect(screen.getByTestId("idioma").textContent).toBe("en");
  });
});
