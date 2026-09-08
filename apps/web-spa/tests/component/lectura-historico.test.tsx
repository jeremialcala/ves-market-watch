/**
 * Panel «Lo que dice el histórico».
 *
 * El requisito que estos tests defienden es **que el veredicto se calcule**. Un
 * titular cableado renderizaría igual de bien y pasaría cualquier prueba que
 * solo mirase que hay un `h2`. Por eso lo que se comprueba es que el mismo
 * componente diga **cosas distintas** ante ventanas distintas.
 */

import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LecturaHistorico } from "../../src/components/LecturaHistorico";
import { ES } from "../../src/i18n/dict";
import type { CondicionDeIndicador } from "../../src/lib/reglas";
import { renderConProveedores as render } from "../render";

afterEach(cleanup);

const DIA = 86_400_000;

function serie(...valores: string[]) {
  return valores.map((valor, i) => ({ t: i * DIA, valor }));
}

const REGLA: CondicionDeIndicador = {
  regla: "arranque_alcista@v1",
  op: "gt",
  umbral: "10",
  cumple: false,
  indice: 1,
  total: 3,
};

function pintar(
  puntos: { t: number; valor: string }[],
  condicion: CondicionDeIndicador | null = null,
  idioma: "es" | "en" = "es",
) {
  return render(
    <LecturaHistorico
      puntos={puntos}
      condicion={condicion}
      indicador="p2p_brecha_pct_buy"
      dias={30}
      bucket="1h"
      idioma={idioma}
    />,
    { idioma },
  );
}

const veredicto = () => screen.getByRole("heading", { level: 2 }).textContent;

describe("LecturaHistorico", () => {
  it("el veredicto CAMBIA con la ventana: no está cableado", () => {
    pintar(serie("10", "12", "14", "16", "20"));
    const alto = veredicto();
    cleanup();

    pintar(serie("20", "16", "14", "12", "10"));
    const bajo = veredicto();
    cleanup();

    pintar(serie("10", "12", "20", "16", "14"));
    const centro = veredicto();

    expect(new Set([alto, bajo, centro]).size).toBe(3);
    expect(alto).toContain("parte alta");
    expect(bajo).toContain("parte baja");
    expect(centro).toContain("habitual");
  });

  it("la prosa nombra el término técnico y su consecuencia en la misma frase", () => {
    pintar(serie("10", "12", "14", "16", "20"));
    const prosa = document.querySelector(".vmw-lecthist__prosa")?.textContent ?? "";
    expect(prosa).toContain("percentil"); // el término
    expect(prosa).toContain("mediana");
    // …y lo que significa, en la misma frase y sin pronosticar.
    expect(prosa).toMatch(/no anuncia nada/);
  });

  it("la ventana consultada se rotula con rango, fechas y puntos", () => {
    pintar(serie("1", "2", "3", "4"));
    const ventana =
      document.querySelector(".vmw-lecthist__ventana")?.textContent ?? "";
    expect(ventana).toContain("30 días");
    expect(ventana).toContain("4 puntos");
    expect(ventana).toContain("1h");
  });

  it("las tres anclas están, con nombre, valor y detalle", () => {
    pintar(serie("5", "8", "9", "12", "14"), REGLA);
    const anclas = document.querySelectorAll(".vmw-lecthist__ancla");
    expect(anclas).toHaveLength(3);
    expect(screen.getByText(ES["lecthist.anclaPercentil"])).toBeTruthy();
    expect(screen.getByText(ES["lecthist.anclaMediana"])).toBeTruthy();
    expect(screen.getByText(ES["lecthist.anclaCruce"])).toBeTruthy();
    // el cruce ocurre entre el dia 2 y el 3: 2 dias hasta el final
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("el ancla del cruce distingue sus tres estados", () => {
    // 1) sin regla: no hay umbral que cruzar
    pintar(serie("5", "8", "12"), null);
    expect(screen.getByText(ES["lecthist.detalleCruceSinRegla"])).toBeTruthy();
    cleanup();

    // 2) con regla y sin cruces: informacion, no ausencia
    pintar(serie("12", "14", "16"), REGLA);
    expect(screen.getByText(ES["lecthist.detalleCruceNinguno"])).toBeTruthy();
    cleanup();

    // 3) con cruce
    pintar(serie("5", "8", "9", "12", "14"), REGLA);
    expect(screen.getByText(ES["lecthist.detalleCruceDias"])).toBeTruthy();
  });

  it("el percentil se colorea por semántica, y el centro no es coral", () => {
    pintar(serie("10", "12", "20", "16", "14"));
    const valor = document.querySelector(
      ".vmw-lecthist__ancla-valor",
    ) as HTMLElement;
    expect(valor.style.color).toBe("var(--sage)");
    cleanup();

    pintar(serie("10", "12", "14", "16", "20"));
    const extremo = document.querySelector(
      ".vmw-lecthist__ancla-valor",
    ) as HTMLElement;
    expect(extremo.style.color).toBe("var(--coral)");
  });

  it("sin puntos el panel no se pinta, en vez de titular sobre nada", () => {
    pintar([]);
    expect(document.querySelector(".vmw-lecthist")).toBeNull();
  });

  it("en inglés no se escapa ninguna clave sin traducir", () => {
    pintar(serie("10", "12", "14", "16", "20"), REGLA, "en");
    expect(document.body.textContent).not.toContain("lecthist.");
    expect(veredicto()).toContain("upper part");
  });
});
