import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseServerClient = vi.fn();
const signUp = vi.fn();

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

import { signUpAction } from "@/lib/auth/actions";

const previous = { error: null, success: false, message: null };

function mismatchForm(): FormData {
  const data = new FormData();
  data.set("email", "probe@example.invalid");
  data.set("displayName", "ProbeUi");
  data.set("password", "fake-password-A");
  data.set("confirmPassword", "fake-password-B");
  return data;
}

beforeEach(() => {
  createSupabaseServerClient.mockReset();
  signUp.mockReset();
  createSupabaseServerClient.mockResolvedValue({
    auth: { signUp },
  });
  signUp.mockResolvedValue({ data: { user: null, session: null }, error: null });
});

describe("signUpAction password mismatch", () => {
  it("returns the contract mismatch error before creating a Supabase client or calling signUp", async () => {
    const result = await signUpAction(previous, mismatchForm());

    expect(result).toEqual({
      error: "Hasła nie są takie same.",
      success: false,
      message: null,
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(signUp).not.toHaveBeenCalled();
  });
});
