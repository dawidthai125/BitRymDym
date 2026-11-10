import "server-only";

import { findWorkPrizeWinner } from "@/lib/catalog/catalog-service";
import {
  previousHalfYear,
  prizeConsent,
  resumeOpen,
  wholeDays,
  type PrizeConsent,
} from "@/lib/catalog/catalog-prize";
import type { PlanSnapshot } from "@/lib/payments/entitlement-grant";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isPremiumTier } from "@/types/premium";
import type { PremiumTier } from "@/types/premium";

const TABLE = "work_half_prizes";
type Admin = ReturnType<typeof createSupabaseAdminClient>;
type DbError = { message?: string; code?: string } | null;

export type PrizeCode = "ok" | "already" | "missing" | "wait" | "perpetual" | "conflict" | "off" | "invalid";

export type WorkPrizeDesk = {
  enabled: boolean;
  offer: { halfKey: string; place: number } | null;
  consent: PrizeConsent;
  hold: { tier: "BRONZE" | "SILVER"; days: number } | null;
  resumeReady: boolean;
};

type PrizeRow = {
  id: string;
  half_key: string;
  place: number;
  status: string;
  paused_tier: string | null;
  paused_ms: number | null;
  paused_used_at: string | null;
};

function missingRelation(error: DbError): boolean {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return error.code === "42P01" || error.code === "PGRST205" || message.includes(TABLE);
}

function adminOrNull(): Admin | null {
  try {
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

function asPlan(row: {
  tier: string | null;
  active: boolean;
  expires_at: string | null;
  pending_tier: string | null;
  pending_expires_at: string | null;
} | null): PlanSnapshot {
  if (!row) return null;
  const tier: PremiumTier = isPremiumTier(row.tier) ? row.tier : "FREE";
  const pendingTier = row.pending_tier === "BRONZE" || row.pending_tier === "SILVER" || row.pending_tier === "GOLD"
    ? row.pending_tier
    : null;
  return {
    tier,
    active: row.active === true,
    expiresAt: row.expires_at,
    pendingTier,
    pendingExpiresAt: row.pending_expires_at,
  };
}

async function ensureClosedHalf(admin: Admin, now: Date): Promise<void> {
  const half = previousHalfYear(now);
  if (half.end.getTime() > now.getTime()) return;
  const existing = await admin.from(TABLE).select("id").eq("half_key", half.key).maybeSingle();
  if (existing.error) return;
  if (existing.data) return;
  const winner = await findWorkPrizeWinner(half.start, half.end);
  if (!winner) return;
  const inserted = await admin.from(TABLE).insert({
    user_id: winner.ownerId,
    half_key: half.key,
    place: winner.place,
    work_id: winner.workId,
    status: "offered",
  });
  if (inserted.error && inserted.error.code !== "23505") return;
}

function codeOf(value: unknown): PrizeCode {
  if (value === "ok" || value === "already" || value === "missing" || value === "wait" || value === "perpetual" || value === "conflict") {
    return value;
  }
  return "conflict";
}

function rpcOff(error: { code?: string; message?: string }): boolean {
  const message = (error.message ?? "").toLowerCase();
  return error.code === "PGRST202" || message.includes("does not exist") || message.includes("schema cache");
}

export async function loadWorkPrizeDesk(userId: string, now = new Date()): Promise<WorkPrizeDesk> {
  const empty: WorkPrizeDesk = {
    enabled: false,
    offer: null,
    consent: { kind: "free" },
    hold: null,
    resumeReady: false,
  };
  const admin = adminOrNull();
  if (!admin) return empty;
  const probe = await admin.from(TABLE).select("id").limit(1);
  if (missingRelation(probe.error)) return empty;
  if (probe.error) return empty;
  await ensureClosedHalf(admin, now);

  const planRow = await admin
    .from("premium_entitlements")
    .select("tier, active, expires_at, pending_tier, pending_expires_at, source")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (planRow.error) return empty;
  const plan = asPlan(planRow.data as {
    tier: string | null;
    active: boolean;
    expires_at: string | null;
    pending_tier: string | null;
    pending_expires_at: string | null;
  } | null);
  const source = typeof planRow.data?.source === "string" ? planRow.data.source : null;

  const offered = await admin
    .from(TABLE)
    .select("id, half_key, place, status, paused_tier, paused_ms, paused_used_at")
    .eq("user_id", userId)
    .eq("status", "offered")
    .order("half_key", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (offered.error) return empty;
  const offerRow = offered.data as PrizeRow | null;

  const held = await admin
    .from(TABLE)
    .select("id, half_key, place, status, paused_tier, paused_ms, paused_used_at")
    .eq("user_id", userId)
    .is("paused_used_at", null)
    .not("paused_ms", "is", null)
    .order("activated_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (held.error) return empty;
  const holdRow = held.data as PrizeRow | null;
  const holdTier = holdRow?.paused_tier === "BRONZE" || holdRow?.paused_tier === "SILVER" ? holdRow.paused_tier : null;
  const hold = holdTier && holdRow?.paused_ms
    ? { tier: holdTier, days: wholeDays(Number(holdRow.paused_ms)) }
    : null;

  return {
    enabled: true,
    offer: offerRow ? { halfKey: offerRow.half_key, place: offerRow.place } : null,
    consent: prizeConsent(plan, source, now),
    hold,
    resumeReady: Boolean(hold) && resumeOpen(plan, now),
  };
}

export async function activateWorkPrize(userId: string, accept: boolean, now = new Date()): Promise<PrizeCode> {
  if (accept !== true) return "invalid";
  const admin = adminOrNull();
  if (!admin) return "off";
  const desk = await loadWorkPrizeDesk(userId, now);
  if (!desk.enabled) return "off";
  if (!desk.offer) return "missing";
  if (desk.consent.kind === "perpetual") return "perpetual";
  if (desk.consent.kind === "already") return "already";
  const offered = await admin
    .from(TABLE)
    .select("id")
    .eq("user_id", userId)
    .eq("status", "offered")
    .eq("half_key", desk.offer.halfKey)
    .maybeSingle();
  if (offered.error || !offered.data) return "missing";
  const applied = await admin.rpc("claim_work_half_prize", {
    p_prize_id: (offered.data as { id: string }).id,
    p_user_id: userId,
  });
  if (applied.error) return rpcOff(applied.error) ? "off" : "conflict";
  return codeOf(applied.data);
}

export async function resumeWorkPlan(userId: string, accept: boolean, now = new Date()): Promise<PrizeCode> {
  if (accept !== true) return "invalid";
  const admin = adminOrNull();
  if (!admin) return "off";
  const probe = await admin.from(TABLE).select("id").limit(1);
  if (missingRelation(probe.error) || probe.error) return "off";
  const held = await admin
    .from(TABLE)
    .select("id")
    .eq("user_id", userId)
    .is("paused_used_at", null)
    .not("paused_ms", "is", null)
    .order("activated_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (held.error) return "off";
  if (!held.data) return "missing";
  const applied = await admin.rpc("resume_work_plan_hold", {
    p_prize_id: (held.data as { id: string }).id,
    p_user_id: userId,
  });
  if (applied.error) return rpcOff(applied.error) ? "off" : "conflict";
  return codeOf(applied.data);
}
