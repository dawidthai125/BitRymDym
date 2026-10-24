import path from "node:path";

import { defineConfig } from "vitest/config";

import { MEDIA_ENCODE_TEST_FILES } from "./src/test/media-encode-test-files";

/**
 * Real FFmpeg/FFprobe encode run.
 * Do not import `vitest.config.ts`: its exclude list drops these files,
 * and an empty include with passWithNoTests would look like success.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: [...MEDIA_ENCODE_TEST_FILES],
    passWithNoTests: false,
    setupFiles: ["./src/test/vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
});
