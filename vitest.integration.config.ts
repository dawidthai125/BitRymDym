import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

import { INTEGRATION_TEST_FILES } from "./src/test/integration-test-files";

/** Local Supabase only — see README.md, section "Testy". */
export default defineConfig({
  test: {
    environment: "node",
    include: [...INTEGRATION_TEST_FILES],
    exclude: [...configDefaults.exclude],
    globalSetup: ["./src/test/vitest.integration.global-setup.ts"],
    setupFiles: [
      "./src/test/vitest.setup.ts",
      "./src/test/vitest.integration.setup.ts",
    ],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
});
