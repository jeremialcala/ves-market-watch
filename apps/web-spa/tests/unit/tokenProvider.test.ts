/**
 * Puente entre el SDK de Auth0 (árbol React) y los clientes REST/WSS (módulos
 * planos).
 *
 * Lo que se fija aquí es la carrera que dejó tres tarjetas en blanco durante
 * días sin un solo error en consola: React ejecuta los efectos **de hijo a
 * padre**, así que el efecto de montaje de una vista dispara ANTES que el del
 * `TokenBridge` que la envuelve. Si `obtenerToken` lanza en ese instante, la
 * petición muere; y con `deps: []` no se reintenta nunca.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  obtenerToken,
  registrarTokenProvider,
} from "../../src/auth/tokenProvider";

afterEach(() => {
  registrarTokenProvider(null);
  vi.useRealTimers();
});

const proveedor = (token = "jwt") => ({ getToken: async () => token });

describe("tokenProvider", () => {
  it("entrega el token cuando el proveedor ya está registrado", async () => {
    registrarTokenProvider(proveedor("jwt-1"));
    await expect(obtenerToken()).resolves.toBe("jwt-1");
  });

  it("ESPERA al registro en vez de fallar: es la carrera del montaje", async () => {
    // Orden real: la vista pide el token…
    const pendiente = obtenerToken();
    // …y solo después el TokenBridge (padre) registra el proveedor.
    registrarTokenProvider(proveedor("jwt-tardío"));
    await expect(pendiente).resolves.toBe("jwt-tardío");
  });

  it("varias peticiones simultáneas se resuelven con un solo registro", async () => {
    const peticiones = [obtenerToken(), obtenerToken(), obtenerToken()];
    registrarTokenProvider(proveedor("jwt-2"));
    await expect(Promise.all(peticiones)).resolves.toEqual([
      "jwt-2",
      "jwt-2",
      "jwt-2",
    ]);
  });

  it("la espera está ACOTADA: sin sesión no se cuelga para siempre", async () => {
    vi.useFakeTimers();
    const pendiente = obtenerToken();
    const fallo = expect(pendiente).rejects.toThrow(/no registrado/);
    await vi.advanceTimersByTimeAsync(10_000);
    await fallo;
  });

  it("al desregistrar (logout) se vuelve a esperar, no se sirve el anterior", async () => {
    registrarTokenProvider(proveedor("jwt-viejo"));
    await expect(obtenerToken()).resolves.toBe("jwt-viejo");

    registrarTokenProvider(null);
    const pendiente = obtenerToken();
    registrarTokenProvider(proveedor("jwt-nuevo"));
    await expect(pendiente).resolves.toBe("jwt-nuevo");
  });

  it("propaga forceRefresh al SDK", async () => {
    const getToken = vi.fn(async () => "jwt-3");
    registrarTokenProvider({ getToken });
    await obtenerToken({ forceRefresh: true });
    expect(getToken).toHaveBeenCalledWith({ forceRefresh: true });
  });
});
