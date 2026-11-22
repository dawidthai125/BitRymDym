import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AbstractIntlMessages } from "next-intl";

import en from "../../messages/en.json";
import pl from "../../messages/pl.json";

vi.mock("next-intl/server", () => ({ getMessages: vi.fn() }));

const { selectPublicClientMessages } = await import("@/i18n/client-messages");

const SRC = path.resolve(__dirname, "..");
const APP = path.join(SRC, "app");

/**
 * Route segments that nest their own NextIntlClientProvider with the account
 * tree (FullClientMessages / StudioClientMessages / AdminClientMessages).
 */
const OWN_PROVIDER_SEGMENTS = new Set(["account", "beat", "studio", "admin", "api"]);
const ENTRY_FILE = /^(page|layout|template|error|global-error|not-found|loading|default)\.tsx$/;

function walkEntries(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (dir === APP && OWN_PROVIDER_SEGMENTS.has(name)) continue;
      walkEntries(full, out);
    } else if (ENTRY_FILE.test(name)) {
      out.push(full);
    }
  }
}

const EXTENSIONS = [".tsx", ".ts", "/index.tsx", "/index.ts"];
/** Protected WIP: never opened by tooling (AGENTS.md). Server-only, no client copy. */
const NEVER_READ = new Set([path.join(SRC, "lib/takes/recording-eligibility-service.ts")]);

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

const IMPORT_RE =
  /(?:^|[\s;])(?:import|export)\s+(type\s+)?(?:[^"'`;]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const USE_TRANSLATIONS_RE = /useTranslations\(\s*([^)]*?)\s*\)/g;

/** Namespaces read by client modules reachable from public route entries. */
function publicClientNamespaces(): Map<string, Set<string>> {
  const entries: string[] = [];
  walkEntries(APP, entries);
  const used = new Map<string, Set<string>>();
  const seen = new Map<string, boolean>(); // file -> visited as client
  const stack: Array<[string, boolean]> = entries.map((file) => [file, false]);
  while (stack.length > 0) {
    const [file, parentClient] = stack.pop()!;
    const source = readFileSync(file, "utf8");
    const isClient = parentClient || /^\s*["']use client["']/.test(source);
    const prev = seen.get(file);
    if (prev === true || (prev === false && !isClient)) continue;
    seen.set(file, isClient);
    if (isClient) {
      for (const match of source.matchAll(USE_TRANSLATIONS_RE)) {
        const arg = match[1];
        const literal = /^["'`]([^"'`$]*)["'`]$/.exec(arg);
        const namespace = literal ? literal[1] : arg === "" ? "" : `<dynamic:${arg}>`;
        const rel = path.relative(SRC, file);
        if (!used.has(namespace)) used.set(namespace, new Set());
        used.get(namespace)!.add(rel);
      }
    }
    for (const match of source.matchAll(IMPORT_RE)) {
      if (match[1]) continue; // `import type` carries no runtime code
      const resolved = resolveImport(file, match[2] ?? match[3]);
      if (resolved && !resolved.includes(".test.") && !NEVER_READ.has(resolved)) stack.push([resolved, isClient]);
    }
  }
  return used;
}

function hasPath(messages: AbstractIntlMessages, namespace: string): boolean {
  let node: unknown = messages;
  for (const key of namespace.split(".")) {
    if (!node || typeof node !== "object" || !(key in node)) return false;
    node = (node as Record<string, unknown>)[key];
  }
  return node !== undefined;
}

describe("public client messages", () => {
  const used = publicClientNamespaces();

  it("walks the real client graph of public routes", () => {
    // Sanity: the root layout's player and the Premium form are reachable.
    expect(used.get("common.guestPreview")).toBeDefined();
    expect(used.get("account.premiumPage.checkout")).toBeDefined();
  });

  it.each([
    ["pl", pl],
    ["en", en],
  ])("ships every namespace public client components read (%s)", (_locale, messages) => {
    const light = selectPublicClientMessages(messages as AbstractIntlMessages);
    const missing = [...used.entries()]
      .filter(([namespace]) => !hasPath(light, namespace))
      .map(([namespace, files]) => `${namespace || "<root>"} <- ${[...files].join(", ")}`);
    expect(missing).toEqual([]);
  });

  it("drops studio, admin and most of account", () => {
    const light = selectPublicClientMessages(pl as AbstractIntlMessages);
    expect(light.studio).toBeUndefined();
    expect(light.admin).toBeUndefined();
    expect(Object.keys(light.account as AbstractIntlMessages)).toEqual(["premiumPage"]);
    expect(Object.keys((light.account as AbstractIntlMessages).premiumPage as object)).toEqual([
      "checkout",
    ]);
    expect(light.common).toEqual(pl.common);
  });
});
