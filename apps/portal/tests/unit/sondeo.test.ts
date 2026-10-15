/**
 * El sondeo del «en vivo» (RF-3) y las tres pruebas de ADR-0028 §Verificación
 * que le tocan: pestaña oculta → 0 peticiones; `Retry-After` respetado; y que
 * con un fallo se conserve el último dato.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crearSondeo, esperaTrasFallo, leerRetryAfter, type Instantanea } from "../../src/datos/sondeo";

class DocumentoFalso {
  visibilityState: DocumentVisibilityState = "visible";
  private oyentes = new Set<() => void>();
  addEventListener(_tipo: string, oyente: () => void) {
    this.oyentes.add(oyente);
  }
  removeEventListener(_tipo: string, oyente: () => void) {
    this.oyentes.delete(oyente);
  }
  cambiar(estado: DocumentVisibilityState) {
    this.visibilityState = estado;
    this.oyentes.forEach((o) => o());
  }
}

function respuesta(estado: number, cuerpo: unknown = {}, cabeceras: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: cabeceras });
}

let documento: DocumentoFalso;
let vistas: Instantanea<{ n: number }>[];

beforeEach(() => {
  vi.useFakeTimers();
  documento = new DocumentoFalso();
  vistas = [];
});
afterEach(() => vi.useRealTimers());

function arrancar(pedir: typeof fetch, intervaloMs = 10_000) {
  return crearSondeo<{ n: number }>(
    { url: "/portal/v1/snapshot", intervaloMs, fetch: pedir, documento: documento as unknown as Document, azar: () => 0.5 },
    (v) => vistas.push(v),
  );
}

describe("crearSondeo", () => {
  it("pide al montar y después cada 10 s", async () => {
    let n = 0;
    const pedir = vi.fn(async () => respuesta(200, { n: ++n }));
    const parar = arrancar(pedir);
    await vi.advanceTimersByTimeAsync(0);
    expect(vistas.at(-1)).toEqual({ datos: { n: 1 }, estado: "en-vivo" });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(pedir).toHaveBeenCalledTimes(4);
    parar();
  });

  it("con la pestaña oculta, 0 peticiones en 60 s; al volver, pide en seguida", async () => {
    const pedir = vi.fn(async () => respuesta(200, { n: 1 }));
    const parar = arrancar(pedir);
    await vi.advanceTimersByTimeAsync(0);
    documento.cambiar("hidden");
    pedir.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(pedir).not.toHaveBeenCalled();
    documento.cambiar("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(pedir).toHaveBeenCalledTimes(1);
    parar();
  });

  it("ante un 429 con Retry-After: 30, no vuelve a pedir antes de 30 s", async () => {
    const pedir = vi
      .fn()
      .mockResolvedValueOnce(respuesta(200, { n: 1 }))
      .mockResolvedValueOnce(respuesta(429, {}, { "Retry-After": "30" }))
      .mockResolvedValue(respuesta(200, { n: 2 }));
    const parar = arrancar(pedir as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_000); // el 429
    expect(vistas.at(-1)).toEqual({ datos: { n: 1 }, estado: "sin-conexion" });
    pedir.mockClear();
    await vi.advanceTimersByTimeAsync(29_000);
    expect(pedir).not.toHaveBeenCalled();
    // Ni ocultando y mostrando la pestaña se salta la espera.
    documento.cambiar("hidden");
    documento.cambiar("visible");
    await vi.advanceTimersByTimeAsync(500);
    expect(pedir).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(vistas.at(-1)).toEqual({ datos: { n: 2 }, estado: "en-vivo" });
    parar();
  });

  it("sin red retrocede y conserva el último dato; un 5xx igual", async () => {
    const pedir = vi
      .fn()
      .mockResolvedValueOnce(respuesta(200, { n: 1 }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(respuesta(503))
      .mockResolvedValue(respuesta(200, { n: 3 }));
    const parar = arrancar(pedir as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(vistas.at(-1)).toEqual({ datos: { n: 1 }, estado: "sin-conexion" });
    // Primer fallo: 20 s (10 × 2¹), segundo: 40 s. No un bucle cada 10 s.
    pedir.mockClear();
    await vi.advanceTimersByTimeAsync(19_000);
    expect(pedir).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(pedir).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(vistas.at(-1)).toEqual({ datos: { n: 3 }, estado: "en-vivo" });
    parar();
  });

  it("al pararlo no vuelve a pedir ni a publicar", async () => {
    const pedir = vi.fn(async () => respuesta(200, { n: 1 }));
    const parar = arrancar(pedir);
    await vi.advanceTimersByTimeAsync(0);
    parar();
    pedir.mockClear();
    const antes = vistas.length;
    await vi.advanceTimersByTimeAsync(60_000);
    documento.cambiar("visible");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(pedir).not.toHaveBeenCalled();
    expect(vistas.length).toBe(antes);
  });
});

describe("utilidades", () => {
  it("esperaTrasFallo: exponencial con tope, jitter y Retry-After como mínimo", () => {
    expect(esperaTrasFallo(1, 10_000, 300_000, null, () => 0.5)).toBe(20_000);
    expect(esperaTrasFallo(10, 10_000, 300_000, null, () => 0.5)).toBe(300_000);
    expect(esperaTrasFallo(1, 10_000, 300_000, null, () => 0)).toBe(16_000);
    expect(esperaTrasFallo(1, 10_000, 300_000, 120, () => 0.5)).toBe(120_000);
  });

  it("leerRetryAfter solo acepta segundos", () => {
    expect(leerRetryAfter("30")).toBe(30);
    expect(leerRetryAfter(" 5 ")).toBe(5);
    expect(leerRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT")).toBeNull();
    expect(leerRetryAfter(null)).toBeNull();
  });
});
