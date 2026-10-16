/**
 * SFM Stage C/D — executor enqueue / claim helpers.
 * Stage D: grant + granted_qualities gate before lazy QUALITY enqueue.
 * Contabo STUDIO_EXPORT poller must not call these.
 */

import "server-only";

import { isSfmVersionsV1Enabled } from "@/config/audio-render";
import type { AuthContext } from "@/lib/auth/types";
import { AuthError } from "@/lib/auth/session";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import {
  claimNextSfmJobAsWorker,
  rejectSfmExecutorJobKindOut,
} from "@/lib/audio/render-job-service";
import {
  mapSfmRpcErrorMessage,
  SfmDomainError,
} from "@/lib/sfm/sfm-domain";
import {
  isSfmQuality,
  type SfmQuality,
} from "@/lib/sfm/sfm-plan-matrix";
import { resolveSfmQualityEntitlement } from "@/lib/sfm/sfm-quality-entitlement";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function assertSfmVersionsEnabled(): void {
  if (!isSfmVersionsV1Enabled()) {
    throw new SfmDomainError(
      "Studio Final Mix versions are not enabled (SFM_VERSIONS_V1=OFF).",
      "DISABLED",
    );
  }
}

function throwMappedRpcError(error: { message: string }): never {
  const code = mapSfmRpcErrorMessage(error.message);
  if (code === "NOT_OWNER" || code === "FORBIDDEN") {
    throw new AuthError("FORBIDDEN", "Brak dostępu do tej wersji.");
  }
  if (code === "NOT_FOUND") {
    throw new AuthError("NOT_FOUND", "Wersja nie została znaleziona.");
  }
  throw new SfmDomainError(error.message, code);
}

export type SfmQualityEncodeJobRecord = {
  jobId: string;
  versionId: string;
  kind: "SFM_QUALITY_ENCODE";
  status: string;
  sfmQuality: SfmQuality;
};

/** Lazy QUALITY encode enqueue — requires version grant + quality ∈ snapshot. */
export async function enqueueSfmQualityEncodeFor(
  context: AuthContext,
  input: {
    versionId: string;
    quality: unknown;
    idempotencyKey: unknown;
  },
): Promise<SfmQualityEncodeJobRecord> {
  assertSfmVersionsEnabled();

  if (typeof input.versionId !== "string" || input.versionId.length < 8) {
    throw new SfmDomainError("Invalid versionId.", "INVALID");
  }
  if (!isSfmQuality(input.quality)) {
    throw new SfmDomainError("Invalid SFM quality.", "INVALID");
  }
  if (
    typeof input.idempotencyKey !== "string" ||
    input.idempotencyKey.trim().length === 0
  ) {
    throw new SfmDomainError("idempotencyKey is required.", "INVALID");
  }

  const admin = createSupabaseAdminClient();

  const { data: grantRow, error: grantError } = await admin
    .from("studio_final_version_grants")
    .select("granted_qualities")
    .eq("user_id", context.userId)
    .eq("version_id", input.versionId)
    .maybeSingle();
  if (grantError) throw new Error(grantError.message);

  const product = await resolveProductEntitlementForAuthContext(context);
  const entitlement = resolveSfmQualityEntitlement({
    premiumTier: product.premiumTier,
    quality: input.quality,
    versionGrant: grantRow
      ? {
          grantedQualities: (grantRow.granted_qualities as SfmQuality[]) ?? [],
        }
      : null,
    accessMode: "ENQUEUE",
  });
  if (!entitlement.allow) {
    throw new SfmDomainError(
      `SFM quality enqueue denied (${entitlement.denyCode}).`,
      entitlement.denyCode === "DOWNGRADE_NEW_QUALITY"
        ? "DOWNGRADE_NEW_QUALITY"
        : entitlement.denyCode === "NO_GRANT"
          ? "NO_GRANT"
          : entitlement.denyCode === "FREE_NO_DOWNLOAD"
            ? "FREE_NO_DOWNLOAD"
            : entitlement.denyCode === "PLAN_DENIED"
              ? "PLAN_DENIED"
              : "QUALITY_DENIED",
    );
  }

  const { data, error } = await admin.rpc("sfm_enqueue_quality_encode", {
    p_version_id: input.versionId,
    p_owner_id: context.userId,
    p_quality: input.quality,
    p_idempotency_key: input.idempotencyKey.trim(),
  });

  if (error) throwMappedRpcError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw new SfmDomainError("Enqueue quality RPC returned no row.", "CONFLICT");
  }
  const record = row as Record<string, unknown>;
  return {
    jobId: String(record.job_id),
    versionId: String(record.version_id),
    kind: "SFM_QUALITY_ENCODE",
    status: String(record.status),
    sfmQuality: record.sfm_quality as SfmQuality,
  };
}

/** Worker entry for SFM claim-next (separate from STUDIO_EXPORT poller). */
export async function claimNextSfmExecutorJobForWorker(workerRef: string) {
  return claimNextSfmJobAsWorker(workerRef);
}

/** Worker entry for OD-SFM-WORKER-KIND-REJECT (CAS KIND_OUT → FAILED). */
export async function rejectSfmExecutorJobKindForWorker(
  jobId: string,
  workerRef: string,
) {
  return rejectSfmExecutorJobKindOut(jobId, workerRef);
}
