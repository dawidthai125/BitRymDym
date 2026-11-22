/**
 * Referral program — pure rules (client-safe, no I/O).
 * "Zaproś znajomego": a new account opened from your link that confirms its e-mail and
 * finishes a first recording gives both accounts a take pack (10 units).
 * The database is authoritative (supabase/migrations/20261122180000_referrals.sql:
 * ensure_referral_code, record_referral, settle_referral_reward); the numbers here mirror it
 * for copy and tests.
 */

/** RFC 4648 base32 — no 0/1/8/9, so the code is easy to read out loud. */
export const REFERRAL_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const REFERRAL_CODE_LENGTH = 8;
const REFERRAL_CODE_RE = /^[A-Z2-7]{8}$/;

/** Units added to each account (studio_quota_credits kind 'take'). Fixed in SQL too. */
export const REFERRAL_REWARD_TAKE_UNITS = 10;
/** Max rewarded referrals per referrer per calendar month (Europe/Warsaw). Fixed in SQL too. */
export const REFERRAL_MONTHLY_REWARD_CAP = 10;

/** Query param on any page (`/?ref=KOD`) and the short path `/r/KOD`. */
export const REFERRAL_QUERY_PARAM = "ref";
export const REFERRAL_SHORT_PATH_PREFIX = "/r/";
/** Visitor cookie with the code, read at sign-up. */
export const REFERRAL_COOKIE = "brd_ref";
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
/** user_metadata key with the code (like signup_next): survives the confirmation mail. */
export const REFERRAL_METADATA_KEY = "referral_code";

/** One code from random bytes (8 bytes → 8 symbols, 5 bits each). */
export function generateReferralCode(randomBytes: (size: number) => Uint8Array): string {
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  if (bytes.length < REFERRAL_CODE_LENGTH) throw new Error("Not enough random bytes.");
  let out = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
    out += REFERRAL_CODE_ALPHABET[bytes[i]! & 31];
  }
  return out;
}

/** Untrusted input (query, cookie, metadata) → canonical code, or null. */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return REFERRAL_CODE_RE.test(code) ? code : null;
}

/** Share link: `https://www.bitrymdym.pl/?ref=KOD`. */
export function referralLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/?${REFERRAL_QUERY_PARAM}=${encodeURIComponent(code)}`;
}

export function referralCookieOptions(secure: boolean, maxAge = REFERRAL_COOKIE_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/**
 * Middleware decision: which code (if any) to store for this request.
 * Only page GETs (not API calls); a valid `?ref=` wins over an older cookie.
 */
export function referralCodeToStore(input: {
  method: string;
  pathname: string;
  refParam: string | null;
  currentCookie: string | null | undefined;
}): string | null {
  if (input.method !== "GET" || input.pathname.startsWith("/api/")) return null;
  const code = normalizeReferralCode(input.refParam);
  if (!code || code === input.currentCookie) return null;
  return code;
}

export type SettleReferralResult =
  | { result: "rewarded"; referralId: string; referrerId: string; units: number }
  | { result: "none" | "expired" | "not_confirmed" | "no_take" | "capped" | "conflict" | "error" };

const WAITING_RESULTS = new Set(["none", "expired", "not_confirmed", "no_take", "capped", "conflict"]);

/** Parse settle_referral_reward jsonb (unknown shape → "error"). */
export function parseSettleReferralResult(data: unknown): SettleReferralResult {
  const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const result = typeof row.result === "string" ? row.result : "";
  if (result === "rewarded") {
    const referralId = typeof row.referral_id === "string" ? row.referral_id : "";
    const referrerId = typeof row.referrer_id === "string" ? row.referrer_id : "";
    const units = Number(row.units);
    if (!referralId || !referrerId || !Number.isSafeInteger(units) || units <= 0) return { result: "error" };
    return { result: "rewarded", referralId, referrerId, units };
  }
  if (WAITING_RESULTS.has(result)) return { result } as SettleReferralResult;
  return { result: "error" };
}

export type RecordReferralResult = "recorded" | "already" | "unknown_code" | "self" | "unknown_user" | "too_old" | "error";
const RECORD_RESULTS = new Set<RecordReferralResult>(["recorded", "already", "unknown_code", "self", "unknown_user", "too_old"]);

export function parseRecordReferralResult(data: unknown): RecordReferralResult {
  return typeof data === "string" && RECORD_RESULTS.has(data as RecordReferralResult)
    ? (data as RecordReferralResult)
    : "error";
}

/** Counter on /account: invited (recorded) and rewarded referrals. */
export function summarizeReferrals(rows: ReadonlyArray<{ status: string }>): { invited: number; rewarded: number } {
  let rewarded = 0;
  let invited = 0;
  for (const r of rows) {
    if (r.status === "revoked") continue;
    invited += 1;
    if (r.status === "rewarded") rewarded += 1;
  }
  return { invited, rewarded };
}
