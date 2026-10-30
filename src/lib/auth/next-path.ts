/**
 * Return-URL helpers for sign-in redirects (`/sign-in?next=/studio/p/…`).
 * Only same-origin absolute paths are accepted — never `//host`, `/\host`,
 * schemes or control characters (open-redirect guard).
 */

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
