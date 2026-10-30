// Bundles the Studio Web Workers into public/workers/<name>.<hash>.js (+ manifest.json).
// Turbopack copies `new Worker(new URL("./x.worker.ts", import.meta.url))` as a raw .ts
// asset (served as video/mp2t, never runs), so the workers are built here instead.
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "workers");

const WORKERS = {
  master: "src/lib/studio/master/master.worker.ts",
  mixAnalysis: "src/lib/studio/mix-analysis/mix-analysis.worker.ts",
};

const FILE_NAMES = { master: "master.worker", mixAnalysis: "mix-analysis.worker" };

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const manifest = {};
for (const [key, entry] of Object.entries(WORKERS)) {
  const result = await build({
    entryPoints: [path.join(root, entry)],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    minify: true,
    write: false,
    tsconfig: path.join(root, "tsconfig.json"),
    logLevel: "warning",
  });
  const code = result.outputFiles[0].contents;
  const hash = createHash("sha256").update(code).digest("hex").slice(0, 12);
  const file = `${FILE_NAMES[key]}.${hash}.js`;
  writeFileSync(path.join(outDir, file), code);
  manifest[key] = `/workers/${file}`;
  console.log(`[studio-workers] ${manifest[key]} (${(code.length / 1024).toFixed(1)} kB)`);
}
writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
