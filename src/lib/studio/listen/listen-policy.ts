/**
 * Gaps P1 — private listen links (pure: tokens, plan gates, expiry, rate limits).
 * A link plays the approved master in a simple public player; no download button,
 * expiring, revocable. Only sha256(token) is stored server-side.
 */
import { listenLinksForTier } from "@/config/plan-policy";
import type { PremiumTier } from "@/types/premium";

/** 24 random bytes → 32 url-safe chars. */
export const LISTEN_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
/** Lifetime choices offered in the UI (days), capped by the plan. */
export const LISTEN_DAY_CHOICES = [1, 7, 30] as const;
/** Public audio route: per link and per client IP (sliding window). */
export const LISTEN_RATE = {
  link: { limit: 240, windowSeconds: 3600 },
  ip: { limit: 60, windowSeconds: 600 },
} as const;
/** Signed storage URL lifetime handed to the player (seconds). */
export const LISTEN_SIGNED_URL_SECONDS = 60;

const b64url = (b: Uint8Array) => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/**
 * Token = first 24 bytes of HMAC-SHA256(secret, "listen:" + linkId) → 32 url-safe chars.
 * Deterministic so the owner can copy the link again; only sha256(token) is stored.
 */
export async function listenTokenFor(secret: string, linkId: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`listen:${linkId}`)));
  return b64url(sig.slice(0, 24));
}

export async function hashListenToken(token: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Lifetime options (days) for a plan: the fixed choices up to the plan cap, plus the cap itself. */
export function listenDayOptions(tier: PremiumTier): number[] {
  const max = listenLinksForTier(tier).listenLinkMaxDays;
  const opts: number[] = LISTEN_DAY_CHOICES.filter((d) => d <= max);
  if (!opts.includes(max)) opts.push(max);
  return opts.sort((a, b) => a - b);
}

export type ListenCreateDecision =
  | { allowed: true; days: number }
  | { allowed: false; reason: "limit" | "bad_days" };

export function decideListenCreate(p: { tier: PremiumTier; active: number; days: unknown }): ListenCreateDecision {
  const days = Number(p.days);
  if (!Number.isInteger(days) || !listenDayOptions(p.tier).includes(days)) return { allowed: false, reason: "bad_days" };
  const max = listenLinksForTier(p.tier).listenLinksActive;
  if (max !== null && p.active >= max) return { allowed: false, reason: "limit" };
  return { allowed: true, days };
}

export type ListenLinkState = "active" | "expired" | "revoked";
export function listenLinkState(l: { expiresAt: string; revokedAt: string | null }, now = Date.now()): ListenLinkState {
  if (l.revokedAt) return "revoked";
  return Date.parse(l.expiresAt) > now ? "active" : "expired";
}
