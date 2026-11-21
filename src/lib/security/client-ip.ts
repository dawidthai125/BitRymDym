/**
 * Canonical client IP from request headers (security review 2026-11-21, L3).
 * Used by every IP-based limit / log: auth attempt limits, Turnstile remoteip,
 * listen-link hit limits, payment customer IP.
 *
 * Order:
 * 1. `x-vercel-forwarded-for` — set by the Vercel edge, cannot be supplied by the client;
 * 2. `x-real-ip` — also platform-set on Vercel;
 * 3. first hop of `x-forwarded-for` — last resort only (on Vercel the edge overwrites it
 *    with the client IP; off-Vercel, e.g. local dev, it may be client-supplied).
 *
 * Values must look like an IPv4/IPv6 literal (hex digits, dots, colons, max 64 chars).
 */
type HeaderSource = Pick<Headers, "get">;

const IP_HEADERS = ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"] as const;

export function isPlausibleIp(value: string): boolean {
  return value.length > 0 && value.length <= 64 && /^[0-9a-fA-F:.]+$/.test(value);
}

/** Client IP or null when no header carries a plausible address. */
export function clientIpOrNull(h: HeaderSource): string | null {
  for (const name of IP_HEADERS) {
    const first = h.get(name)?.split(",")[0]?.trim() ?? "";
    if (first) return isPlausibleIp(first) ? first : null;
  }
  return null;
}

/** Client IP, or the literal "unknown" (one shared bucket) when none is available. */
export function clientIpFromHeaders(h: HeaderSource): string {
  return clientIpOrNull(h) ?? "unknown";
}
