import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseServerClient = vi.fn();
const signInWithPassword = vi.fn();

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

import { signInAction } from "@/lib/auth/actions";
import { SIGNIN_NEUTRAL_CREDENTIALS_MESSAGE } from "@/lib/ui/user-errors";

const previous = { error: null, success: false, message: null };

function form(
  email = "probe@example.invalid",
  password = "fake-password-A",
): FormData {
  const data = new FormData();
  data.set("email", email);
  data.set("password", password);
  return data;
}

beforeEach(() => {
  createSupabaseServerClient.mockReset();
  signInWithPassword.mockReset();
  createSupabaseServerClient.mockResolvedValue({
    auth: { signInWithPassword },
  });
});

describe("signInAction anti-enumeration", () => {
  it("rejects empty credentials before creating a Supabase client", async () => {
    const result = await signInAction(previous, form("", ""));

    expect(result).toEqual({
      error: "E-mail i hasło są wymagane.",
      success: false,
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns neutral credentials error for Invalid login credentials", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    const result = await signInAction(previous, form());

    expect(result).toEqual({
      error: SIGNIN_NEUTRAL_CREDENTIALS_MESSAGE,
      success: false,
    });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "probe@example.invalid",
      password: "fake-password-A",
    });
  });

  it("returns the same neutral error for Email not confirmed", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Email not confirmed" },
    });

    const result = await signInAction(previous, form());

    expect(result).toEqual({
      error: SIGNIN_NEUTRAL_CREDENTIALS_MESSAGE,
      success: false,
    });
    expect(String(result.error).toLowerCase()).not.toMatch(
      /potwierdź|confirm|not confirmed/,
    );
  });

  it("returns the same neutral error for User not found", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "User not found" },
    });

    const result = await signInAction(previous, form());

    expect(result).toEqual({
      error: SIGNIN_NEUTRAL_CREDENTIALS_MESSAGE,
      success: false,
    });
  });

  it("unknown, wrong-password, and unconfirmed are indistinguishable to the client", async () => {
    signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "User not found" },
    });
    const unknown = await signInAction(previous, form());

    signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });
    const wrongPassword = await signInAction(previous, form());

    signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "Email not confirmed" },
    });
    const unconfirmed = await signInAction(previous, form());

    expect(unknown).toEqual(wrongPassword);
    expect(unknown).toEqual(unconfirmed);
    expect(unknown).toEqual({
      error: SIGNIN_NEUTRAL_CREDENTIALS_MESSAGE,
      success: false,
    });
  });

  it("keeps rate-limit as a distinct safe client error", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Request rate limit exceeded" },
    });

    const result = await signInAction(previous, form());

    expect(result.success).toBe(false);
    expect(result.error).not.toBe(SIGNIN_NEUTRAL_CREDENTIALS_MESSAGE);
    expect(String(result.error).toLowerCase()).toMatch(/limit|spróbuj|później/);
  });

  it("does not call a real Auth network — only the mocked signInWithPassword", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    await signInAction(previous, form());

    expect(createSupabaseServerClient).toHaveBeenCalledTimes(1);
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    // Mocked client only — no live Supabase Auth in this suite.
  });
});
