import { beforeEach, describe, expect, it, vi } from "vitest";

const resend = vi.fn();
const limitResendConfirmation = vi.fn();
const verifyTurnstile = vi.fn();

vi.mock("@/lib/auth/attempt-limit", () => ({
  limitResendConfirmation: (...args: unknown[]) => limitResendConfirmation(...args),
}));
vi.mock("@/lib/auth/turnstile", () => ({ verifyTurnstile: () => verifyTurnstile() }));
vi.mock("@/lib/supabase/env", () => ({
  getSupabasePublicEnv: () => ({ isConfigured: true, url: "http://127.0.0.1", anonKey: "unit-test-anon" }),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { resend } }) }));
vi.mock("@/lib/site-url", () => ({ getAuthEmailRedirectTo: () => "http://127.0.0.1:3000/auth/callback" }));

import { resendConfirmationAction } from "@/lib/auth/resend-confirmation-action";

const previous = { error: null, success: false };
function form(email = "probe@example.invalid") {
  const data = new FormData();
  data.set("email", email);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  verifyTurnstile.mockResolvedValue({ ok: true });
  limitResendConfirmation.mockResolvedValue({ ok: true });
  resend.mockResolvedValue({ error: null });
});

describe("resendConfirmationAction", () => {
  it("asks Supabase for a new sign-up mail", async () => {
    const result = await resendConfirmationAction(previous, form(" probe@example.invalid "));
    expect(result.success).toBe(true);
    expect(resend).toHaveBeenCalledWith({
      type: "signup",
      email: "probe@example.invalid",
      options: { emailRedirectTo: "http://127.0.0.1:3000/auth/callback" },
    });
  });

  it("answers the same when the provider refuses (no account, active account, cooldown)", async () => {
    const ok = await resendConfirmationAction(previous, form());
    vi.spyOn(console, "warn").mockImplementation(() => {});
    resend.mockResolvedValue({ error: { message: "you can only request this after 10 seconds", code: "over_email_send_rate_limit" } });
    expect(await resendConfirmationAction(previous, form())).toEqual(ok);
  });

  it("sends nothing without an address, a passed CAPTCHA or a free limit", async () => {
    expect((await resendConfirmationAction(previous, form(""))).error).toBe("Podaj adres e-mail.");
    verifyTurnstile.mockResolvedValue({ ok: false, error: "captcha" });
    expect((await resendConfirmationAction(previous, form())).error).toBe("captcha");
    verifyTurnstile.mockResolvedValue({ ok: true });
    limitResendConfirmation.mockResolvedValue({ ok: false, error: "limit" });
    expect((await resendConfirmationAction(previous, form())).error).toBe("limit");
    expect(resend).not.toHaveBeenCalled();
  });
});
