import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  generateReferralCode,
  normalizeReferralCode,
  parseRecordReferralResult,
  parseSettleReferralResult,
  REFERRAL_CODE_ALPHABET,
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  REFERRAL_MONTHLY_REWARD_CAP,
  REFERRAL_REWARD_TAKE_UNITS,
  referralCodeToStore,
  referralCookieOptions,
  referralLink,
  summarizeReferrals,
} from "@/lib/referrals/referral-policy";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261122180000_referrals.sql"), "utf8");

describe("referral code", () => {
  it("is 8 base32 symbols and maps every byte value without bias", () => {
    expect(REFERRAL_CODE_ALPHABET).toHaveLength(32);
    const code = generateReferralCode((n) => randomBytes(n));
    expect(code).toMatch(/^[A-Z2-7]{8}$/);
    expect(generateReferralCode(() => new Uint8Array([0, 1, 25, 26, 31, 32, 255, 224]))).toBe("ABZ27A7A");
    expect(() => generateReferralCode(() => new Uint8Array(3))).toThrow();
  });
  it("normalizes untrusted input and rejects anything else", () => {
    expect(normalizeReferralCode(" abcd2345 ")).toBe("ABCD2345");
    for (const bad of [null, undefined, 42, "", "ABCD234", "ABCD23456", "ABCD2349", "ABCD-234", "ABCD2340", "<script>"]) {
      expect(normalizeReferralCode(bad)).toBeNull();
    }
  });
  it("builds the share link on the canonical origin", () => {
    expect(referralLink("https://www.bitrymdym.pl/", "ABCD2345")).toBe("https://www.bitrymdym.pl/?ref=ABCD2345");
  });
});

describe("referral cookie", () => {
  it("is httpOnly, Lax, site-wide, 30 days", () => {
    expect(REFERRAL_COOKIE).toBe("brd_ref");
    expect(referralCookieOptions(true)).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS });
    expect(REFERRAL_COOKIE_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
    expect(referralCookieOptions(false, 0).maxAge).toBe(0);
  });
  it("middleware stores a valid ?ref= on page GETs only", () => {
    const base = { method: "GET", pathname: "/", refParam: "abcd2345", currentCookie: null };
    expect(referralCodeToStore(base)).toBe("ABCD2345");
    expect(referralCodeToStore({ ...base, currentCookie: "ZZZZ2222" })).toBe("ABCD2345");
    expect(referralCodeToStore({ ...base, currentCookie: "ABCD2345" })).toBeNull();
    expect(referralCodeToStore({ ...base, refParam: "nope" })).toBeNull();
    expect(referralCodeToStore({ ...base, refParam: null })).toBeNull();
    expect(referralCodeToStore({ ...base, method: "POST" })).toBeNull();
    expect(referralCodeToStore({ ...base, pathname: "/api/takes/finalize" })).toBeNull();
  });
});

describe("RPC results", () => {
  it("parses a reward and every waiting state; unknown shapes are errors", () => {
    expect(parseSettleReferralResult({ result: "rewarded", referral_id: "r1", referrer_id: "u1", units: 10 })).toEqual({
      result: "rewarded",
      referralId: "r1",
      referrerId: "u1",
      units: 10,
    });
    for (const r of ["none", "expired", "not_confirmed", "no_take", "capped", "conflict"]) {
      expect(parseSettleReferralResult({ result: r })).toEqual({ result: r });
    }
    expect(parseSettleReferralResult({ result: "rewarded", referral_id: "r1" })).toEqual({ result: "error" });
    expect(parseSettleReferralResult({ result: "rewarded", referral_id: "r1", referrer_id: "u1", units: -1 })).toEqual({ result: "error" });
    expect(parseSettleReferralResult(null)).toEqual({ result: "error" });
    expect(parseSettleReferralResult({ result: "hacked" })).toEqual({ result: "error" });
  });
  it("parses record_referral", () => {
    for (const r of ["recorded", "already", "unknown_code", "self", "unknown_user", "too_old"]) expect(parseRecordReferralResult(r)).toBe(r);
    expect(parseRecordReferralResult("x")).toBe("error");
    expect(parseRecordReferralResult(null)).toBe("error");
  });
  it("counts invited and rewarded, skipping revoked", () => {
    expect(summarizeReferrals([])).toEqual({ invited: 0, rewarded: 0 });
    expect(summarizeReferrals([{ status: "pending" }, { status: "rewarded" }, { status: "rewarded" }, { status: "revoked" }])).toEqual({ invited: 3, rewarded: 2 });
  });
});

describe("referrals migration (authoritative rules)", () => {
  it("tables: RLS, own rows only, writes service_role only", () => {
    expect(sql).toMatch(/create table public\.referral_codes/);
    expect(sql).toMatch(/create table public\.referrals/);
    expect(sql).toMatch(/alter table public\.referrals enable row level security/);
    expect(sql).toMatch(/alter table public\.referral_codes enable row level security/);
    expect(sql).toMatch(/using \(referrer_id = \(select auth\.uid\(\)\)\)/);
    expect(sql).toMatch(/revoke all on public\.referrals from anon, authenticated/);
    expect(sql).toMatch(/grant select on public\.referrals to authenticated/);
    expect(sql).not.toMatch(/grant (insert|update|delete)[^;]* to authenticated/i);
    expect(sql).toMatch(/constraint referrals_referred_key unique \(referred_id\)/);
    expect(sql).toMatch(/check \(referrer_id <> referred_id\)/);
    expect(sql).toMatch(/check \(code ~ '\^\[A-Z2-7\]\{8\}\$'\)/);
  });
  it("every function is SECURITY DEFINER, pinned search_path, service_role only", () => {
    for (const fn of ["ensure_referral_code(uuid, text)", "record_referral(uuid, text)", "settle_referral_reward(uuid)"]) {
      expect(sql).toContain(`revoke all on function public.${fn} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${fn} to service_role;`);
    }
    expect(sql.match(/security definer\s+set search_path = public/g)).toHaveLength(3);
    expect(sql.match(/auth\.role\(\) is distinct from 'service_role'/g)).toHaveLength(3);
  });
  it("record: no self-referral, only accounts newer than the code and the 7-day window", () => {
    expect(sql).toMatch(/if v_referrer = p_referred_id then\s+return 'self'/);
    expect(sql).toMatch(/v_user_created < v_code_created or v_user_created < now\(\) - interval '7 days'/);
    expect(sql).toMatch(/on conflict \(referred_id\) do nothing/);
  });
  it("reward: confirmed e-mails, READY take, monthly cap, both packs via the pack balance", () => {
    expect(sql).toContain(`v_units constant integer := ${REFERRAL_REWARD_TAKE_UNITS};`);
    expect(sql).toContain(`v_monthly_cap constant integer := ${REFERRAL_MONTHLY_REWARD_CAP};`);
    expect(sql).toMatch(/email_confirmed_at is not null/);
    expect(sql).toMatch(/t\.status = 'READY'/);
    expect(sql).toMatch(/v_rewarded_this_month >= v_monthly_cap/);
    expect(sql).toMatch(/at time zone 'Europe\/Warsaw'/);
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    expect(sql.match(/insert into public\.studio_quota_credits \(user_id, kind, remaining\)\s+values \(v_ref\.(referrer|referred)_id, 'take', v_units\)/g)).toHaveLength(2);
    // Idempotent: only a pending row is paid, locked first; it becomes 'rewarded' in the same block.
    expect(sql).toMatch(/for update;\s+if not found or v_ref\.status is distinct from 'pending'/);
    expect(sql.indexOf("set status = 'rewarded'")).toBeGreaterThan(sql.lastIndexOf("insert into public.studio_quota_credits"));
  });
});
