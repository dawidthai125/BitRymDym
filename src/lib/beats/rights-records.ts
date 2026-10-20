import "server-only";

import { AuthError } from "@/lib/auth/session";
import {
  PLATFORM_LICENSE_SCOPE,
  PLATFORM_LICENSE_VERSION,
  USER_RIGHTS_STATEMENT_VERSION,
  type ClosedReviewOutcome,
  type RightsCheckResult,
} from "@/lib/beats/rights-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function loadActiveMasterChecksum(
  beatId: string,
): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("beat_audio_assets")
    .select("checksum_sha256")
    .eq("beat_id", beatId)
    .eq("purpose", "MASTER")
    .eq("is_active", true)
    .eq("status", "READY");
  if (error) throw new Error(error.message);
  if (!data || data.length !== 1) return null;
  const checksum = data[0]?.checksum_sha256;
  return typeof checksum === "string" ? checksum : null;
}

export async function checksumIsBlocked(checksum: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("beat_blocked_audio_hashes")
    .select("event_kind")
    .eq("checksum_sha256", checksum)
    .order("event_seq", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0]?.event_kind === "block";
}

async function openBlockingReview(params: {
  beatId: string;
  checksum: string;
  kind: Exclude<RightsCheckResult["kind"], "no_signal">;
  actorId: string;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("beat_rights_reviews").insert({
    beat_id: params.beatId,
    checksum_sha256: params.checksum,
    kind: params.kind,
    created_by: params.actorId,
  });
  if (error && !error.message.includes("beat_rights_reviews_one_open_uidx")) {
    throw new Error(error.message);
  }
}

export async function prepareUserSubmissionRights(params: {
  beatId: string;
  ownerId: string;
}): Promise<void> {
  const checksum = await loadActiveMasterChecksum(params.beatId);
  if (!checksum) {
    throw new AuthError(
      "FORBIDDEN",
      "Brak jednego gotowego Mastera z hashem. Nie wysłano bitu do publikacji.",
    );
  }
  if (await checksumIsBlocked(checksum)) {
    await openBlockingReview({
      beatId: params.beatId,
      checksum,
      kind: "blocked_hash",
      actorId: params.ownerId,
    });
    throw new AuthError(
      "FORBIDDEN",
      "Ten plik jest zablokowany. Trafił do ręcznej weryfikacji i nie może zostać opublikowany.",
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("beat_rights_basis").insert({
    beat_id: params.beatId,
    basis_kind: "user_attestation",
    checksum_sha256: checksum,
    statement_version: USER_RIGHTS_STATEMENT_VERSION,
    actor_id: params.ownerId,
  });
  if (error && !error.message.includes("beat_rights_basis_attestation_uidx")) {
    throw new Error(error.message);
  }
}

export async function recordPlatformLicense(params: {
  beatId: string;
  verifierId: string;
  reference?: string | null;
  validUntil?: string | null;
}): Promise<void> {
  const checksum = await loadActiveMasterChecksum(params.beatId);
  if (!checksum) {
    throw new AuthError(
      "FORBIDDEN",
      "Brak jednego gotowego Mastera z hashem. Licencja nie została zapisana.",
    );
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("beat_rights_basis").insert({
    beat_id: params.beatId,
    basis_kind: "platform_license",
    checksum_sha256: checksum,
    statement_version: PLATFORM_LICENSE_VERSION,
    scope: PLATFORM_LICENSE_SCOPE,
    verifier_id: params.verifierId,
    verified_at: new Date().toISOString(),
    valid_until: params.validUntil ?? null,
    reference: params.reference?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function recordRecognitionReview(params: {
  beatId: string;
  actorId: string;
  result: RightsCheckResult;
}): Promise<void> {
  if (params.result.kind === "no_signal") return;
  const checksum = await loadActiveMasterChecksum(params.beatId);
  if (!checksum) {
    throw new AuthError("FORBIDDEN", "Brak Mastera, którego dotyczy wynik kontroli.");
  }
  await openBlockingReview({
    beatId: params.beatId,
    checksum,
    kind: params.result.kind,
    actorId: params.actorId,
  });
}

export type OpenRightsReviewRef = {
  id: string;
  kind: string;
  checksumSha256: string;
};

export async function listOpenRightsReviews(
  beatId: string,
): Promise<OpenRightsReviewRef[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beat_rights_reviews")
    .select("id, kind, checksum_sha256")
    .eq("beat_id", beatId)
    .is("closed_at", null);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    kind: String(row.kind),
    checksumSha256: String(row.checksum_sha256),
  }));
}

export async function loadLatestClosedReviewOutcome(params: {
  beatId: string;
  checksum: string;
}): Promise<ClosedReviewOutcome | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beat_rights_reviews")
    .select("close_outcome")
    .eq("beat_id", params.beatId)
    .eq("checksum_sha256", params.checksum)
    .not("closed_at", "is", null)
    .order("closed_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const outcome = data?.[0]?.close_outcome;
  if (
    outcome === "dismissed_no_publish" ||
    outcome === "still_blocked" ||
    outcome === "needs_new_master"
  ) {
    return outcome;
  }
  return null;
}

export async function loadUserPublishRightsFacts(beatId: string): Promise<{
  checksum: string | null;
  attestation: {
    beatId: string;
    checksumSha256: string;
    statementVersion: string;
    acceptedAt: string;
  } | null;
  hashBlocked: boolean;
  openManualReview: boolean;
  latestClosedOutcome: ClosedReviewOutcome | null;
}> {
  const checksum = await loadActiveMasterChecksum(beatId);
  if (!checksum) {
    return {
      checksum: null,
      attestation: null,
      hashBlocked: false,
      openManualReview: false,
      latestClosedOutcome: null,
    };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("beat_rights_basis")
    .select("statement_version, accepted_at")
    .eq("beat_id", beatId)
    .eq("basis_kind", "user_attestation")
    .eq("checksum_sha256", checksum)
    .eq("statement_version", USER_RIGHTS_STATEMENT_VERSION)
    .limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0];
  const reviews = await listOpenRightsReviews(beatId);
  return {
    checksum,
    attestation: row
      ? {
          beatId,
          checksumSha256: checksum,
          statementVersion: String(row.statement_version),
          acceptedAt: String(row.accepted_at),
        }
      : null,
    hashBlocked: await checksumIsBlocked(checksum),
    openManualReview: reviews.some(
      (review) =>
        review.checksumSha256 === checksum && review.kind !== "no_signal",
    ),
    latestClosedOutcome: await loadLatestClosedReviewOutcome({
      beatId,
      checksum,
    }),
  };
}

export async function closeOpenRightsReview(params: {
  reviewId: string;
  outcome: "dismissed_no_publish" | "still_blocked" | "needs_new_master";
  reason: string;
}): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("close_beat_rights_review", {
    p_review_id: params.reviewId,
    p_outcome: params.outcome,
    p_reason: params.reason,
  });
  if (error) {
    const { rightsDatabaseMessage } = await import("@/lib/beats/rights-policy");
    const message = rightsDatabaseMessage(error.message);
    if (message) throw new AuthError("FORBIDDEN", message);
    throw new Error(error.message);
  }
  if (typeof data !== "string") {
    throw new AuthError("NOT_FOUND", "Nie ma takiej otwartej sprawy.");
  }
  return data;
}
