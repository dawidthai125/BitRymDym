/**
 * Content-Security-Policy builder (nonce-based, per request).
 *
 * Production runs enforcing (CSP_ENFORCE=1 on Vercel); without the variable the header is
 * Report-Only. Edge-runtime safe (no node imports).
 */

export const CSP_ENFORCE_HEADER = "Content-Security-Policy";
export const CSP_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";
export const NONCE_HEADER = "x-nonce";

export type CspEnv = Partial<Record<string, string | undefined>>;

export type BuildCspOptions = {
  nonce: string;
  /** Defaults to process.env. */
  env?: CspEnv;
};

/** Fresh unguessable nonce (base64 of a random UUID), one per request. */
export function generateNonce(): string {
  return btoa(crypto.randomUUID());
}

export function isCspEnforced(env: CspEnv = process.env): boolean {
  return env.CSP_ENFORCE === "1";
}

export function cspHeaderName(env: CspEnv = process.env): string {
  return isCspEnforced(env) ? CSP_ENFORCE_HEADER : CSP_REPORT_ONLY_HEADER;
}

function originOf(value: string | undefined): string {
  try {
    return new URL(value ?? "").origin;
  } catch {
    return "";
  }
}

export function buildCsp({ nonce, env = process.env }: BuildCspOptions): string {
  const isDev = env.NODE_ENV === "development";
  // Vercel toolbar / comments only on non-production deployments.
  const allowVercelLive = env.VERCEL_ENV !== "production";
  // Optional Cloudflare Turnstile (only when a site key is configured).
  const turnstile = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? "https://challenges.cloudflare.com" : "";

  const supabaseOrigin = originOf(env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseWs = supabaseOrigin.replace(/^https:/, "wss:");
  const live = allowVercelLive ? "https://vercel.live" : "";

  const list = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(" ");

  const directives = [
    "default-src 'self'",
    list(
      "script-src 'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // Host sources are ignored by CSP3 browsers under 'strict-dynamic'; kept as fallback.
      "https://va.vercel-scripts.com",
      live,
      turnstile,
      isDev && "'unsafe-eval'",
    ),
    "style-src 'self' 'unsafe-inline'",
    list("img-src 'self' data: blob:", supabaseOrigin, "https://vercel.com", live),
    "font-src 'self' data:",
    list("media-src 'self' blob: mediastream: data:", supabaseOrigin, "https://edge.bitrymdym.pl"),
    list(
      "connect-src 'self'",
      supabaseOrigin,
      supabaseWs,
      "https://edge.bitrymdym.pl",
      live,
      "wss://ws-us3.pusher.com",
      "https://vitals.vercel-insights.com",
      turnstile,
    ),
    "worker-src 'self' blob:",
    list("frame-src", live, turnstile) === "frame-src" ? "frame-src 'none'" : list("frame-src", live, turnstile),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];

  return directives.join("; ").replace(/\s+/g, " ");
}
