/**
 * Test-only: resolve next-intl calls against messages/pl.json (default locale)
 * when components or server pages are rendered outside a request/provider.
 */
import { vi } from "vitest";
import { createTranslator } from "use-intl/core";

import pl from "../../messages/pl.json";

const translator = (namespace?: string) =>
  createTranslator({
    locale: "pl",
    messages: pl,
    namespace: namespace as never,
    timeZone: "Europe/Warsaw",
  });

vi.mock("next-intl/server", () => ({
  getTranslations: async (arg?: string | { namespace?: string }) =>
    translator(typeof arg === "string" ? arg : arg?.namespace),
  getLocale: async () => "pl",
  getMessages: async () => pl,
  getRequestConfig: (fn: unknown) => fn,
}));

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  return {
    ...actual,
    useTranslations: (namespace?: string) => translator(namespace),
    useLocale: () => "pl",
  };
});

async function patchFs<T extends { readFileSync: (...a: never[]) => unknown }>(
  actual: T,
): Promise<T> {
  const { resolveI18nSource, shouldResolveSourcePath } = await import(
    "@/test/i18n-source-resolve"
  );
  const orig = actual.readFileSync as (...a: unknown[]) => unknown;
  const readFileSync = (...args: unknown[]) => {
    const res = orig(...args);
    return typeof res === "string" && shouldResolveSourcePath(args[0])
      ? resolveI18nSource(res)
      : res;
  };
  return { ...actual, readFileSync, default: { ...actual, readFileSync } } as T;
}

vi.mock("node:fs", async (importOriginal) => patchFs(await importOriginal()));
vi.mock("fs", async (importOriginal) => patchFs(await importOriginal()));
