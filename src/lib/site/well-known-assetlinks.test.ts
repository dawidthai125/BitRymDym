import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { config } from "@/middleware";

import nextConfig from "../../../next.config";

/** Android TWA (android-twa/): Digital Asset Links must be served as a plain static 200 JSON. */
describe("/.well-known/assetlinks.json", () => {
  const matchers = config.matcher.map((m) => new RegExp(`^${m}$`));
  const runsMiddleware = (p: string) => matchers.some((re) => re.test(p));

  it("bypasses middleware (no maintenance rewrite / redirect)", () => {
    expect(runsMiddleware("/.well-known/assetlinks.json")).toBe(false);
    expect(runsMiddleware("/")).toBe(true);
    expect(runsMiddleware("/studio")).toBe(true);
  });

  it("is not redirected by next.config", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects.some((r) => r.source.startsWith("/.well-known"))).toBe(false);
  });

  it("declares the TWA package with SHA-256 fingerprints", () => {
    const file = path.join(process.cwd(), "public", ".well-known", "assetlinks.json");
    const statements = JSON.parse(readFileSync(file, "utf8")) as Array<{
      relation: string[];
      target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
    }>;
    const app = statements.find((s) => s.target.package_name === "pl.bitrymdym.app");
    expect(app?.relation).toContain("delegate_permission/common.handle_all_urls");
    expect(app?.target.namespace).toBe("android_app");
    expect(app?.target.sha256_cert_fingerprints.length).toBeGreaterThan(0);
    for (const fp of app?.target.sha256_cert_fingerprints ?? []) {
      expect(fp).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    }
  });
});
