import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/env", () => ({ getSupabaseServiceRoleKey: () => "service-role" }));

import { resetDedicatedSecretWarnings, resolveDedicatedSecret } from "@/lib/security/dedicated-secret";

describe("dedicated HMAC secret", () => {
  beforeEach(() => resetDedicatedSecretWarnings());

  it("signs with the dedicated env and verifies dedicated first, legacy after", () => {
    const warn = vi.fn();
    const s = resolveDedicatedSecret("X_SECRET", { env: { X_SECRET: " dedicated " }, warn });
    expect(s).toEqual({ signing: "dedicated", signingIsLegacy: false, verify: ["dedicated", "service-role"] });
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back to the service-role key for signing when env is missing and warns once", () => {
    const warn = vi.fn();
    const a = resolveDedicatedSecret("X_SECRET", { env: {}, warn });
    resolveDedicatedSecret("X_SECRET", { env: { X_SECRET: "  " }, warn });
    expect(a).toEqual({ signing: "service-role", signingIsLegacy: true, verify: ["service-role"] });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("X_SECRET");
    expect(String(warn.mock.calls[0]![0])).not.toContain("service-role");
  });

  it("uses explicit legacy keys in order without duplicates", () => {
    const s = resolveDedicatedSecret("Y_SECRET", { env: { Y_SECRET: "a" }, legacy: [undefined, "a", "b", "b"], warn: vi.fn() });
    expect(s.verify).toEqual(["a", "b"]);
    const none = resolveDedicatedSecret("Z_SECRET", { env: {}, legacy: [null, ""], warn: vi.fn() });
    expect(none).toEqual({ signing: null, signingIsLegacy: false, verify: [] });
  });
});
