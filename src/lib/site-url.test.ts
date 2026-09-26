import { describe, expect, it, afterEach } from "vitest";

import {
  getAuthEmailRedirectTo,
  getSiteUrl,
  SITE_URL_CANONICAL_PRODUCTION,
} from "@/lib/site-url";

const KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_VERCEL_URL",
  "VERCEL_URL",
  "VERCEL_ENV",
] as const;

const snapshot: Record<string, string | undefined> = {};

function clearEnv() {
  for (const k of KEYS) {
    snapshot[k] = process.env[k];
    delete process.env[k];
  }
}

function restoreEnv() {
  for (const k of KEYS) {
    const v = snapshot[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("getSiteUrl", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("prefers NEXT_PUBLIC_SITE_URL", () => {
    clearEnv();
    process.env.NEXT_PUBLIC_SITE_URL = "https://bitrymdym.pl";
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "bitrymdym-dawidthai125s-projects.vercel.app";
    expect(getSiteUrl()).toBe("https://bitrymdym.pl");
  });

  it("uses canonical production origin when SITE_URL unset on Vercel production", () => {
    clearEnv();
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "bitrymdym-dawidthai125s-projects.vercel.app";
    process.env.NEXT_PUBLIC_VERCEL_URL =
      "bitrymdym-dawidthai125s-projects.vercel.app";
    expect(getSiteUrl()).toBe(SITE_URL_CANONICAL_PRODUCTION);
    expect(getSiteUrl()).not.toContain("vercel.app");
  });

  it("uses Vercel preview URL when not production", () => {
    clearEnv();
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "bitrymdym-git-feature-x.vercel.app";
    expect(getSiteUrl()).toBe("https://bitrymdym-git-feature-x.vercel.app");
  });

  it("falls back to localhost", () => {
    clearEnv();
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });

  it("builds auth email redirect to /auth/callback", () => {
    clearEnv();
    process.env.NEXT_PUBLIC_SITE_URL = "https://bitrymdym.pl";
    expect(getAuthEmailRedirectTo()).toBe(
      "https://bitrymdym.pl/auth/callback",
    );
  });
});
