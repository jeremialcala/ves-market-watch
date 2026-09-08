/// <reference types="vitest/config" />
import { defineConfig } from "vite";

// Suite e2e en vivo (gateway + tenant Auth0 reales): separada del `npm test`
// por diseño — corre con `npm run test:e2e:live` y credenciales M2M.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.test.ts"],
  },
});
