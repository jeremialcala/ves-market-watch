import { describe, expect, it } from "vitest";

import {
  BACKOFF_MAX_MS,
  calcularBackoff,
  decidirTrasCierre,
  DELAY_LIMITE_MS,
  MAX_FALLOS_AUTH,
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
  it("el PRIMER 4401 → refrescar token y reconectar ya", () => {
    // El caso corriente: token caducado. Pedir otro lo arregla en el acto y
    // hacer esperar al usuario por eso sería gratuito.
    expect(decidirTrasCierre(4401, 0, 0.5, 1)).toEqual({
      accion: "refrescar-y-reconectar",
    });
  });
  it("4403 → detener (reintentar no arregla el permiso)", () => {
    const decision = decidirTrasCierre(4403, 0, 0.5, 0);
    expect(decision.accion).toBe("detener");
  });
  it("1008 → espera larga con aviso de múltiples pestañas", () => {
    const decision = decidirTrasCierre(1008, 0, 0.5, 0);
    expect(decision).toMatchObject({ accion: "esperar", delayMs: DELAY_LIMITE_MS });
    expect(
      decision.accion === "esperar" ? decision.motivo : "",
    ).toContain("pestañas");
  });
  it("cierre de red → backoff con jitter", () => {
    const decision = decidirTrasCierre(1006, 2, 0.5, 0);
    expect(decision).toEqual({ accion: "esperar", delayMs: 4000 });
  });
});

describe("4401 repetido: el bucle que tumbó el gateway el 2026-08-22", () => {
  /*
   * Un 4401 que NO viene de un token viejo —aquel día, el reloj del host 37 s
   * atrasado hacía que el `iat` de Auth0 llegara «en el futuro»— no se arregla
   * pidiendo otro token: el nuevo sale igual de rechazado. La rama era la única
   * que se saltaba el backoff, así que el ciclo giraba sin esperar y cada vuelta
   * disparaba un resync REST completo: 16 000 peticiones en 18 minutos.
   */

  it("del segundo en adelante espera, y la espera CRECE", () => {
    const esperas = [2, 3, 4, 5].map((fallos) => {
      const decision = decidirTrasCierre(4401, 0, 0.5, fallos);
      expect(decision.accion).toBe("esperar");
      return decision.accion === "esperar" ? decision.delayMs : 0;
    });

    expect(esperas).toEqual([1000, 2000, 4000, 8000]);
    // Y sigue pidiendo token nuevo: si el 4401 SÍ era por vejez y el primer
    // refresco se cruzó con la renovación, el siguiente lo arregla.
    const segundo = decidirTrasCierre(4401, 0, 0.5, 2);
    expect(segundo.accion === "esperar" && segundo.refrescar).toBe(true);
  });

  it("pasado el tope se detiene con un motivo que se lee", () => {
    const decision = decidirTrasCierre(4401, 0, 0.5, MAX_FALLOS_AUTH + 1);

    expect(decision.accion).toBe("detener");
    // El motivo va al tooltip del indicador de conexión: tiene que decirle a
    // alguien qué mirar. «Detenido» a secas fue lo que se vio aquel día.
    const motivo = decision.accion === "detener" ? decision.motivo : "";
    expect(motivo).toMatch(/autenticar/i);
    expect(motivo).toMatch(/hora del sistema/i);
  });

  it("ninguna vuelta del ciclo reconecta sin esperar salvo la primera", () => {
    /*
     * La guarda directa contra la regresión: recorrer la escalera entera y
     * comprobar que solo hay UNA acción inmediata. Con la política anterior,
     * las MAX_FALLOS_AUTH vueltas eran inmediatas.
     */
    const inmediatas = Array.from(
      { length: MAX_FALLOS_AUTH + 2 },
      (_, i) => decidirTrasCierre(4401, 0, 0.5, i + 1),
    ).filter((d) => d.accion === "refrescar-y-reconectar");

    expect(inmediatas).toHaveLength(1);
  });
});
