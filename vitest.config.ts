import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The packages import each other by name; tests run against the sources, without a build.
    alias: {
      "@kobayami/graphity-core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@kobayami/graphity-controlflow": fileURLToPath(new URL("./packages/controlflow/src/index.ts", import.meta.url)),
      "@kobayami/graphity-dot": fileURLToPath(new URL("./packages/dot/src/index.ts", import.meta.url)),
      "@kobayami/graphity-mermaid": fileURLToPath(new URL("./packages/mermaid/src/index.ts", import.meta.url)),
      "@kobayami/graphity": fileURLToPath(new URL("./packages/graphity/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
  },
});
