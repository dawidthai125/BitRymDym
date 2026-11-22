/**
 * "Tryb aplikacji ze sklepu" — pure rules (edge/client safe, no I/O).
 *
 * The Google Play / App Store wrappers open the start URL with `?app=android|ios`.
 * Middleware stores the platform in the `brd_app` cookie and redirects to the same
 * address without the parameter. While the cookie is set the site shows no purchase
 * UI (no prices, no buy buttons, no plan links) and the checkout API refuses
 * (code STORE_APP) — store rules forbid payments and links to payments in the app.
 * `?app=web` clears the cookie (escape hatch for testing on a phone browser).
 */

export const STORE_APP_COOKIE = "brd_app";
export const STORE_APP_QUERY_PARAM = "app";
export const STORE_APP_PLATFORMS = ["android", "ios"] as const;
export const STORE_APP_CLEAR_VALUE = "web";
export const STORE_APP_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
/** Checkout refusal code (API + checkout-service). */
export const STORE_APP_CHECKOUT_CODE = "STORE_APP";

export type StoreAppPlatform = (typeof STORE_APP_PLATFORMS)[number];

/** Untrusted cookie / query value → platform, or null. */
export function parseStoreAppPlatform(raw: unknown): StoreAppPlatform | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  return (STORE_APP_PLATFORMS as readonly string[]).includes(value) ? (value as StoreAppPlatform) : null;
}

/** True when the `brd_app` cookie value marks a store app. */
export function isStoreAppCookieValue(raw: unknown): boolean {
  return parseStoreAppPlatform(raw) !== null;
}

export function storeAppCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: STORE_APP_COOKIE_MAX_AGE_SECONDS,
  };
}

export type StoreAppEntryDecision =
  /** Store the platform cookie and redirect to `redirectTo` (same URL without `?app=`). */
  | { kind: "set"; platform: StoreAppPlatform; redirectTo: URL }
  /** `?app=web`: drop the cookie and redirect without the parameter. */
  | { kind: "clear"; redirectTo: URL };

/**
 * Middleware decision for `?app=`. Only page GET/HEAD requests (never APIs);
 * unknown values are ignored (no redirect, the page renders as usual).
 */
export function decideStoreAppEntry(input: { method: string; url: URL }): StoreAppEntryDecision | null {
  if (input.method !== "GET" && input.method !== "HEAD") return null;
  const { pathname, searchParams } = input.url;
  if (pathname === "/api" || pathname.startsWith("/api/")) return null;
  if (!searchParams.has(STORE_APP_QUERY_PARAM)) return null;
  const raw = searchParams.get(STORE_APP_QUERY_PARAM);
  const platform = parseStoreAppPlatform(raw);
  const clear = raw?.trim().toLowerCase() === STORE_APP_CLEAR_VALUE;
  if (!platform && !clear) return null;
  const redirectTo = new URL(input.url.toString());
  redirectTo.searchParams.delete(STORE_APP_QUERY_PARAM);
  return platform ? { kind: "set", platform, redirectTo } : { kind: "clear", redirectTo };
}
