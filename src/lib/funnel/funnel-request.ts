/**
 * Pure validation for POST /api/funnel and the view-recording bot check. No database access.
 * Only anonymous counters: no user id, IP or user agent is ever stored.
 */

export const FUNNEL_BODY_MAX_BYTES = 256;
export const FUNNEL_PRODUCTS = ["plan", "addon", "pack", "beat", "take", "master", "youtube"] as const;
export const FUNNEL_TIERS = ["BRONZE", "SILVER", "GOLD"] as const;

export type FunnelProduct = (typeof FUNNEL_PRODUCTS)[number];
export type FunnelTier = (typeof FUNNEL_TIERS)[number];
export type FunnelClick = { event: "buy_click"; product: FunnelProduct; tier: FunnelTier | null };

const BOT_UA =
  /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|monitor|curl|wget|python|httpclient|axios|node-fetch|go-http|java\/|facebookexternalhit|embedly|vercel-screenshot|smoke|bitrymdym-/i;

/** True for empty or obviously automated user agents. */
export function isLikelyBot(userAgent: string | null | undefined): boolean {
  const ua = userAgent?.trim() ?? "";
  if (!ua) return true;
  return BOT_UA.test(ua);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** Strict body parse: only {event:'buy_click', product, tier?}. Anything else is null. */
export function parseFunnelBody(raw: string): FunnelClick | null {
  if (!raw || raw.length > FUNNEL_BODY_MAX_BYTES) return null;
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== "event" && key !== "product" && key !== "tier") return null;
  }
  if (record.event !== "buy_click") return null;
  const product = oneOf(record.product, FUNNEL_PRODUCTS);
  if (!product) return null;
  if (record.tier === undefined || record.tier === null) {
    return { event: "buy_click", product, tier: null };
  }
  const tier = oneOf(record.tier, FUNNEL_TIERS);
  if (!tier || product !== "plan") return null;
  return { event: "buy_click", product, tier };
}

/**
 * Small fixed-window limiter kept in memory (per server instance). The key is only held
 * in memory for the window and never stored.
 */
export function createFunnelRateLimiter(limit: number, windowMs: number, maxKeys = 5000) {
  const hits = new Map<string, { start: number; count: number }>();
  return function allow(key: string, now: number = Date.now()): boolean {
    const entry = hits.get(key);
    if (!entry || now - entry.start >= windowMs) {
      if (hits.size >= maxKeys) hits.clear();
      hits.set(key, { start: now, count: 1 });
      return true;
    }
    if (entry.count >= limit) return false;
    entry.count += 1;
    return true;
  };
}
