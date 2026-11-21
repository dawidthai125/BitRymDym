import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/env", () => ({ getSupabaseServiceRoleKey: () => "service-role" }));

import { resetDedicatedSecretWarnings, resolveDedicatedSecret } from "@/lib/security/dedicated-secret";

describe("dedicated HMAC secret", () => {
  beforeEach(() => resetDedicatedSecretWarnings());

  it("signs with the dedicated env and never accepts the service-role key", () => {
    const warn = vi.fn();
    const s = resolveDedicatedSecret("X_SECRET", { env: { X_SECRET: " dedicated " }, warn });
    expect(s).toEqual({ signing: "dedicated", signingIsLegacy: false, verify: ["dedicated"] });
    expect(warn).not.toHaveBeenCalled();
  });

  it("fails closed without the dedicated env (no service-role fallback)", () => {
    const warn = vi.fn();
    const a = resolveDedicatedSecret("X_SECRET", { env: {}, warn });
    expect(a).toEqual({ signing: null, signingIsLegacy: false, verify: [] });
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back to an explicit legacy key for signing and warns once", () => {
    const warn = vi.fn();
    const a = resolveDedicatedSecret("W_SECRET", { env: {}, legacy: ["old"], warn });
    resolveDedicatedSecret("W_SECRET", { env: { W_SECRET: "  " }, legacy: ["old"], warn });
    expect(a).toEqual({ signing: "old", signingIsLegacy: true, verify: ["old"] });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("W_SECRET");
  });

  it("uses explicit legacy keys in order without duplicates", () => {
    const s = resolveDedicatedSecret("Y_SECRET", { env: { Y_SECRET: "a" }, legacy: [undefined, "a", "b", "b"], warn: vi.fn() });
    expect(s.verify).toEqual(["a", "b"]);
    const none = resolveDedicatedSecret("Z_SECRET", { env: {}, legacy: [null, ""], warn: vi.fn() });
    expect(none).toEqual({ signing: null, signingIsLegacy: false, verify: [] });
  });
});
