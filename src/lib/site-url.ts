/**
 * Canonical application origin for Auth redirects and absolute links.
 *
 * Production MUST use BitRymDym domain — never a *.vercel.app deployment URL.
 * Preview may use VERCEL_URL; local uses localhost.
 */

/** Vercel serves www; the apex answers 308 (project domains). Supabase allow-list has https://www.bitrymdym.pl/**. */
const CANONICAL_PRODUCTION_ORIGIN = "https://www.bitrymdym.pl";
const APEX_PRODUCTION_ORIGIN = "https://bitrymdym.pl";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Resolve the public site origin for the current runtime environment.
 * Safe for Server Actions / server modules (reads process.env only).
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    const withProtocol = explicit.startsWith("http")
      ? explicit
      : `https://${explicit}`;
    const origin = stripTrailingSlash(withProtocol);
    // NEXT_PUBLIC_SITE_URL may still name the apex: never hand out a URL that answers 308.
    return origin === APEX_PRODUCTION_ORIGIN ? CANONICAL_PRODUCTION_ORIGIN : origin;
  }

  // Production on Vercel: never fall back to NEXT_PUBLIC_VERCEL_URL / VERCEL_URL
  // (those are deployment URLs and must not be Auth canonical).
  if (process.env.VERCEL_ENV === "production") {
    return CANONICAL_PRODUCTION_ORIGIN;
  }

  const vercelUrl =
    process.env.NEXT_PUBLIC_VERCEL_URL?.trim() ||
    process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    const withProtocol = vercelUrl.startsWith("http")
      ? vercelUrl
      : `https://${vercelUrl}`;
    return stripTrailingSlash(withProtocol);
  }

  return "http://localhost:3000";
}

/**
 * Absolute URL for Auth emailRedirectTo (must be on Supabase allow-list).
 * Lands on the PKCE/OTP callback, which then routes to /auth/confirmed.
 */
export function getAuthEmailRedirectTo(): string {
  return `${getSiteUrl()}/auth/callback`;
}

/**
 * Absolute URL for password-reset redirectTo (must be on Supabase allow-list).
 * Includes flow=recovery so PKCE ?code= landings keep session → /auth/reset-password.
 * Also allow-list this exact URL in Supabase Auth redirect URLs.
 */
export function getAuthPasswordResetRedirectTo(): string {
  return `${getSiteUrl()}/auth/callback?flow=recovery`;
}

/**
 * PKCE landing for Auth email change. OTP templates still use token_hash +
 * type=email_change. Must stay on the Supabase redirect allow-list.
 */
export function getAuthEmailChangeRedirectTo(): string {
  return `${getSiteUrl()}/auth/callback?flow=email_change`;
}

export const SITE_URL_CANONICAL_PRODUCTION = CANONICAL_PRODUCTION_ORIGIN;

/**
 * Public origin for sitemap, robots, metadata, share links and payment callbacks.
 * Same as getSiteUrl() now that both resolve to www (kept as the named entry point for those callers).
 */
export function getPublicSiteUrl(): string {
  return getSiteUrl();
}
