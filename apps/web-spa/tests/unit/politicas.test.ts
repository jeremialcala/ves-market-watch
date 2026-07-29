import { describe, expect, it } from "vitest";

import {
  BACKOFF_MAX_MS,
  calcularBackoff,
  decidirTrasCierre,
  DELAY_LIMITE_MS,
} from "../../src/ws/politicas";

describe("calcularBackoff", () => {
  it("crece exponencialmente con cap de 30 s", () => {
    expect(calcularBackoff(0, 0.5)).toBe(1000);
    expect(calcularBackoff(1, 0.5)).toBe(2000);
    expect(calcularBackoff(3, 0.5)).toBe(8000);
    expect(calcularBackoff(10, 0.99)).toBeLessThanOrEqual(BACKOFF_MAX_MS);
  });
  it("aplica jitter de ±50 %", () => {
    expect(calcularBackoff(2, 0)).toBe(2000); // 4000 × 0.5
    expect(calcularBackoff(2, 0.999)).toBeGreaterThan(5900); // ~4000 × 1.5
  });
});

describe("decidirTrasCierre (política del contrato)", () => {
  it("4401 → refrescar token y reconectar ya", () => {
    expect(decidirTrasCierre(4401, 0, 0.5)).toEqual({
      accion: "refrescar-y-reconectar",
    });
  });
  it("4403 → detener (reintentar no arregla el permiso)", () => {
    const decision = decidirTrasCierre(4403, 0, 0.5);
    expect(decision.accion).toBe("detener");
  });
  it("1008 → espera larga con aviso de múltiples pestañas", () => {
    const decision = decidirTrasCierre(1008, 0, 0.5);
    expect(decision).toMatchObject({ accion: "esperar", delayMs: DELAY_LIMITE_MS });
    expect(
      decision.accion === "esperar" ? decision.motivo : "",
    ).toContain("pestañas");
  });
  it("cierre de red → backoff con jitter", () => {
    const decision = decidirTrasCierre(1006, 2, 0.5);
    expect(decision).toEqual({ accion: "esperar", delayMs: 4000 });
  });
});
