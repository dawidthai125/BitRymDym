import "server-only";

import { randomBytes } from "node:crypto";

import { sendNotification, type NotifyResult } from "@/lib/email/notify/server";
import {
  generateReferralCode,
  normalizeReferralCode,
  parseRecordReferralResult,
  parseSettleReferralResult,
  referralLink,
  summarizeReferrals,
  type RecordReferralResult,
  type SettleReferralResult,
} from "@/lib/referrals/referral-policy";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Referral program I/O (service_role). Every entry point is best-effort: it never throws
 * into sign-up, finalize or the account page. Rules live in SQL (see referral-policy.ts).
 */

const CODE_ATTEMPTS = 5;

/** The account's code, created on first use. Null when the table is missing or the DB fails. */
export async function ensureReferralCode(userId: string): Promise<string | null> {
  try {
    const admin = createSupabaseAdminClient();
    for (let i = 0; i < CODE_ATTEMPTS; i += 1) {
      const candidate = generateReferralCode((n) => randomBytes(n));
      const { data, error } = await admin.rpc("ensure_referral_code", { p_user_id: userId, p_candidate: candidate });
      if (error) return null;
      const code = normalizeReferralCode(data);
      if (code) return code;
    }
    return null;
  } catch {
    return null;
  }
}

/** Store "this new account came from code X". Idempotent; the DB rejects self / old accounts. */
export async function recordReferral(referredId: string, rawCode: unknown): Promise<RecordReferralResult> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return "unknown_code";
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("record_referral", { p_referred_id: referredId, p_code: code });
    if (error) return "error";
    return parseRecordReferralResult(data);
  } catch {
    return "error";
  }
}

/** One-shot mail to the referrer: claims referrals.referrer_notified_at, then sends. */
async function notifyReferrerOnce(referralId: string, referrerId: string): Promise<NotifyResult> {
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("referrals")
      .update({ referrer_notified_at: new Date().toISOString() })
      .eq("id", referralId)
      .eq("status", "rewarded")
      .is("referrer_notified_at", null)
      .select("id");
    if (!data?.length) return "duplicate";
    return await sendNotification({ userId: referrerId, kind: "referral_reward" });
  } catch {
    return "failed";
  }
}

/**
 * Pay the referral of this (referred) account when it is due: confirmed e-mail + first READY take.
 * Called after finalize, after the sign-up confirmation, on /account and from the daily cron.
 */
export async function settleReferralReward(referredId: string): Promise<SettleReferralResult> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("settle_referral_reward", { p_referred_id: referredId });
    if (error) return { result: "error" };
    const settled = parseSettleReferralResult(data);
    if (settled.result === "rewarded") {
      console.info("[referral] rewarded", { units: settled.units });
      await notifyReferrerOnce(settled.referralId, settled.referrerId);
    }
    return settled;
  } catch {
    return { result: "error" };
  }
}

export type ReferralDesk = { code: string; link: string; invited: number; rewarded: number };

/** Data for "Zaproś znajomego" on /account (creates the code lazily). */
export async function loadReferralDesk(userId: string): Promise<ReferralDesk | null> {
  const code = await ensureReferralCode(userId);
  if (!code) return null;
  let counts = { invited: 0, rewarded: 0 };
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.from("referrals").select("status").eq("referrer_id", userId).limit(1000);
    counts = summarizeReferrals((data ?? []) as { status: string }[]);
  } catch {
    // Counter stays at zero; the link still works.
  }
  return { code, link: referralLink(getSiteUrl(), code), ...counts };
}

export type ReferralSweepResult = { candidates: number; results: Partial<Record<SettleReferralResult["result"], number>> };
const SWEEP_LIMIT = 200;

/** Daily cron: retry pending referrals from the last 90 days (anon take claims, capped months, missed hooks). */
export async function runReferralRewardSweep(now = Date.now()): Promise<ReferralSweepResult> {
  const admin = createSupabaseAdminClient();
  const since = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("referrals")
    .select("referred_id")
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(SWEEP_LIMIT);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { referred_id: string }[];
  const results: ReferralSweepResult["results"] = {};
  for (const row of rows) {
    const r = await settleReferralReward(row.referred_id);
    results[r.result] = (results[r.result] ?? 0) + 1;
  }
  return { candidates: rows.length, results };
}
