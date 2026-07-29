/**
 * Cliente REST tipado contra `types.gen.ts` (generado del openapi.yaml del
 * gateway — fuente de verdad). El middleware inyecta el Bearer y captura las
 * cabeceras de cuota; los errores problem+json se traducen en `endpoints.ts`.
 */

import createClient from "openapi-fetch";

import { obtenerToken } from "../auth/tokenProvider";
import { config } from "../config";
import type { paths } from "./types.gen";

export interface CuotaRateLimit {
  limit?: number;
  remaining?: number;
  reset?: number;
}

type ListenerCuota = (cuota: CuotaRateLimit) => void;
let listenerCuota: ListenerCuota | null = null;

export function alCambiarCuota(listener: ListenerCuota | null): void {
  listenerCuota = listener;
}

export const client = createClient<paths>({
  baseUrl: `${config.apiBaseUrl}/api/v1`,
  // fetch perezoso: respeta un globalThis.fetch parcheado después del import
  // (interceptores de test, instrumentación) en vez de capturarlo aquí.
  fetch: (entrada) => globalThis.fetch(entrada),
});

client.use({
  async onRequest({ request }) {
    // /health es público (y se consulta antes del login): sin Bearer.
    if (!new URL(request.url).pathname.endsWith("/health")) {
      const token = await obtenerToken();
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  },
  async onResponse({ response }) {
    const limit = response.headers.get("X-RateLimit-Limit");
    if (limit !== null && listenerCuota) {
      listenerCuota({
        limit: Number(limit),
        remaining: Number(response.headers.get("X-RateLimit-Remaining")),
        reset: Number(response.headers.get("X-RateLimit-Reset")),
      });
    }
    return response;
  },
});
