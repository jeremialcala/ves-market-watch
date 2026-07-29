// Frescura del contrato: src/api/types.gen.ts va COMMITEADO (ADR-0017) y debe
// coincidir con lo que generaría el openapi.yaml actual del gateway. Regenera
// a un archivo temporal y compara; si difiere, la suite falla.
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temporal = join(tmpdir(), `vmw-types-gen-${process.pid}.ts`);
try {
  execFileSync(
    "npx",
    ["openapi-typescript", "../api-gateway/docs/openapi.yaml", "-o", temporal],
    { stdio: "pipe", shell: process.platform === "win32" },
  );
  const normalizar = (texto) => texto.replaceAll("\r\n", "\n");
  const generado = normalizar(readFileSync(temporal, "utf8"));
  const commiteado = normalizar(readFileSync("src/api/types.gen.ts", "utf8"));
  if (generado !== commiteado) {
    console.error(
      "✗ src/api/types.gen.ts está desactualizado respecto a " +
        "apps/api-gateway/docs/openapi.yaml — corre `npm run generate:api` " +
        "y commitea el resultado.",
    );
    process.exit(1);
  }
  console.log("✓ types.gen.ts al día con openapi.yaml");
} finally {
  rmSync(temporal, { force: true });
}
