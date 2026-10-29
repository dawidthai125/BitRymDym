import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
const callbackGetUser = vi.fn();
const callbackSignOut = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      verifyOtp,
      exchangeCodeForSession: vi.fn(),
      getUser: callbackGetUser,
      signOut: callbackSignOut,
    },
  }),
}));

import {
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_PURPOSE,
  PASSWORD_RECOVERY_TTL_SECONDS,
  openPasswordRecovery,
  openPasswordRecoveryForSecret,
  passwordRecoveryCookieOptions,
  passwordRecoveryUserMatches,
  sealPasswordRecovery,
  sealPasswordRecoveryForSecret,
  signPasswordRecoveryBody,
} from "@/lib/auth/password-recovery-seal";

const NOW = 1_700_000_000_000;
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const SECRET = "hmac-secret-not-in-cookie";

function sign(body: string): string {
  return signPasswordRecoveryBody(SECRET, body);
}

describe("password recovery seal", () => {
  it("round-trips a seal for the server user id", () => {
    const sealed = sealPasswordRecoveryForSecret(USER_A, SECRET, NOW);
    expect(sealed).toBeTruthy();
    const opened = openPasswordRecoveryForSecret(sealed!, SECRET, NOW);
    expect(opened).toEqual({ userId: USER_A });
    expect(passwordRecoveryUserMatches(opened, USER_A)).toBe(true);
  });

  it("rejects a forged signature, a different signer, and a tampered body", () => {
    const sealed = sealPasswordRecovery(USER_A, NOW, sign);
    expect(sealed).toBeTruthy();
    const [body] = [sealed!.slice(0, sealed!.lastIndexOf("."))];
    expect(openPasswordRecovery(`${body}.forged`, NOW, sign)).toBeNull();
    expect(
      openPasswordRecovery(sealed!, NOW, (value) =>
        createHmac("sha256", "other-secret").update(value).digest("base64url"),
      ),
    ).toBeNull();
    expect(openPasswordRecovery(sealed!.replace(USER_A, USER_B), NOW, sign)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(openPasswordRecovery("", NOW, sign)).toBeNull();
    expect(openPasswordRecovery("recovery", NOW, sign)).toBeNull();
    expect(openPasswordRecovery("recovery.only-one", NOW, sign)).toBeNull();
    expect(openPasswordRecovery(`recovery.${USER_A}.not-a-time.sig`, NOW, sign)).toBeNull();
  });

  it("rejects a different purpose even when the signature matches that body", () => {
    const exp = Math.floor(NOW / 1000) + PASSWORD_RECOVERY_TTL_SECONDS;
    const body = `notice.${USER_A}.${exp}`;
    const token = `${body}.${sign(body)}`;
    expect(openPasswordRecovery(token, NOW, sign)).toBeNull();
    expect(PASSWORD_RECOVERY_PURPOSE).toBe("recovery");
  });

  it("rejects an expired seal at the exact expiry instant and after it", () => {
    const sealed = sealPasswordRecovery(USER_A, NOW, sign)!;
    const exp = Number(sealed.split(".").at(-2));
    expect(openPasswordRecovery(sealed, exp * 1000, sign)).toBeNull();
    expect(openPasswordRecovery(sealed, NOW + 600_000, sign)).toBeNull();
    expect(openPasswordRecovery(sealed, NOW + 599_000, sign)?.userId).toBe(USER_A);
  });

  it("does not issue or accept a seal without a server secret", () => {
    expect(sealPasswordRecoveryForSecret(USER_A, null, NOW)).toBeNull();
    expect(sealPasswordRecoveryForSecret(USER_A, undefined, NOW)).toBeNull();
    expect(sealPasswordRecoveryForSecret(USER_A, "", NOW)).toBeNull();
    const sealed = sealPasswordRecoveryForSecret(USER_A, SECRET, NOW)!;
    expect(openPasswordRecoveryForSecret(sealed, null, NOW)).toBeNull();
    expect(openPasswordRecoveryForSecret(sealed, undefined, NOW)).toBeNull();
    expect(openPasswordRecoveryForSecret(sealed, "", NOW)).toBeNull();
  });

  it("does not treat another user's seal as a match", () => {
    const opened = openPasswordRecovery(sealPasswordRecovery(USER_A, NOW, sign)!, NOW, sign);
    expect(passwordRecoveryUserMatches(opened, USER_B)).toBe(false);
    expect(passwordRecoveryUserMatches(null, USER_A)).toBe(false);
  });

  it("opens a real seal for user A and refuses it for user B", () => {
    const sealed = sealPasswordRecoveryForSecret(USER_A, SECRET, NOW);
    const opened = openPasswordRecoveryForSecret(sealed!, SECRET, NOW);
    expect(passwordRecoveryUserMatches(opened, USER_A)).toBe(true);
    expect(passwordRecoveryUserMatches(opened, USER_B)).toBe(false);
  });

  it("keeps secrets, passwords, and auth tokens out of the cookie value", () => {
    const sealed = sealPasswordRecoveryForSecret(USER_A, SECRET, NOW)!;
    expect(sealed).not.toContain(SECRET);
    expect(sealed).not.toMatch(/access_token|refresh_token|password|eyJ|service_role/i);
    expect(sealed.startsWith(`${PASSWORD_RECOVERY_PURPOSE}.${USER_A}.`)).toBe(true);
  });

  it("uses the approved cookie attributes and a 600 second lifetime", () => {
    expect(PASSWORD_RECOVERY_COOKIE).toBe("brd_password_recovery");
    expect(PASSWORD_RECOVERY_TTL_SECONDS).toBe(600);
    expect(passwordRecoveryCookieOptions(true, 600)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    expect(passwordRecoveryCookieOptions(false, 0)).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  });
});

describe("failed recovery callback", () => {
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  afterEach(() => {
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  });

  it("does not set the recovery cookie when the recovery exchange fails", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-recovery-test-key";
    verifyOtp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "otp_expired" },
    });
    callbackGetUser.mockResolvedValue({
      data: { user: { id: USER_A } },
      error: null,
    });
    callbackSignOut.mockResolvedValue({ error: null });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new NextRequest(
        "http://127.0.0.1:3000/auth/callback?token_hash=rec-hash&type=recovery",
      ),
    );

    expect(new URL(response.headers.get("location")!).pathname).toBe("/forgot-password");
    expect(response.cookies.get(PASSWORD_RECOVERY_COOKIE)).toBeUndefined();
    expect(callbackSignOut).not.toHaveBeenCalled();
    expect(callbackGetUser).not.toHaveBeenCalled();
  });
});
