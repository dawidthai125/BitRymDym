/**
 * GO-PREMIUM-28 — Auth helpers for Premium Retention cron endpoint.
 * Fail-closed when CRON_SECRET is missing; timing-safe Bearer compare.
 * Reuses the same CRON_SECRET family as takes-janitor (no new prod secrets).
 */

import { timingSafeEqual } from "node:crypto";

export type PremiumRetentionCronAuthFailure = {
  ok: false;
  status: 401 | 503;
  error: string;
};

export type PremiumRetentionCronAuthSuccess = { ok: true };

export type PremiumRetentionCronAuthResult =
  | PremiumRetentionCronAuthSuccess
  | PremiumRetentionCronAuthFailure;

/** Active cleanup requires Owner-configured kill-switch (D25-05). */
export const PREMIUM_RETENTION_CLEANUP_ACTIVE_ENV =
  "PREMIUM_RETENTION_CLEANUP_ACTIVE";

export function isPremiumRetentionCleanupActiveEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[PREMIUM_RETENTION_CLEANUP_ACTIVE_ENV] === "1";
}

/**
 * Resolve batch mode. Client cannot force active without env kill-switch.
 * Default is dry-run (no Storage/DB mutations).
 */
export function resolvePremiumRetentionCronMode(params: {
  requestUrl: string;
  env?: NodeJS.ProcessEnv;
}): "dry-run" | "active" {
  const env = params.env ?? process.env;
  const url = new URL(params.requestUrl);
  const requested = (url.searchParams.get("mode") || "").toLowerCase();
  const wantsActive =
    requested === "active" || url.searchParams.get("dryRun") === "0";
  if (wantsActive && isPremiumRetentionCleanupActiveEnabled(env)) {
    return "active";
  }
  return "dry-run";
}

function bearerToken(headerValue: string | null): string | null {
  if (!headerValue || !headerValue.startsWith("Bearer ")) return null;
  return headerValue.slice("Bearer ".length);
}

/**
 * Authorize cron request. Missing CRON_SECRET → 503; bad/missing Bearer → 401.
 */
export function authorizePremiumRetentionCron(params: {
  authorizationHeader: string | null;
  env?: NodeJS.ProcessEnv;
}): PremiumRetentionCronAuthResult {
  const env = params.env ?? process.env;
  const secret = env.CRON_SECRET;
  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: "CRON_SECRET is not configured.",
    };
  }

  const provided = bearerToken(params.authorizationHeader);
  if (provided == null) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: "Unauthorized." };
  }

  return { ok: true };
}
