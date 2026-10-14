/**
 * SFM Stage C — executor enqueue / claim helpers (no bake/encode).
 * Contabo STUDIO_EXPORT poller must not call these.
 */

import "server-only";

import { isSfmVersionsV1Enabled } from "@/config/audio-render";
import type { AuthContext } from "@/lib/auth/types";
import { AuthError } from "@/lib/auth/session";
import { claimNextSfmJobAsWorker } from "@/lib/audio/render-job-service";
import {
  mapSfmRpcErrorMessage,
  SfmDomainError,
} from "@/lib/sfm/sfm-domain";
import {
  isSfmQuality,
  type SfmQuality,
} from "@/lib/sfm/sfm-plan-matrix";
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

/** Lazy QUALITY encode enqueue (infrastructure only — no encode execution). */
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
