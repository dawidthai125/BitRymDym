/**
 * Sign-up return path end to end (unit): form `next` → signUp (emailRedirectTo + metadata)
 * → confirmation link → /auth/callback keeps the session → redirect to `next` (else /studio).
 * Open-redirect guard: every `next` source goes through safeNextPath.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.fn();
const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();
const signOut = vi.fn();
const getCurrentProfile = vi.fn();
const tryClaimAnonTakeAfterAuth = vi.fn();
const readSiteMaintenanceForViewer = vi.fn();
const sendWelcomeOnce = vi.fn();
const afterTasks: Array<() => unknown> = [];
const cookieSet = vi.fn();

vi.mock("next/headers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/headers")>()),
  cookies: async () => ({ set: cookieSet, get: () => undefined, getAll: () => [] }),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    afterTasks.push(task);
  },
}));

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
    auth: { signUp, verifyOtp, exchangeCodeForSession, getUser, signOut },
  }),
}));

vi.mock("@/lib/auth/attempt-limit", () => ({
  limitSignUp: async () => ({ ok: true }),
  limitPasswordReset: async () => ({ ok: true }),
  limitSignIn: async () => ({ ok: true }),
  limitReauth: async () => ({ ok: true }),
}));

vi.mock("@/lib/creator-progress/award-hooks", () => ({
  hookProfileCompleted: async () => undefined,
}));

vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  getCurrentProfile: () => getCurrentProfile(),
}));

vi.mock("@/lib/takes/anon-account-claim", () => ({
  tryClaimAnonTakeAfterAuth: (...args: unknown[]) => tryClaimAnonTakeAfterAuth(...args),
}));

vi.mock("@/lib/site/maintenance-settings", () => ({
  readSiteMaintenanceForViewer: (...args: unknown[]) => readSiteMaintenanceForViewer(...args),
}));

vi.mock("@/lib/email/notify/server", () => ({
  sendWelcomeOnce: (...args: unknown[]) => sendWelcomeOnce(...args),
}));

import { GET } from "@/app/auth/callback/route";
import { signUpAction } from "@/lib/auth/actions";
import { SIGNUP_BROWSER_COOKIE, SIGNUP_NEXT_METADATA_KEY } from "@/lib/auth/confirmation";
import { PASSWORD_RECOVERY_COOKIE } from "@/lib/auth/password-recovery-seal-cookie";

const SITE = "https://www.bitrymdym.pl";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const EVIL_NEXT = ["//evil.com", "https://evil.com", "/\\evil.com", "/\\/evil.com", "evil.com"];
const env = {
  site: process.env.NEXT_PUBLIC_SITE_URL,
  key: process.env.PASSWORD_RESET_SEAL_SECRET,
};

function signUpForm(next?: string): FormData {
  const data = new FormData();
  data.set("email", "probe@example.invalid");
  data.set("displayName", "ProbeUi");
  data.set("password", "fake-password-A");
  data.set("confirmPassword", "fake-password-A");
  data.set("acceptTerms", "on");
  if (next !== undefined) data.set("next", next);
  return data;
}

function confirmedUser(metadata: Record<string, unknown> = {}) {
  return {
    data: {
      user: { id: USER_ID, email_confirmed_at: "2026-11-22T10:00:00Z", user_metadata: metadata },
    },
    error: null,
  };
}

/** Default: the browser that signed up (binding cookie = verified user id). */
async function callback(query: string, browserCookie: string | null = USER_ID) {
  const headers = browserCookie ? { cookie: `${SIGNUP_BROWSER_COOKIE}=${browserCookie}` } : undefined;
  const response = await GET(new NextRequest(`${SITE}/auth/callback?${query}`, { headers }));
  const location = new URL(response.headers.get("location")!);
  return { response, location, path: `${location.pathname}${location.search}${location.hash}` };
}

/** What the Confirm signup mail links to (TokenHash template, SiteURL origin) + redirect query when present. */
function confirmationQueryFrom(emailRedirectTo: string): string {
  const fromRedirect = new URL(emailRedirectTo).searchParams;
  fromRedirect.set("token_hash", "signup-hash");
  fromRedirect.set("type", "signup");
  return fromRedirect.toString();
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = SITE;
  afterTasks.length = 0;
  for (const fn of [
    signUp,
    verifyOtp,
    exchangeCodeForSession,
    getUser,
    signOut,
    getCurrentProfile,
    tryClaimAnonTakeAfterAuth,
    readSiteMaintenanceForViewer,
    sendWelcomeOnce,
    cookieSet,
  ]) {
    fn.mockReset();
  }
  signUp.mockResolvedValue({
    data: { user: { id: USER_ID, identities: [{ id: "i1" }] }, session: null },
    error: null,
  });
  verifyOtp.mockResolvedValue({
    data: { session: { access_token: "fixture" }, user: { id: USER_ID } },
    error: null,
  });
  getUser.mockResolvedValue(confirmedUser());
  signOut.mockResolvedValue({ error: null });
  getCurrentProfile.mockResolvedValue({ user: { id: USER_ID } });
  tryClaimAnonTakeAfterAuth.mockResolvedValue({ ux: "none" });
  readSiteMaintenanceForViewer.mockResolvedValue({ enabled: false, viewerIsAdmin: false });
  sendWelcomeOnce.mockResolvedValue(undefined);
});

afterEach(() => {
  if (env.site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = env.site;
  if (env.key === undefined) delete process.env.PASSWORD_RESET_SEAL_SECRET;
  else process.env.PASSWORD_RESET_SEAL_SECRET = env.key;
});

describe("sign-up → mail → callback → redirect keeps `next`", () => {
  it("carries next in emailRedirectTo and metadata, then lands there signed in", async () => {
    const next = "/studio?beatId=b-123";
    const result = await signUpAction({ error: null, success: false, message: null }, signUpForm(next));
    expect(result.success).toBe(true);

    const options = signUp.mock.calls[0]?.[0]?.options;
    expect(options.emailRedirectTo).toBe(
      `${SITE}/auth/callback?next=${encodeURIComponent(next)}`,
    );
    expect(options.data[SIGNUP_NEXT_METADATA_KEY]).toBe(next);
    // This browser is bound to the pending account (HttpOnly, callback-scoped).
    expect(cookieSet).toHaveBeenCalledWith(
      SIGNUP_BROWSER_COOKIE,
      USER_ID,
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/auth/callback" }),
    );

    // Link built from RedirectTo (query next survives).
    const viaQuery = await callback(confirmationQueryFrom(options.emailRedirectTo));
    expect(viaQuery.location.origin).toBe(SITE);
    expect(viaQuery.path).toBe(next);
    expect(signOut).not.toHaveBeenCalled();
    expect(viaQuery.response.cookies.get(SIGNUP_BROWSER_COOKIE)?.value).toBe("");
    expect(verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: "signup-hash" });
  });

  it("uses the metadata next when the TokenHash mail links bare SiteURL/auth/callback", async () => {
    getUser.mockResolvedValue(confirmedUser({ [SIGNUP_NEXT_METADATA_KEY]: "/premium#pakiety" }));
    const { path } = await callback("token_hash=signup-hash&type=signup");
    expect(path).toBe("/premium#pakiety");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("prefers the query next over metadata and supports type=email + PKCE", async () => {
    getUser.mockResolvedValue(confirmedUser({ [SIGNUP_NEXT_METADATA_KEY]: "/beats" }));
    expect((await callback("token_hash=h&type=email&next=%2Fbeat%2Fb-1")).path).toBe("/beat/b-1");

    exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "fixture" }, user: { id: USER_ID } },
      error: null,
    });
    expect((await callback("code=pkce-code&next=%2Fbeat%2Fb-2")).path).toBe("/beat/b-2");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("without next goes to /studio (Pierwsze kroki) and keeps the welcome mail", async () => {
    const { path } = await callback("token_hash=signup-hash&type=signup");
    expect(path).toBe("/studio");
    expect(afterTasks).toHaveLength(1);
    await afterTasks[0]!();
    expect(sendWelcomeOnce).toHaveBeenCalledWith(USER_ID);
  });

  it("a claimed guest take still wins over next", async () => {
    tryClaimAnonTakeAfterAuth.mockResolvedValue({ ux: "ok" });
    const { path } = await callback("token_hash=h&type=signup&next=%2Fbeats");
    expect(path).toBe("/account?claim=ok");
  });

  it("maintenance (non-admin): signs out and shows confirmed page carrying next", async () => {
    readSiteMaintenanceForViewer.mockResolvedValue({ enabled: true, viewerIsAdmin: false });
    const { path } = await callback("token_hash=h&type=signup&next=%2Fbeats");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(path).toBe("/auth/confirmed?status=success&next=%2Fbeats");
  });

  it("failed confirmation keeps next for the confirmed page links", async () => {
    verifyOtp.mockResolvedValue({ data: { session: null, user: null }, error: { message: "otp_expired" } });
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { path } = await callback("token_hash=h&type=signup&next=%2Fbeats");
    expect(path).toBe("/auth/confirmed?status=invalid&next=%2Fbeats");
  });

  it("the same link opened twice: a browser signed in a moment ago goes on, nothing is signed out", async () => {
    verifyOtp.mockResolvedValue({ data: { session: null, user: null }, error: { message: "One-time token not found" } });
    const user = { id: USER_ID, email_confirmed_at: new Date().toISOString(), user_metadata: {} };
    getUser.mockResolvedValue({ data: { user }, error: null });
    expect((await callback("token_hash=h&type=signup&next=%2Fbeats")).path).toBe("/beats");
    expect((await callback("token_hash=h&type=signup")).path).toBe("/studio");
    for (const bad of EVIL_NEXT) {
      expect((await callback(`token_hash=h&type=signup&next=${encodeURIComponent(bad)}`)).path).toBe("/studio");
    }
    expect(signOut).not.toHaveBeenCalled();
    expect(sendWelcomeOnce).not.toHaveBeenCalled();
  });

  it("an old account opening a dead link still sees that the link failed", async () => {
    verifyOtp.mockResolvedValue({ data: { session: null, user: null }, error: { message: "One-time token not found" } });
    const { path } = await callback("token_hash=h&type=signup");
    expect(path).toBe("/auth/confirmed?status=invalid");
  });
});

describe("login-CSRF guard: session kept only in the signing-up browser", () => {
  it("someone else's link (no / foreign binding cookie) ends signed out, no claim", async () => {
    for (const cookie of [null, "22222222-2222-4222-8222-222222222222"]) {
      signOut.mockClear();
      tryClaimAnonTakeAfterAuth.mockClear();
      const { path } = await callback("token_hash=h&type=signup&next=%2Fbeats", cookie);
      expect(signOut).toHaveBeenCalledTimes(1);
      expect(tryClaimAnonTakeAfterAuth).not.toHaveBeenCalled();
      expect(path).toBe("/auth/confirmed?status=success&next=%2Fbeats");
    }
  });

  it("type=email (e.g. a magic-link token) is bound the same way", async () => {
    const { path } = await callback("token_hash=h&type=email", null);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(path).toBe("/auth/confirmed?status=success");
  });
});

describe("malicious next is rejected at every hop", () => {
  it("sign-up drops it from emailRedirectTo and metadata", async () => {
    for (const bad of EVIL_NEXT) {
      signUp.mockClear();
      await signUpAction({ error: null, success: false, message: null }, signUpForm(bad));
      const options = signUp.mock.calls[0]?.[0]?.options;
      expect(options.emailRedirectTo).toBe(`${SITE}/auth/callback`);
      expect(options.data).not.toHaveProperty(SIGNUP_NEXT_METADATA_KEY);
    }
  });

  it("callback ignores it in the query and in metadata → /studio on our origin", async () => {
    for (const bad of EVIL_NEXT) {
      getUser.mockResolvedValue(confirmedUser({ [SIGNUP_NEXT_METADATA_KEY]: bad }));
      const { location, path } = await callback(
        `token_hash=h&type=signup&next=${encodeURIComponent(bad)}`,
      );
      expect(location.origin).toBe(SITE);
      expect(path).toBe("/studio");
    }
  });

  it("confirmed-page fallback never echoes it", async () => {
    for (const bad of EVIL_NEXT) {
      const { path } = await callback(`type=signup&next=${encodeURIComponent(bad)}`);
      expect(path).toBe("/auth/confirmed?status=error");
    }
  });
});

describe("password reset is unchanged", () => {
  it("OTP recovery keeps the session, sets the seal and ignores next", async () => {
    process.env.PASSWORD_RESET_SEAL_SECRET = "fixture-recovery-test-key";
    const { response, path } = await callback(
      `token_hash=rec-hash&type=recovery&next=${encodeURIComponent("//evil.com")}`,
    );
    expect(path).toBe("/auth/reset-password");
    expect(response.cookies.get(PASSWORD_RECOVERY_COOKIE)?.value).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();
    expect(getCurrentProfile).not.toHaveBeenCalled();
    expect(afterTasks).toHaveLength(0);
  });

  it("PKCE recovery (flow=recovery) still routes to /auth/reset-password", async () => {
    process.env.PASSWORD_RESET_SEAL_SECRET = "fixture-recovery-test-key";
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "fixture" }, user: { id: USER_ID } },
      error: null,
    });
    const { path } = await callback("code=rec-code&flow=recovery&next=%2Fbeats");
    expect(path).toBe("/auth/reset-password");
    expect(signOut).not.toHaveBeenCalled();
  });
});
