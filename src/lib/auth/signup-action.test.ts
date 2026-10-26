import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseServerClient = vi.fn();
const signUp = vi.fn();
const hookProfileCompleted = vi.fn();

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
  getAuthEmailRedirectTo: () => "http://127.0.0.1:3000/auth/callback",
}));

vi.mock("@/lib/creator-progress/award-hooks", () => ({
  hookProfileCompleted: (...args: unknown[]) => hookProfileCompleted(...args),
}));

import { SIGNUP_PENDING_NEUTRAL_MESSAGE } from "@/lib/auth/signup-result";
import { signUpAction } from "@/lib/auth/actions";

const previous = { error: null, success: false, message: null };

function validForm(email = "probe@example.invalid"): FormData {
  const data = new FormData();
  data.set("email", email);
  data.set("displayName", "ProbeUi");
  data.set("password", "fake-password-A");
  data.set("confirmPassword", "fake-password-A");
  return data;
}

beforeEach(() => {
  createSupabaseServerClient.mockReset();
  signUp.mockReset();
  hookProfileCompleted.mockReset();
  createSupabaseServerClient.mockResolvedValue({
    auth: { signUp },
  });
  hookProfileCompleted.mockResolvedValue(undefined);
});

describe("signUpAction password mismatch", () => {
  it("returns the contract mismatch error before creating a Supabase client or calling signUp", async () => {
    const form = validForm();
    form.set("confirmPassword", "fake-password-B");
    const result = await signUpAction(previous, form);

    expect(result).toEqual({
      error: "Hasła nie są takie same.",
      success: false,
      message: null,
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(signUp).not.toHaveBeenCalled();
  });
});

describe("signUpAction anti-enumeration", () => {
  it("returns neutral pending for a fresh email without session", async () => {
    signUp.mockResolvedValue({
      data: {
        user: { id: "11111111-1111-4111-8111-111111111111", identities: [{ provider: "email" }] },
        session: null,
      },
      error: null,
    });

    const result = await signUpAction(previous, validForm());

    expect(result).toEqual({
      error: null,
      success: true,
      message: SIGNUP_PENDING_NEUTRAL_MESSAGE,
    });
    expect(signUp).toHaveBeenCalledTimes(1);
  });

  it("returns the same pending state for obfuscated duplicate identities", async () => {
    signUp.mockResolvedValue({
      data: {
        user: { id: "22222222-2222-4222-8222-222222222222", identities: [] },
        session: null,
      },
      error: null,
    });

    const result = await signUpAction(previous, validForm());

    expect(result).toEqual({
      error: null,
      success: true,
      message: SIGNUP_PENDING_NEUTRAL_MESSAGE,
    });
  });

  it("returns the same pending state when provider reports already registered", async () => {
    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "User already registered" },
    });

    const result = await signUpAction(previous, validForm());

    expect(result).toEqual({
      error: null,
      success: true,
      message: SIGNUP_PENDING_NEUTRAL_MESSAGE,
    });
    expect(result.error).toBeNull();
    expect(String(result.message).toLowerCase()).not.toMatch(
      /already registered|email zajęty/,
    );
  });

  it("keeps generic provider signup failures as client errors", async () => {
    signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Signup failed" },
    });

    const result = await signUpAction(previous, validForm());

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(String(result.error).toLowerCase()).not.toContain("signup failed");
  });

  it("fresh pending, obfuscated duplicate, and hard already-registered are indistinguishable", async () => {
    signUp.mockResolvedValueOnce({
      data: {
        user: { id: "a", identities: [{ provider: "email" }] },
        session: null,
      },
      error: null,
    });
    const fresh = await signUpAction(previous, validForm());

    signUp.mockResolvedValueOnce({
      data: { user: { id: "b", identities: [] }, session: null },
      error: null,
    });
    const obfuscated = await signUpAction(previous, validForm());

    signUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "User already registered" },
    });
    const hardTaken = await signUpAction(previous, validForm());

    expect(fresh).toEqual(obfuscated);
    expect(fresh).toEqual(hardTaken);
    expect(fresh).toEqual({
      error: null,
      success: true,
      message: SIGNUP_PENDING_NEUTRAL_MESSAGE,
    });
  });
});
