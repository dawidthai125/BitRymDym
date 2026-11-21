import { describe, expect, it } from "vitest";

import { buildCsp, cspHeaderName, generateNonce, isCspEnforced } from "./csp";

const base = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NODE_ENV: "production",
  VERCEL_ENV: "production",
};
const dir = (csp: string, name: string) =>
  csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("buildCsp", () => {
  it("puts the nonce and strict-dynamic in script-src", () => {
    const s = dir(buildCsp({ nonce: "N0NCE", env: base }), "script-src");
    expect(s).toContain("'nonce-N0NCE'");
    expect(s).toContain("'strict-dynamic'");
    expect(s).not.toContain("'unsafe-inline'");
  });

  it("has no unsafe-eval in production, allows it in development", () => {
    expect(buildCsp({ nonce: "x", env: base })).not.toContain("unsafe-eval");
    const dev = buildCsp({ nonce: "x", env: { ...base, NODE_ENV: "development" } });
    expect(dir(dev, "script-src")).toContain("'unsafe-eval'");
  });

  it("allows vercel.live only outside production", () => {
    expect(buildCsp({ nonce: "x", env: base })).not.toContain("vercel.live");
    const preview = buildCsp({ nonce: "x", env: { ...base, VERCEL_ENV: "preview" } });
    expect(dir(preview, "script-src")).toContain("https://vercel.live");
    expect(dir(preview, "frame-src")).toContain("https://vercel.live");
  });

  it("switches header name with CSP_ENFORCE=1", () => {
    expect(isCspEnforced({})).toBe(false);
    expect(cspHeaderName({})).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName({ CSP_ENFORCE: "0" })).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName({ CSP_ENFORCE: "1" })).toBe("Content-Security-Policy");
  });

  it("keeps all required sources and hardening directives", () => {
    const csp = buildCsp({ nonce: "x", env: base });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("https://va.vercel-scripts.com");
    expect(dir(csp, "style-src")).toContain("'unsafe-inline'");
    expect(dir(csp, "img-src")).toContain("https://abc.supabase.co");
    expect(dir(csp, "media-src")).toContain("https://edge.bitrymdym.pl");
    const connect = dir(csp, "connect-src");
    for (const src of [
      "https://abc.supabase.co",
      "wss://abc.supabase.co",
      "https://edge.bitrymdym.pl",
      "wss://ws-us3.pusher.com",
      "https://vitals.vercel-insights.com",
    ]) {
      expect(connect).toContain(src);
    }
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  it("adds Turnstile only when the site key is set", () => {
    expect(buildCsp({ nonce: "x", env: base })).not.toContain("challenges.cloudflare.com");
    const csp = buildCsp({ nonce: "x", env: { ...base, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "k" } });
    for (const d of ["script-src", "frame-src", "connect-src"]) {
      expect(dir(csp, d)).toContain("https://challenges.cloudflare.com");
    }
  });
});

describe("generateNonce", () => {
  it("is base64 and unique", () => {
    const a = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(generateNonce()).not.toBe(a);
  });
});
