/**
 * Canonical application origin for Auth redirects and absolute links.
 *
 * Production MUST use BitRymDym domain — never a *.vercel.app deployment URL.
 * Preview may use VERCEL_URL; local uses localhost.
 */

const CANONICAL_PRODUCTION_ORIGIN = "https://bitrymdym.pl";

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
    return stripTrailingSlash(withProtocol);
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

/** Vercel serves the site on www and answers the apex with a 308 (project domain config). */
const SERVED_PRODUCTION_ORIGIN = "https://www.bitrymdym.pl";

/**
 * Origin the site is actually served from — for sitemap, robots, canonical metadata, share links
 * and payment provider callbacks (PayU notify/continue), which must not land on a 308 redirect.
 * Auth redirects keep getSiteUrl() (they must match the Supabase allow-list).
 */
export function getPublicSiteUrl(): string {
  const base = getSiteUrl();
  return base === CANONICAL_PRODUCTION_ORIGIN ? SERVED_PRODUCTION_ORIGIN : base;
}
