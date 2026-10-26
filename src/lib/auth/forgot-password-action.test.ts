import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseServerClient = vi.fn();
const resetPasswordForEmail = vi.fn();

const RESET_REDIRECT =
  "http://127.0.0.1:3000/auth/callback?flow=recovery";

vi.mock("@/lib/supabase/env", () => ({
  getSupabasePublicEnv: () => ({
    isConfigured: true,
    url: "http://127.0.0.1",
    anonKey: "unit-test-anon",
  }),
  getSupabaseServiceRoleKey: () => undefined,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: (...args: unknown[]) =>
    createSupabaseServerClient(...args),
}));

vi.mock("@/lib/site-url", () => ({
  getAuthPasswordResetRedirectTo: () => RESET_REDIRECT,
}));

import { requestPasswordResetAction } from "@/lib/auth/actions";

const GENERIC =
  "Jeśli konto z tym adresem istnieje, wysłaliśmy link do resetu hasła.";
const previous = { error: null, success: false, message: null };

function form(email = "probe@example.invalid"): FormData {
  const data = new FormData();
  data.set("email", email);
  return data;
}

beforeEach(() => {
  createSupabaseServerClient.mockReset();
  resetPasswordForEmail.mockReset();
  createSupabaseServerClient.mockResolvedValue({
    auth: { resetPasswordForEmail },
  });
});

describe("requestPasswordResetAction anti-enumeration", () => {
  it("rejects empty email before creating a Supabase client", async () => {
    const result = await requestPasswordResetAction(previous, form(""));

    expect(result).toEqual({
      error: "Podaj adres e-mail.",
      success: false,
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("returns the generic success message when resetPasswordForEmail succeeds", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    const result = await requestPasswordResetAction(previous, form());

    expect(result).toEqual({
      error: null,
      success: true,
      message: GENERIC,
    });
    expect(resetPasswordForEmail).toHaveBeenCalledWith("probe@example.invalid", {
      redirectTo: RESET_REDIRECT,
    });
  });

  it("returns the same generic success when the provider reports a nonexistent account", async () => {
    resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: { message: "User not found", status: 404 },
    });

    const result = await requestPasswordResetAction(previous, form());

    expect(result).toEqual({
      error: null,
      success: true,
      message: GENERIC,
    });
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  it("makes success and nonexistent-account provider outcomes indistinguishable to the client", async () => {
    resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    const ok = await requestPasswordResetAction(previous, form());

    resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: { message: "User not found", status: 404 },
    });
    const missing = await requestPasswordResetAction(previous, form());

    expect(ok).toEqual(missing);
    expect(ok).toEqual({
      error: null,
      success: true,
      message: GENERIC,
    });
  });
});
