import { describe, expect, it, afterEach } from "vitest";

import {
  getAuthEmailRedirectTo,
  getPublicSiteUrl,
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
    expect(getSiteUrl()).toBe("https://www.bitrymdym.pl");
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
      "https://www.bitrymdym.pl/auth/callback",
    );
  });

  it("adds only a safe next to the auth email redirect", () => {
    clearEnv();
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.bitrymdym.pl";
    expect(getAuthEmailRedirectTo("/studio?beatId=b1")).toBe(
      "https://www.bitrymdym.pl/auth/callback?next=%2Fstudio%3FbeatId%3Db1",
    );
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", null, undefined]) {
      expect(getAuthEmailRedirectTo(bad)).toBe("https://www.bitrymdym.pl/auth/callback");
    }
  });
});

describe("getPublicSiteUrl (served origin)", () => {
  afterEach(() => restoreEnv());
  it("maps the apex canonical to www (Vercel answers the apex with 308)", () => {
    clearEnv();
    process.env.NEXT_PUBLIC_SITE_URL = "https://bitrymdym.pl";
    expect(getPublicSiteUrl()).toBe("https://www.bitrymdym.pl");
    expect(getAuthEmailRedirectTo()).toBe("https://www.bitrymdym.pl/auth/callback");
  });
  it("keeps any other origin", () => {
    clearEnv();
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.bitrymdym.pl/";
    expect(getPublicSiteUrl()).toBe("https://www.bitrymdym.pl");
    clearEnv();
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    expect(getPublicSiteUrl()).toBe("http://localhost:3000");
  });
});
