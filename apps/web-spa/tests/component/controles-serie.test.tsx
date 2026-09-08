/**
 * Barra de control de la serie evaluada.
 *
 * Lo que se defiende:
 *
 * 1. **Los tres controles gobiernan la tarjeta**, y la moneda NO está aquí —
 *    afecta a la vista entera y meterla sugeriría lo contrario.
 * 2. **El desplegable ofrece nombres legibles**, no `snake_case`, pero sigue
 *    enviando la clave canónica al cambiar: lo legible es la etiqueta, no el
 *    valor.
 * 3. **La lista es la del ruleset más la brecha.** Una serie sin regla detrás
 *    prometería un umbral que la capa de referencia no puede dibujar.
 */

import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ControlesSerie } from "../../src/components/ControlesSerie";
import { ES } from "../../src/i18n/dict";
import { SERIES } from "../../src/lib/seriesEvaluables";
import { renderConProveedores as render } from "../render";

afterEach(cleanup);

function pintar(over: Partial<Parameters<typeof ControlesSerie>[0]> = {}) {
  const props = {
    dias: 30,
    setDias: vi.fn(),
    indicador: "p2p_brecha_pct_buy",
    setIndicador: vi.fn(),
    intervalo: "1h" as const,
    setIntervalo: vi.fn(),
    ...over,
  };
  render(<ControlesSerie {...props} />);
  return props;
}

describe("ControlesSerie", () => {
  it("tiene los tres grupos rotulados y NO el de moneda", () => {
    pintar();
    expect(screen.getByText(ES["historico.grupoRango"])).toBeTruthy();
    expect(screen.getByText(ES["historico.grupoSerie"])).toBeTruthy();
    expect(screen.getByText(ES["historico.grupoBucket"])).toBeTruthy();
    // La moneda vive en la barra global: afecta a toda la vista.
    expect(screen.queryByLabelText(ES["historico.moneda"])).toBeNull();
  });

  it("el desplegable muestra nombres legibles y envía la clave canónica", async () => {
    const usuario = userEvent.setup();
    const { setIndicador } = pintar();

    // Legible en pantalla…
    expect(screen.getByText("Drenaje de oferta 6 h")).toBeTruthy();
    // …y ni una clave snake_case entre las opciones.
    const opciones = [...document.querySelectorAll("option")].map(
      (o) => o.textContent ?? "",
    );
    expect(opciones.some((o) => o.includes("_"))).toBe(false);

    await usuario.selectOptions(
      screen.getByLabelText(ES["historico.indicador"]),
      "p2p_drenaje_oferta_6h_pct",
    );
    expect(setIndicador).toHaveBeenCalledWith("p2p_drenaje_oferta_6h_pct");
  });

  it("ofrece exactamente las series del ruleset más la brecha", () => {
    pintar();
    const valores = [
      ...document.querySelectorAll<HTMLOptionElement>(
        `[aria-label="${ES["historico.indicador"]}"] option`,
      ),
    ].map((o) => o.value);
    expect(valores).toEqual(SERIES.map((s) => s.indicador));
    // Ni la tasa oficial —tiene su propio bloque— ni las liquideces.
    expect(valores).not.toContain("official_rate");
    expect(valores.some((v) => v.startsWith("p2p_liquidez"))).toBe(false);
  });

  it("la pastilla activa es la del rango vigente", () => {
    pintar({ dias: 90 });
    const activas = [
      ...document.querySelectorAll('[aria-pressed="true"]'),
    ].map((n) => n.textContent);
    expect(activas).toEqual([ES["historico.rango90"]]);
  });

  it("pasar a 90 días con bucket de 5 m lo baja a 1 h", async () => {
    // En 90 días, 5m serían ~26k buckets: el cambio evita pedirlos.
    const usuario = userEvent.setup();
    const { setDias, setIntervalo } = pintar({ dias: 7, intervalo: "5m" });
    await usuario.click(screen.getByText(ES["historico.rango90"]));
    expect(setDias).toHaveBeenCalledWith(90);
    expect(setIntervalo).toHaveBeenCalledWith("1h");
  });

  it("con rango largo, el bucket de 5 m queda deshabilitado", () => {
    pintar({ dias: 30 });
    const cincoMin = [...document.querySelectorAll("option")].find(
      (o) => o.value === "5m",
    )!;
    expect(cincoMin.disabled).toBe(true);
  });

  it("la procedencia se lee como frase", () => {
    pintar();
    expect(screen.getByText("REST /api/v1 · rango máximo 90 días")).toBeTruthy();
  });

  it("en inglés no se escapa ninguna clave", () => {
    cleanup();
    render(<ControlesSerie {...{
      dias: 30, setDias: vi.fn(), indicador: "p2p_spread_pct",
      setIndicador: vi.fn(), intervalo: "1h" as const, setIntervalo: vi.fn(),
    }} />, { idioma: "en" });
    expect(document.body.textContent).not.toContain("opcionSerie.");
    expect(screen.getByText("Buy-sell spread")).toBeTruthy();
  });
});
