/**
 * E3 EXTERNAL worker CLI only — maps `server-only` to an empty module
 * (same semantic as Vitest alias in vitest.config.ts -> src/test/server-only-stub.ts).
 *
 * tsx compiles worker imports to CJS require("server-only"), so this register
 * patches Module._resolveFilename (ESM resolve hooks alone are insufficient).
 *
 * Usage:
 *   npx tsx --import ./scripts/register-server-only-stub.mjs scripts/e3-render-worker-once.ts <jobId>
 *
 * Does NOT affect Next.js / RSC / Vitest / production bundles.
 * Does NOT remove import "server-only" from application modules.
 */

import Module from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const stubCjsPath = path.join(here, "server-only-empty.cjs");

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveServerOnlyStub(
  request,
  parent,
  isMain,
  options,
) {
  if (request === "server-only") {
    return stubCjsPath;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const stubFileUrl = pathToFileURL(stubCjsPath).href;
const hookSource = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      shortCircuit: true,
      url: ${JSON.stringify(stubFileUrl)},
      format: "commonjs",
    };
  }
  return nextResolve(specifier, context);
}
`;

register(
  `data:text/javascript,${encodeURIComponent(hookSource)}`,
  pathToFileURL(fileURLToPath(import.meta.url)).href,
);
