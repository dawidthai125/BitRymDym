import { execFileSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  MEDIA_ENCODE_TEST_FILES,
  MP3_QC_REJECT_TEST_FILE,
} from "@/test/media-encode-test-files";
import defaultConfig from "../../vitest.config";
import mediaConfig from "../../vitest.media.config";

function normalize(file: string): string {
  return file.replace(/\\/g, "/");
}

function relativeTestPath(file: string): string {
  const rel = path.isAbsolute(file) ? path.relative(repoRoot(), file) : file;
  return normalize(rel);
}

function repoRoot(): string {
  return path.resolve(__dirname, "../..");
}

/**
 * `vitest list --filesOnly` uses Vitest's file glob (`listFiles` / `globTestFiles`).
 * It does not call `collect()`, so it does not import test modules, run hooks,
 * or run setup files. See vitest 2.1 `collect()` in `dist/chunks/cac.*.js`.
 */
function listFiles(configFile: string): string[] {
  const stdout = execFileSync(
    process.execPath,
    [
      path.join(repoRoot(), "node_modules/vitest/vitest.mjs"),
      "list",
      "--filesOnly",
      "--config",
      configFile,
      "--json",
    ],
    {
      cwd: repoRoot(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const parsed = JSON.parse(stdout) as Array<{ file: string }>;
  return parsed.map((entry) => relativeTestPath(entry.file));
}

describe("MP3 suite selection", () => {
  it("default Vitest file list omits MP3 encode files and keeps QC rejects", () => {
    const exclude = (defaultConfig.test?.exclude ?? []).map((file) =>
      normalize(String(file)),
    );
    for (const file of MEDIA_ENCODE_TEST_FILES) {
      expect(exclude, file).toContain(file);
    }
    expect(exclude).not.toContain(MP3_QC_REJECT_TEST_FILE);
    expect(defaultConfig.test?.passWithNoTests).not.toBe(true);

    const listed = listFiles("vitest.config.ts");
    for (const file of MEDIA_ENCODE_TEST_FILES) {
      expect(listed, file).not.toContain(file);
    }
    expect(listed).toContain(MP3_QC_REJECT_TEST_FILE);
  });

  it("media config lists exactly the two encode files and fails closed when empty", () => {
    expect(mediaConfig.test?.passWithNoTests).toBe(false);
    expect(
      [...(mediaConfig.test?.include ?? [])].map((file) => normalize(String(file))),
    ).toEqual([...MEDIA_ENCODE_TEST_FILES]);

    const listed = listFiles("vitest.media.config.ts");
    expect([...listed].sort()).toEqual([...MEDIA_ENCODE_TEST_FILES].sort());
  });
});
