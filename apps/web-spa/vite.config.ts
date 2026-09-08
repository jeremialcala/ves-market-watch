/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: [
      "tests/unit/**/*.test.{ts,tsx}",
      "tests/component/**/*.test.{ts,tsx}",
      "tests/contract/**/*.test.{ts,tsx}",
    ],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: [
        "src/api/types.gen.ts",
        "src/vite-env.d.ts",
        // Wiring/bootstrap sin lógica propia: se verifican con el e2e en vivo
        // (login real + stream), no con unit tests (ADR-0017).
        "src/main.tsx",
        "src/App.tsx",
        "src/auth/AuthProvider.tsx",
        "src/ws/useStream.ts",
      ],
      // Criterio Gate 2 del monorepo: ≥ 80 % de ramas.
      thresholds: { branches: 80 },
    },
  },
});
