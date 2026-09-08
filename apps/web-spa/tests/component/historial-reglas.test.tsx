/**
 * Sección «Historial de las reglas».
 *
 * El test que más importa es el de la nota: **no se oculta nunca**, ni cuando
 * las cifras son buenas. Una advertencia condicionada a que los números sean
 * malos es un descargo que aparece solo cuando conviene.
 *
 * Y el que le sigue: **no hay columna de aciertos**. El contrato de la API lo
 * prohíbe expresamente y esta tabla no puede contradecirlo agregándolo.
 */

import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { Analisis, Senal } from "../../src/api/endpoints";
import { HistorialReglas } from "../../src/components/HistorialReglas";
import { ES } from "../../src/i18n/dict";
import { renderConProveedores as render } from "../render";

afterEach(cleanup);

function senal(
  rule: string,
  outcome: { hours: number; gap_delta_pp: string } | null = null,
): Senal {
  return {
    type: rule.split("@")[0],
    direction: "alcista",
    currency: "VES",
    as_of: "2026-08-01T00:00:00Z",
    emitted_at: "2026-08-01T00:00:00Z",
    calc_version: 1,
    triggered_by: "00000000-0000-0000-0000-000000000000",
    evidence: { rule, inputs: { a: "1" } },
    ...(outcome === null ? {} : { outcome }),
  } as unknown as Senal;
}

function analisis(...reglas: string[]): Analisis {
  return {
    rule_proximity: reglas.map((rule) => ({
      rule,
      type: rule.split("@")[0],
      direction: "alcista",
      conditions_total: 1,
      conditions_met: 0,
      evaluable: true,
      blocked_by: null,
      conditions: [],
    })),
  } as unknown as Analisis;
}

function pintar(senales: Senal[], a: Analisis | null, idioma: "es" | "en" = "es") {
  return render(
    <HistorialReglas senales={senales} analisis={a} idioma={idioma} />,
    { idioma },
  );
}

const RULESET = analisis(
  "arranque_alcista@v1",
  "techo_inminente@v1",
  "correccion_inminente@v1",
);

describe("HistorialReglas", () => {
  it("la nota NO se oculta, ni cuando la tabla va bien", () => {
    // Muestra amplia y efecto consistente: el caso en el que sería tentador
    // esconder la advertencia. Tiene que seguir ahí.
    const muchas = Array.from({ length: 40 }, () =>
      senal("arranque_alcista@v1", { hours: 24, gap_delta_pp: "1.5" }),
    );
    pintar(muchas, RULESET);
    expect(screen.getByText(ES["reglashist.nota"])).toBeTruthy();
    cleanup();

    // Y también con una muestra mínima.
    pintar([senal("arranque_alcista@v1")], RULESET);
    expect(screen.getByText(ES["reglashist.nota"])).toBeTruthy();
  });

  it("la nota dice las dos cosas: hipótesis y recalibración pendiente", () => {
    pintar([senal("arranque_alcista@v1")], RULESET);
    const nota = screen.getByText(ES["reglashist.nota"]).textContent ?? "";
    expect(nota).toMatch(/hip[óo]tesis/i);
    expect(nota).toMatch(/recalibraci[óo]n HITL/i);
  });

  it("NO hay columna ni cifra de aciertos", () => {
    pintar(
      [senal("arranque_alcista@v1", { hours: 24, gap_delta_pp: "1.5" })],
      RULESET,
    );
    // Se mira la TABLA, no la seccion entera: la nota del pie dice «no una
    // medida de acierto» y ahi la palabra es el descargo, no la metrica.
    const tabla =
      document.querySelector(".vmw-reglashist__tabla")?.textContent ?? "";
    expect(tabla).not.toMatch(/acierto|acert/i);
    expect(screen.queryByText(/^Aciertos$/i)).toBeNull();
    // La segunda métrica es completitud, y se rotula como tal.
    expect(screen.getByText(ES["reglashist.colMedibles"])).toBeTruthy();
  });

  it("una regla que nunca disparó aparece con cero, no se esconde", () => {
    pintar([senal("arranque_alcista@v1")], RULESET);
    expect(document.querySelectorAll(".vmw-reglashist__fila")).toHaveLength(3);
    expect(screen.getByText("techo inminente")).toBeTruthy();
    expect(screen.getAllByText(ES["reglashist.muestra.sin-casos"]).length).toBe(2);
  });

  it("las cinco columnas están, en su orden", () => {
    pintar([senal("arranque_alcista@v1")], RULESET);
    const cabecera = [
      ...document.querySelectorAll(".vmw-reglashist__cabtabla > span"),
    ].map((n) => n.textContent);
    expect(cabecera).toEqual([
      ES["reglashist.colRegla"],
      ES["reglashist.colCasos"],
      ES["reglashist.colMedibles"],
      ES["reglashist.colEfecto"],
      ES["reglashist.colMuestra"],
    ]);
  });

  it("el efecto medio se muestra con signo y ventana; sin resultados lo dice", () => {
    pintar(
      [
        senal("arranque_alcista@v1", { hours: 24, gap_delta_pp: "1" }),
        senal("arranque_alcista@v1", { hours: 24, gap_delta_pp: "3" }),
      ],
      RULESET,
    );
    expect(screen.getByText("+2 pp a 24 h")).toBeTruthy();
    // Las que no tienen ventana cumplida lo dicen en vez de dejar el hueco.
    expect(screen.getAllByText(ES["reglashist.sinEfecto"]).length).toBe(2);
  });

  it("la muestra se colorea por suficiencia", () => {
    const muchas = Array.from({ length: 10 }, () => senal("arranque_alcista@v1"));
    pintar([...muchas, senal("techo_inminente@v1")], RULESET);
    const pastillas = [
      ...document.querySelectorAll<HTMLElement>(".vmw-reglashist__muestra"),
    ];
    expect(pastillas[0].style.color).toBe("var(--sage)"); // 10 casos
    expect(pastillas[1].style.color).toBe("var(--coral)"); // 1 caso: hipótesis
  });

  it("sin ruleset no se pinta la sección", () => {
    pintar([senal("a@v1")], null);
    expect(document.querySelector(".vmw-reglashist")).toBeNull();
  });

  it("en inglés no se escapa ninguna clave, y la nota también traduce", () => {
    pintar([senal("arranque_alcista@v1")], RULESET, "en");
    expect(document.body.textContent).not.toContain("reglashist.");
    expect(screen.getByText("Rule history")).toBeTruthy();
    expect(screen.getByText(/pending HITL recalibration/)).toBeTruthy();
  });
});
