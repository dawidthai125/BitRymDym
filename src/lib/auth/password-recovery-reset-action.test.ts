import { beforeEach, describe, expect, it, vi } from "vitest";

const readSeal = vi.fn();
const clearSeal = vi.fn();
const getUser = vi.fn();
const updateUser = vi.fn();
const signOut = vi.fn();

vi.mock("@/lib/supabase/env", () => ({
  getSupabasePublicEnv: () => ({
    isConfigured: true,
    url: "http://127.0.0.1",
    anonKey: "unit-test-anon",
  }),
  getSupabaseServiceRoleKey: () => undefined,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser, updateUser, signOut },
  }),
}));

vi.mock("@/lib/auth/password-recovery-seal-cookie", () => ({
  passwordRecoverySealMatches: (...args: unknown[]) => readSeal(...args),
  clearPasswordRecoverySeal: () => clearSeal(),
}));

import { updatePasswordAfterResetAction } from "@/lib/auth/actions";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const previous = { error: null, success: false };

function form(): FormData {
  const data = new FormData();
  data.set("newPassword", "longenough");
  data.set("confirmPassword", "longenough");
  return data;
}

beforeEach(() => {
  readSeal.mockReset();
  clearSeal.mockReset();
  getUser.mockReset();
  updateUser.mockReset();
  signOut.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: USER_A } }, error: null });
  readSeal.mockResolvedValue(true);
  updateUser.mockResolvedValue({ error: null });
  clearSeal.mockResolvedValue(undefined);
  signOut.mockResolvedValue({ error: null });
});

describe("updatePasswordAfterResetAction", () => {
  it("does not update the password when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "missing" } });
    const result = await updatePasswordAfterResetAction(previous, form());
    expect(result.success).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
    expect(clearSeal).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("does not update the password for an ordinary session without a seal", async () => {
    readSeal.mockResolvedValue(false);
    const result = await updatePasswordAfterResetAction(previous, form());
    expect(result.success).toBe(false);
    expect(readSeal).toHaveBeenCalledWith(USER_A);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("does not update the password when the seal belongs to someone else", async () => {
    readSeal.mockImplementation(async (userId: string) => userId === USER_B);
    const result = await updatePasswordAfterResetAction(previous, form());
    expect(result.success).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("updates the password, clears the seal, then signs out", async () => {
    const order: string[] = [];
    updateUser.mockImplementation(async () => {
      order.push("update");
      return { error: null };
    });
    clearSeal.mockImplementation(async () => {
      order.push("clear");
    });
    signOut.mockImplementation(async () => {
      order.push("signOut");
    });

    const result = await updatePasswordAfterResetAction(previous, form());
    expect(result).toMatchObject({
      success: true,
      message: "Hasło zostało ustawione. Możesz się zalogować.",
    });
    expect(order).toEqual(["update", "clear", "signOut"]);
    expect(updateUser).toHaveBeenCalledWith({ password: "longenough" });
  });

  it("keeps the seal and does not sign out when the password update fails", async () => {
    updateUser.mockResolvedValue({ error: { message: "weak" } });
    const result = await updatePasswordAfterResetAction(previous, form());
    expect(result.success).toBe(false);
    expect(clearSeal).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("does not report success when clearing the seal throws", async () => {
    clearSeal.mockRejectedValue(new Error("cookie write failed"));
    const result = await updatePasswordAfterResetAction(previous, form());
    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "Nie udało się dokończyć ustawiania hasła. Poproś o nowy link.",
    );
    expect(updateUser).toHaveBeenCalled();
    expect(signOut).toHaveBeenCalled();
  });

  it("still reports success when sign-out fails after the seal was cleared", async () => {
    const order: string[] = [];
    clearSeal.mockImplementation(async () => {
      order.push("clear");
    });
    signOut.mockImplementation(async () => {
      order.push("signOut");
      throw new Error("sign-out failed");
    });
    const result = await updatePasswordAfterResetAction(previous, form());
    expect(result.success).toBe(true);
    expect(order).toEqual(["clear", "signOut"]);
  });
});
