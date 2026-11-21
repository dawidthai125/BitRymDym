import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
let serviceKey: string | undefined = "unit-test-service-key";

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc }),
}));
vi.mock("@/lib/supabase/env", () => ({
  getSupabaseServiceRoleKey: () => serviceKey,
}));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      "x-forwarded-for": "6.6.6.6, 1.1.1.1",
      "x-vercel-forwarded-for": "203.0.113.9",
    }),
}));

import {
  AUTH_LIMITS,
  checkAuthAttempt,
  clientIpFromHeaders,
  hashAttemptKey,
  limitPasswordReset,
  limitReauth,
  limitSignIn,
  limitSignUp,
  normalizeEmailForLimit,
  tooManyAttemptsMessage,
} from "@/lib/auth/attempt-limit";

const ok = { data: [{ status: "ok", retry_after_seconds: 0 }], error: null };
const blocked = (s: number) => ({
  data: [{ status: "blocked", retry_after_seconds: s }],
  error: null,
});

beforeEach(() => {
  rpc.mockReset();
  serviceKey = "unit-test-service-key";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("normalizeEmailForLimit / hashing / ip", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizeEmailForLimit("  Foo@Example.COM ")).toBe("foo@example.com");
  });
  it("hash is stable, hex, and never contains the raw value", () => {
    const a = hashAttemptKey("email", "foo@example.com");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(hashAttemptKey("email", "foo@example.com"));
    expect(a).not.toContain("foo");
    expect(a).not.toBe(hashAttemptKey("ip", "foo@example.com"));
  });
  it("falls back to plain prefixed SHA-256 without the service key", () => {
    const keyed = hashAttemptKey("ip", "1.2.3.4");
    serviceKey = undefined;
    const plain = hashAttemptKey("ip", "1.2.3.4");
    expect(plain).toMatch(/^[0-9a-f]{64}$/);
    expect(plain).not.toBe(keyed);
  });
  it("uses platform ip headers, not the first x-forwarded-for hop", () => {
    expect(
      clientIpFromHeaders(
        new Headers({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "10.0.0.1" }),
      ),
    ).toBe("10.0.0.1");
    expect(
      clientIpFromHeaders(new Headers({ "x-forwarded-for": "6.6.6.6" })),
    ).toBe("unknown");
    expect(
      clientIpFromHeaders(new Headers({ "x-vercel-forwarded-for": "9.9.9.9" })),
    ).toBe("9.9.9.9");
  });
  it("message rounds minutes up", () => {
    expect(tooManyAttemptsMessage(61)).toBe("Zbyt wiele prób. Spróbuj ponownie za 2 min.");
    expect(tooManyAttemptsMessage(1)).toBe("Zbyt wiele prób. Spróbuj ponownie za 1 min.");
  });
});

describe("thresholds and RPC contract", () => {
  it("sign-in: 8/15min per email + 30/15min per IP, hashed args", async () => {
    rpc.mockResolvedValue(ok);
    await expect(limitSignIn(" A@B.pl ")).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledTimes(2);
    const [name, a] = rpc.mock.calls[0];
    expect(name).toBe("auth_attempt_check");
    expect(a).toMatchObject({
      p_action: "signin:email",
      p_max: 8,
      p_window_seconds: 900,
      p_record: true,
    });
    expect(a.p_key_hash).toBe(hashAttemptKey("email", "a@b.pl"));
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_action: "signin:ip",
      p_max: 30,
      p_window_seconds: 900,
      p_key_hash: hashAttemptKey("ip", "203.0.113.9"),
    });
  });
  it("reset 3/h email + 10/h ip; signup 5/h ip; reauth 5/15min user", async () => {
    rpc.mockResolvedValue(ok);
    await limitPasswordReset("x@y.pl");
    await limitSignUp();
    await limitReauth("user-1");
    const args = rpc.mock.calls.map((c) => c[1]);
    expect(args.map((x) => [x.p_action, x.p_max, x.p_window_seconds])).toEqual([
      ["reset:email", 3, 3600],
      ["reset:ip", 10, 3600],
      ["signup:ip", 5, 3600],
      ["reauth:user", 5, 900],
    ]);
    expect(AUTH_LIMITS.signinIp.max).toBe(30);
  });
  it("blocked returns generic message with longest retry", async () => {
    rpc.mockResolvedValueOnce(blocked(100)).mockResolvedValueOnce(blocked(700));
    const r = await limitSignIn("a@b.pl");
    expect(r).toEqual({
      ok: false,
      retryAfterSeconds: 700,
      error: "Zbyt wiele prób. Spróbuj ponownie za 12 min.",
    });
  });
});

describe("fail-open / fail-closed", () => {
  const fail = { data: null, error: { message: "db down" } };
  it("sign-in fails open and logs", async () => {
    rpc.mockResolvedValue(fail);
    await expect(limitSignIn("a@b.pl")).resolves.toEqual({ ok: true });
    expect(console.error).toHaveBeenCalled();
  });
  it("reset and sign-up fail closed", async () => {
    rpc.mockResolvedValue(fail);
    expect((await limitPasswordReset("a@b.pl")).ok).toBe(false);
    expect((await limitSignUp()).ok).toBe(false);
  });
  it("thrown errors and malformed rows are treated as RPC failure", async () => {
    rpc.mockRejectedValue(new Error("boom"));
    expect((await checkAuthAttempt("signup", [{ scope: "ip", value: "1", max: 1, windowSeconds: 1 }], "closed")).ok).toBe(false);
    rpc.mockReset();
    rpc.mockResolvedValue({ data: [], error: null });
    expect((await limitSignUp()).ok).toBe(false);
  });
});
