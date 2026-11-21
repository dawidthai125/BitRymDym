import "server-only";

import { createHash, createHmac } from "node:crypto";

import { headers } from "next/headers";

import { clientIpFromHeaders } from "@/lib/security/client-ip";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServiceRoleKey } from "@/lib/supabase/env";

export type AuthAttemptAction = "signin" | "reset" | "signup" | "reauth";

export type AttemptLimit = {
  scope: "email" | "ip" | "user";
  /** Raw (unhashed) value; hashed inside before it leaves the process. */
  value: string;
  max: number;
  windowSeconds: number;
};

/** Thresholds requested by the security review. */
export const AUTH_LIMITS = {
  signinEmail: { max: 8, windowSeconds: 15 * 60 },
  signinIp: { max: 30, windowSeconds: 15 * 60 },
  resetEmail: { max: 3, windowSeconds: 60 * 60 },
  resetIp: { max: 10, windowSeconds: 60 * 60 },
  signupIp: { max: 5, windowSeconds: 60 * 60 },
  reauthUser: { max: 5, windowSeconds: 15 * 60 },
} as const;

export type AttemptCheckResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number; error: string };

export function normalizeEmailForLimit(email: string): string {
  return String(email ?? "").normalize("NFKC").trim().toLowerCase();
}

export function tooManyAttemptsMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Zbyt wiele prób. Spróbuj ponownie za ${minutes} min.`;
}

/**
 * Key hash: HMAC-SHA-256 keyed with the service role key (same practice as
 * email-change-notice); plain prefixed SHA-256 when the key is unavailable.
 */
export function hashAttemptKey(scope: string, value: string): string {
  const data = `auth-attempt:${scope}:${value}`;
  const secret = getSupabaseServiceRoleKey();
  if (secret) return createHmac("sha256", secret).update(data).digest("hex");
  return createHash("sha256").update(data).digest("hex");
}

/** Canonical helper lives in `@/lib/security/client-ip`; re-exported for existing callers. */
export { clientIpFromHeaders };

export async function getClientIp(): Promise<string> {
  try {
    return clientIpFromHeaders(await headers());
  } catch {
    return "unknown";
  }
}

type RpcRow = { status?: string; retry_after_seconds?: number };

async function callRpc(limit: AttemptLimit, action: AuthAttemptAction) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("auth_attempt_check", {
    p_action: `${action}:${limit.scope}`,
    p_key_hash: hashAttemptKey(limit.scope, limit.value),
    p_max: limit.max,
    p_window_seconds: limit.windowSeconds,
    p_record: true,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as RpcRow | null;
  if (!row || (row.status !== "ok" && row.status !== "blocked")) {
    throw new Error("unexpected auth_attempt_check result");
  }
  return row;
}

/**
 * Records one attempt per limit and reports whether any threshold is exceeded.
 * failMode: "open" lets the request through when the RPC fails (logged),
 * "closed" blocks it with a generic message.
 */
export async function checkAuthAttempt(
  action: AuthAttemptAction,
  limits: AttemptLimit[],
  failMode: "open" | "closed",
): Promise<AttemptCheckResult> {
  let worst = 0;
  for (const limit of limits) {
    try {
      const row = await callRpc(limit, action);
      if (row.status === "blocked") {
        worst = Math.max(worst, Number(row.retry_after_seconds ?? 60));
      }
    } catch (error) {
      console.error(
        `[auth-attempt-limit] ${action}:${limit.scope} RPC failed (fail-${failMode})`,
        error instanceof Error ? error.message : "unknown",
      );
      if (failMode === "closed") {
        return {
          ok: false,
          retryAfterSeconds: 60,
          error: tooManyAttemptsMessage(60),
        };
      }
    }
  }
  if (worst > 0) {
    return {
      ok: false,
      retryAfterSeconds: worst,
      error: tooManyAttemptsMessage(worst),
    };
  }
  return { ok: true };
}

export async function limitSignIn(email: string): Promise<AttemptCheckResult> {
  const ip = await getClientIp();
  return checkAuthAttempt(
    "signin",
    [
      { scope: "email", value: normalizeEmailForLimit(email), ...AUTH_LIMITS.signinEmail },
      { scope: "ip", value: ip, ...AUTH_LIMITS.signinIp },
    ],
    "open",
  );
}

export async function limitPasswordReset(email: string): Promise<AttemptCheckResult> {
  const ip = await getClientIp();
  return checkAuthAttempt(
    "reset",
    [
      { scope: "email", value: normalizeEmailForLimit(email), ...AUTH_LIMITS.resetEmail },
      { scope: "ip", value: ip, ...AUTH_LIMITS.resetIp },
    ],
    "closed",
  );
}

export async function limitSignUp(): Promise<AttemptCheckResult> {
  const ip = await getClientIp();
  return checkAuthAttempt(
    "signup",
    [{ scope: "ip", value: ip, ...AUTH_LIMITS.signupIp }],
    "closed",
  );
}

/** Password change re-auth: per user id. Fail-open like sign-in (user is already authenticated). */
export async function limitReauth(userId: string): Promise<AttemptCheckResult> {
  return checkAuthAttempt(
    "reauth",
    [{ scope: "user", value: userId, ...AUTH_LIMITS.reauthUser }],
    "open",
  );
}
