import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

import { INTEGRATION_TEST_FILES } from "./src/test/integration-test-files";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "scripts/bpm/**/*.test.ts",
    ],
    exclude: [...configDefaults.exclude, ...INTEGRATION_TEST_FILES],
    setupFiles: ["./src/test/vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
});
