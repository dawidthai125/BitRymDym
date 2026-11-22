/**
 * Return-URL helpers for sign-in redirects (`/sign-in?next=/studio/p/…`).
 * Only same-origin absolute paths are accepted — never `//host`, `/\host`,
 * schemes or control characters (open-redirect guard).
 */

import {
  accountClaimRedirectPath,
  type AnonAccountClaimResult,
} from "@/lib/takes/anon-account-claim-ux";

export const SIGN_IN_NEXT_PARAM = "next";

export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value.startsWith("/") || value.length > 512) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\\]/.test(value)) return null;
  if (value.startsWith("/sign-in") || value.startsWith("/sign-up")) return null;
  return value;
}

export function signUpPathWithNext(next: string | null | undefined): string {
  const safe = safeNextPath(next);
  return safe
    ? `/sign-up?${SIGN_IN_NEXT_PARAM}=${encodeURIComponent(safe)}`
    : "/sign-up";
}

export function signInPathWithNext(next: string): string {
  const safe = safeNextPath(next);
  return safe
    ? `/sign-in?${SIGN_IN_NEXT_PARAM}=${encodeURIComponent(safe)}`
    : "/sign-in";
}

/**
 * Where a just-authenticated user goes (sign-in, sign-up with session, confirmed sign-up):
 * a claimed guest take wins (its banner lives on /account), else the safe `next`, else `fallback`.
 */
export function postAuthRedirectPath(
  claim: AnonAccountClaimResult | null,
  /** Untrusted (form field / query / metadata) — validated here. */
  next: unknown,
  fallback: string,
): string {
  if (claim && claim.ux !== "none") return accountClaimRedirectPath(claim);
  return safeNextPath(next) ?? fallback;
}

/** Same path with only the listed query keys kept (guest → sign-in `next` keeps e.g. ?beatId=). */
export function pathWithKeptQuery(
  pathname: string,
  params: Record<string, string | string[] | undefined> | null | undefined,
  keep: readonly string[],
): string {
  const query = new URLSearchParams();
  for (const key of keep) {
    const raw = params?.[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === "string" && value.length > 0) query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
