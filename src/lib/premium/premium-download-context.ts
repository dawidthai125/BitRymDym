/**
 * PREMIUM-04/09 — Resolve sticky unlock + R1 retention for finished-file mint.
 * Maps audio_artifacts → premium_works (TAKE | STUDIO_PROJECT) without client claims.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type PremiumWorkDownloadContext = {
  workId: string | null;
  workStatus: "DRAFT" | "WORK_READY" | "EXPIRED" | "DELETED" | null;
  hasUnlock: boolean;
  retentionExpiresAtMs: number | null;
};

function isWorkStatus(
  value: string | null | undefined,
): value is PremiumWorkDownloadContext["workStatus"] {
  return (
    value === "DRAFT" ||
    value === "WORK_READY" ||
    value === "EXPIRED" ||
    value === "DELETED" ||
    value === null
  );
}

/**
 * Resolve Premium work for a MIX/TAKE finished artifact.
 * No matching premium_works row → null status (gate → NOT_READY).
 */
export async function loadPremiumWorkDownloadContext(params: {
  admin: SupabaseClient;
  userId: string;
  takeId: string | null;
  projectId: string | null;
  mixSessionId?: string | null;
}): Promise<PremiumWorkDownloadContext> {
  const empty: PremiumWorkDownloadContext = {
    workId: null,
    workStatus: null,
    hasUnlock: false,
    retentionExpiresAtMs: null,
  };

  let domain: "TAKE" | "STUDIO_PROJECT" | null = null;
  let domainRef: string | null = null;
  if (params.takeId) {
    domain = "TAKE";
    domainRef = params.takeId;
  } else if (params.mixSessionId) {
    // E3_MIX finished file → same song as mix_sessions.source_take_id (TAKE work).
    const { data: mix, error: mixErr } = await params.admin
      .from("mix_sessions")
      .select("source_take_id")
      .eq("id", params.mixSessionId)
      .maybeSingle();
    if (mixErr) throw new Error(mixErr.message);
    if (mix?.source_take_id) {
      domain = "TAKE";
      domainRef = mix.source_take_id as string;
    }
  } else if (params.projectId) {
    domain = "STUDIO_PROJECT";
    domainRef = params.projectId;
  }
  if (!domain || !domainRef) return empty;

  const { data: work, error } = await params.admin
    .from("premium_works")
    .select("id, status, retention_expires_at")
    .eq("domain", domain)
    .eq("domain_ref", domainRef)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!work) return empty;

  const statusRaw = work.status as string;
  const workStatus = isWorkStatus(statusRaw) ? statusRaw : null;
  const retentionExpiresAtMs = work.retention_expires_at
    ? new Date(work.retention_expires_at as string).getTime()
    : null;

  const { data: unlock, error: unlockError } = await params.admin
    .from("premium_track_unlocks")
    .select("id")
    .eq("user_id", params.userId)
    .eq("work_id", work.id as string)
    .maybeSingle();
  if (unlockError) throw new Error(unlockError.message);

  return {
    workId: work.id as string,
    workStatus,
    hasUnlock: Boolean(unlock?.id),
    retentionExpiresAtMs,
  };
}

export function denyMessageForPremiumDownloadReason(
  reason: string,
): string {
  switch (reason) {
    case "FREE_NO_DOWNLOAD":
      return "Pobieranie gotowych plików wymaga pakietu Premium.";
    case "QUALITY_NOT_IN_PLAN":
      return "Ta jakość nie jest dostępna w Twoim pakiecie.";
    case "NO_UNLOCK":
      return "Odblokuj utwór, zanim pobierzesz gotowy plik.";
    case "RETENTION_EXPIRED":
      return "Retencja utworu wygasła.";
    case "NOT_READY":
      return "Utwór nie jest gotowy do pobrania.";
    case "NOT_OWNER":
      return "Brak dostępu do utworu.";
    default:
      return "Pobieranie niedozwolone.";
  }
}
