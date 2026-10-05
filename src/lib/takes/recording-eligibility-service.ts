/**
 * P4.1 — server eligibility probe before microphone arm.
 * Reuses getSamplePolicy + resolveProductEntitlement. No second policy system.
 */

import "server-only";

import { AuthError, getCurrentProfile } from "@/lib/auth/session";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { utcDayWindowStart } from "@/lib/downloads/limits";
import {
  getSamplePolicy,
  sampleActorFromPremiumTier,
} from "@/lib/takes/entitlement";
import {
  decideRecordingEligibility,
  type RecordingEligibilityDecision,
} from "@/lib/takes/recording-eligibility";
import { loadSamplePolicyDurationOverrides } from "@/lib/takes/sample-policy-settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureAnonymousTakeIdentity } from "@/lib/takes/anonymous-identity";

async function loadBeatForEligibility(beatId: string): Promise<{
  id: string;
  status: string;
  duration_seconds: number;
}> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("beats")
    .select("id, status, duration_seconds")
    .eq("id", beatId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AuthError("NOT_FOUND", "Beat not found.");
  return data as {
    id: string;
    status: string;
    duration_seconds: number;
  };
}

async function countOwnerSessionsToday(ownerId: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  const dayStart = utcDayWindowStart().toISOString();
  const { count, error } = await admin
    .from("takes")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .gte("created_at", dayStart);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function countOwnerActiveReady(ownerId: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const { count, error } = await admin
    .from("takes")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .eq("status", "READY")
    .is("deleted_at", null)
    .gt("expires_at", nowIso);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function countAnonSessionsToday(tokenHash: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  const dayStart = utcDayWindowStart().toISOString();
  const { count, error } = await admin
    .from("takes")
    .select("id", { count: "exact", head: true })
    .eq("anonymous_token_hash", tokenHash)
    .is("owner_id", null)
    .gte("created_at", dayStart);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function countAnonActiveReady(tokenHash: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const { count, error } = await admin
    .from("takes")
    .select("id", { count: "exact", head: true })
    .eq("anonymous_token_hash", tokenHash)
    .is("owner_id", null)
    .eq("status", "READY")
    .is("deleted_at", null)
    .gt("expires_at", nowIso);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Authenticated or anonymous eligibility for a published beat.
 * Cookie may be minted for anon so session counts stay consistent.
 */
export async function resolveRecordingEligibility(params: {
  beatId: string;
}): Promise<RecordingEligibilityDecision> {
  if (typeof params.beatId !== "string" || params.beatId.length < 8) {
    throw new AuthError("FORBIDDEN", "Invalid beatId.");
  }

  const beat = await loadBeatForEligibility(params.beatId);
  const duration = Math.floor(beat.duration_seconds);
  if (!Number.isFinite(duration) || duration <= 0) {
    return {
      allowed: false,
      code: "INVALID_BEAT",
      message: "Bit ma nieprawidłowy czas trwania.",
      maxRecordingSeconds: 0,
      actor: "FREE",
      premiumTier: null,
      dailySessionsUsed: 0,
      dailySessionLimit: 0,
      activeReadyUsed: 0,
      activeReadyCap: 0,
      upgradeHintTier: null,
      upgradeHintMessage: null,
    };
  }

  const auth = await getCurrentProfile();
  if (auth) {
    const product = await resolveProductEntitlementForAuthContext(auth);
    const actor = sampleActorFromPremiumTier(product.premiumTier);
    const overrides = await loadSamplePolicyDurationOverrides();
    const policy = getSamplePolicy({
      actor,
      beatDurationSeconds: duration,
      overrides,
    });
    const [sessionsToday, activeReadyCount] = await Promise.all([
      countOwnerSessionsToday(auth.userId),
      countOwnerActiveReady(auth.userId),
    ]);
    return decideRecordingEligibility({
      beatStatus: beat.status,
      policy,
      premiumTier: product.premiumTier,
      sessionsToday,
      activeReadyCount,
    });
  }

  const { tokenHash } = await ensureAnonymousTakeIdentity();
  const policy = getSamplePolicy({
    actor: "ANONYMOUS",
    beatDurationSeconds: duration,
  });
  const [sessionsToday, activeReadyCount] = await Promise.all([
    countAnonSessionsToday(tokenHash),
    countAnonActiveReady(tokenHash),
  ]);
  return decideRecordingEligibility({
    beatStatus: beat.status,
    policy,
    premiumTier: null,
    sessionsToday,
    activeReadyCount,
  });
}
