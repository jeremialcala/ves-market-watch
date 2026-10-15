/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * En desarrollo, `/portal/v1` va por el proxy de Vite al gateway: así el
 * portal no necesita CORS en local. Por defecto, el de `criterio-dev` en
 * midgard; `PORTAL_API_PROXY` lo cambia (por ejemplo, a un gateway local).
 * En producción el portal llama a `VITE_PORTAL_API` (ver `src/api/cliente.ts`).
 */
const destino = process.env.PORTAL_API_PROXY ?? "https://criterio-api-dev.higerotech.com";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: { "/portal/v1": { target: destino, changeOrigin: true } },
  },
  preview: {
    port: 4174,
    proxy: { "/portal/v1": { target: destino, changeOrigin: true } },
  },
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
