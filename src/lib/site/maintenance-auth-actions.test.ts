/** Maintenance mode: only ADMIN accounts may sign in; sign-up is paused. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseServerClient = vi.fn();
const signInWithPassword = vi.fn();
const signOut = vi.fn();
const signUp = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/supabase/env", () => ({
  getSupabasePublicEnv: () => ({ isConfigured: true, url: "http://127.0.0.1", anonKey: "unit-test-anon" }),
  getSupabaseServiceRoleKey: () => undefined,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: (...args: unknown[]) => createSupabaseServerClient(...args),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/session")>()),
  getCurrentProfile: vi.fn().mockResolvedValue(null),
}));

import { signInAction, signUpAction } from "@/lib/auth/actions";
import { MAINTENANCE_SIGN_IN_ERROR, MAINTENANCE_SIGN_UP_ERROR } from "@/lib/site/maintenance-gate";

const prev = { error: null, success: false, message: null };
function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeEach(() => {
  for (const m of [createSupabaseServerClient, signInWithPassword, signOut, signUp, rpc]) m.mockReset();
  createSupabaseServerClient.mockResolvedValue({ auth: { signInWithPassword, signOut, signUp }, rpc });
  signInWithPassword.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
  signOut.mockResolvedValue({ error: null });
});

describe("signInAction during maintenance", () => {
  it("non-admin: signs the fresh session out and shows a clear message", async () => {
    rpc.mockResolvedValue({ data: { enabled: true, viewerIsAdmin: false }, error: null });
    const res = await signInAction(prev, form({ email: "a@b.c", password: "pw-123456" }));
    expect(res).toEqual({ error: MAINTENANCE_SIGN_IN_ERROR, success: false });
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("admin: proceeds to the normal redirect", async () => {
    rpc.mockResolvedValue({ data: { enabled: true, viewerIsAdmin: true }, error: null });
    await expect(
      signInAction(prev, form({ email: "a@b.c", password: "pw-123456", next: "/admin" })),
    ).rejects.toThrow("REDIRECT:/admin");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("site up: non-admin signs in as before", async () => {
    rpc.mockResolvedValue({ data: { enabled: false, viewerIsAdmin: false }, error: null });
    await expect(signInAction(prev, form({ email: "a@b.c", password: "pw-123456" }))).rejects.toThrow(
      "REDIRECT:/account",
    );
    expect(signOut).not.toHaveBeenCalled();
  });

  it("flag unreadable → fail open (sign-in allowed)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    await expect(signInAction(prev, form({ email: "a@b.c", password: "pw-123456" }))).rejects.toThrow(
      "REDIRECT:",
    );
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe("signUpAction during maintenance", () => {
  it("is refused before any account is created", async () => {
    rpc.mockResolvedValue({ data: { enabled: true, viewerIsAdmin: false }, error: null });
    const res = await signUpAction(
      prev,
      form({ email: "n@b.c", password: "Haslo-123456!", confirmPassword: "Haslo-123456!", displayName: "nowy", acceptTerms: "on" }),
    );
    expect(res).toMatchObject({ error: MAINTENANCE_SIGN_UP_ERROR, success: false });
    expect(signUp).not.toHaveBeenCalled();
  });
});
