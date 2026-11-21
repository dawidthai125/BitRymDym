import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "198.51.100.7" }),
}));

import { isTurnstileEnabled, verifyTurnstile } from "@/lib/auth/turnstile";

const fd = (token?: string) => {
  const f = new FormData();
  if (token) f.set("cf-turnstile-response", token);
  return f;
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("turnstile", () => {
  it("is disabled and a no-op unless both keys are set", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(isTurnstileEnabled()).toBe(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyTurnstile(fd())).resolves.toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("enabled", () => {
    beforeEach(() => {
      vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site");
      vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    });
    it("rejects a missing token without calling Cloudflare", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      expect((await verifyTurnstile(fd())).ok).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });
    it("accepts success:true and posts to siteverify", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
      vi.stubGlobal("fetch", fetchMock);
      expect((await verifyTurnstile(fd("tok"))).ok).toBe(true);
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      );
    });
    it("fails closed on success:false, HTTP error, and network error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false }) }));
      expect((await verifyTurnstile(fd("t"))).ok).toBe(false);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
      expect((await verifyTurnstile(fd("t"))).ok).toBe(false);
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
      expect((await verifyTurnstile(fd("t"))).ok).toBe(false);
    });
  });
});
