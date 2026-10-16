/// <reference types="vitest/config" />
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { catalogo } from "./plugins/catalogo.ts";

/**
 * En desarrollo, `/portal/v1` va por el proxy de Vite al gateway: así el
 * portal no necesita CORS en local. Por defecto, el de `criterio-dev` en
 * midgard; `PORTAL_API_PROXY` lo cambia (por ejemplo, a un gateway local).
 * En producción el portal llama a `VITE_PORTAL_API` (ver `src/api/cliente.ts`).
 *
 * El playground de APIs llama a `/api/v1` y abre `/ws/v1`: van por el mismo
 * proxy.
 */
const destino = process.env.PORTAL_API_PROXY ?? "https://criterio-api-dev.higerotech.com";
const proxy = {
  "/portal/v1": { target: destino, changeOrigin: true },
  "/api/v1": { target: destino, changeOrigin: true },
  "/ws/v1": { target: destino.replace(/^http/, "ws"), changeOrigin: true, ws: true },
};

export default defineConfig({
  plugins: [react(), catalogo(dirname(fileURLToPath(import.meta.url)))],
  server: { port: 5174, proxy },
  preview: { port: 4174, proxy },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: [
        "src/api/portal.gen.ts",
        // Arranque y prerender: los verifica el build (`curl` al HTML), no un test.
        "src/main.tsx",
        "src/entry-server.tsx",
      ],
      // Criterio Gate 2 del monorepo: ≥ 80 % de ramas.
      thresholds: { branches: 80 },
    },
  },
});
