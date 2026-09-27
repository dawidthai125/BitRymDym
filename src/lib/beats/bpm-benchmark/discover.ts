import fs from "node:fs";
import path from "node:path";

import { parseFixtureFilename } from "@/lib/beats/bpm-benchmark/parse-fixture";
import type { FixtureMeta } from "@/lib/beats/bpm-benchmark/types";

export const DEFAULT_BPM_FIXTURES_DIR = path.resolve(
  process.cwd(),
  "..",
  "bitrymdym-fixtures",
);

/**
 * Discover known-BPM fixtures by filename convention.
 * Does not create files. Returns empty if directory missing.
 */
export function discoverBpmFixtures(
  fixturesDir: string = DEFAULT_BPM_FIXTURES_DIR,
): FixtureMeta[] {
  if (!fs.existsSync(fixturesDir)) {
    return [];
  }

  const entries = fs.readdirSync(fixturesDir, { withFileTypes: true });
  const out: FixtureMeta[] = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const absolutePath = path.join(fixturesDir, ent.name);
    const meta = parseFixtureFilename(ent.name, absolutePath);
    if (meta) out.push(meta);
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

export function fixturesDirectoryExists(
  fixturesDir: string = DEFAULT_BPM_FIXTURES_DIR,
): boolean {
  return fs.existsSync(fixturesDir);
}
