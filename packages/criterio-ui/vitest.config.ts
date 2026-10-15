import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/index.ts"],
      // Criterio Gate 2 del monorepo: ≥ 80 % de ramas.
      thresholds: { branches: 80 },
    },
  },
});
