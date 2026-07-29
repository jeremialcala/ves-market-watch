import { describe, expect, it } from "vitest";

import {
  frescura,
  haceRelativo,
  UMBRAL_OFICIAL_MS,
  UMBRAL_P2P_MS,
} from "../../src/lib/freshness";

const AHORA = new Date("2026-07-27T12:00:00Z");

function hace(ms: number): string {
  return new Date(AHORA.getTime() - ms).toISOString();
}

describe("frescura", () => {
  it("P2P: fresco dentro de 20 min, rancio después", () => {
    expect(frescura(hace(19 * 60 * 1000), UMBRAL_P2P_MS, AHORA)).toBe("fresco");
    expect(frescura(hace(21 * 60 * 1000), UMBRAL_P2P_MS, AHORA)).toBe("rancio");
  });
  it("oficial: umbral de 6 h (ADR-0007)", () => {
    expect(frescura(hace(5 * 3600 * 1000), UMBRAL_OFICIAL_MS, AHORA)).toBe(
      "fresco",
    );
    expect(frescura(hace(7 * 3600 * 1000), UMBRAL_OFICIAL_MS, AHORA)).toBe(
      "rancio",
    );
  });
  it("sin dato o ilegible → sin-datos", () => {
    expect(frescura(null, UMBRAL_P2P_MS, AHORA)).toBe("sin-datos");
    expect(frescura(undefined, UMBRAL_P2P_MS, AHORA)).toBe("sin-datos");
    expect(frescura("no-es-fecha", UMBRAL_P2P_MS, AHORA)).toBe("sin-datos");
  });
});

describe("haceRelativo", () => {
  it("escala segundos → minutos → horas → días", () => {
    expect(haceRelativo(hace(30 * 1000), AHORA)).toBe("hace 30 s");
    expect(haceRelativo(hace(5 * 60 * 1000), AHORA)).toBe("hace 5 min");
    expect(haceRelativo(hace(3 * 3600 * 1000), AHORA)).toBe("hace 3 h");
    expect(haceRelativo(hace(72 * 3600 * 1000), AHORA)).toBe("hace 3 días");
  });
  it("futuro o ilegible → ahora", () => {
    expect(haceRelativo(hace(-60 * 1000), AHORA)).toBe("ahora");
  });
});
