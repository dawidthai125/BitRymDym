import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { middleware } from "@/middleware";

afterEach(() => vi.unstubAllEnvs());

describe("middleware CSP", () => {
  it("sets a report-only CSP with a per-request nonce and forwards x-nonce", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const call = () => middleware(new NextRequest("https://www.bitrymdym.pl/"));
    const a = await call();
    const b = await call();
    const csp = a.headers.get("Content-Security-Policy-Report-Only") ?? "";
    expect(a.headers.get("Content-Security-Policy")).toBeNull();
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(a.headers.get("x-middleware-override-headers")).toContain("x-nonce");
    expect(a.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(b.headers.get("x-middleware-request-x-nonce")).not.toBe(nonce);
  });

  it("enforces with CSP_ENFORCE=1", async () => {
    vi.stubEnv("CSP_ENFORCE", "1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const res = await middleware(new NextRequest("https://www.bitrymdym.pl/"));
    expect(res.headers.get("Content-Security-Policy")).toContain("'strict-dynamic'");
    expect(res.headers.get("Content-Security-Policy-Report-Only")).toBeNull();
  });
});
