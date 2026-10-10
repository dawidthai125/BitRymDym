/**
 * STUDIO_EXPORT Stage B — multi-source AuthZ orchestration.
 * FINDING-01: claim/enqueue must re-validate TAKE/BEAT from DB — snapshot IDs are not AuthZ.
 * Does not mint signed URLs (bake stage later). Does not run offline encode.
 */

import "server-only";

import { E3_RENDER_JOBS_ENABLED } from "@/config/audio-render";
import {
  parseRenderJobEntitlementSnapshot,
  RenderJobDomainError,
  type RenderJobEntitlementSnapshot,
} from "@/lib/audio/render-job-core";
import {
  assertRenderBeatEligibleAtBake,
  assertRenderTakeEligibleAtBake,
  type AuthorizedRenderSourceRef,
} from "@/lib/audio/render-source-core";
import {
  collectStudioExportSourceRefs,
  parseStudioExportDocumentSnapshot,
  type StudioExportDocumentSnapshotV1,
} from "@/lib/audio/studio-export-document-snapshot";
import { MixAuthzError } from "@/lib/mix/authz-core";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { RenderJobTier, SystemRole } from "@/types/domain";

export type AuthorizedStudioExportSources = {
  kind: "STUDIO_EXPORT";
  jobId: string;
  ownerId: string;
  projectId: string;
  documentVersion: number;
  documentDigest: string;
  requestedTier: RenderJobTier;
  entitlementSnapshot: RenderJobEntitlementSnapshot;
  /** Canonical snapshot used for export content (immutable). */
  documentSnapshot: StudioExportDocumentSnapshotV1;
  takes: Record<string, AuthorizedRenderSourceRef>;
  beats: Record<
    string,
    AuthorizedRenderSourceRef & {
      assetId: string;
    }
  >;
};

function mapAuthzError(error: unknown): never {
  if (error instanceof MixAuthzError) {
    throw new RenderJobDomainError(
      error.message,
      error.code === "NOT_FOUND" ? "NOT_FOUND" : "FORBIDDEN",
    );
  }
  throw error;
}

async function loadOwnerRole(ownerId: string): Promise<SystemRole> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("role")
    .eq("id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const role = data?.role as SystemRole | undefined;
  if (role === "ADMIN" || role === "MODERATOR" || role === "USER") {
    return role;
  }
  return "USER";
}

async function resolveBeatMasterAsset(beatId: string) {
  const admin = createSupabaseAdminClient();

  const { data: playback, error: playbackError } = await admin
    .from("beat_audio_assets")
    .select(
      "id, object_key, storage_bucket, content_type, byte_size, status, is_active, purpose",
    )
    .eq("beat_id", beatId)
    .eq("purpose", "PLAYBACK")
    .eq("is_active", true)
    .eq("status", "READY")
    .maybeSingle();
  if (playbackError) throw new Error(playbackError.message);
  if (playback) return playback;

  const { data: master, error: masterError } = await admin
    .from("beat_audio_assets")
    .select(
      "id, object_key, storage_bucket, content_type, byte_size, status, is_active, purpose",
    )
    .eq("beat_id", beatId)
    .eq("purpose", "MASTER")
    .eq("is_active", true)
    .eq("status", "READY")
    .maybeSingle();
  if (masterError) throw new Error(masterError.message);
  if (!master) {
    throw new RenderJobDomainError(
      "No READY beat audio asset for render.",
      "NOT_FOUND",
    );
  }
  return master;
}

/**
 * Validate all TAKE/BEAT_REF refs for a document owned by jobOwnerId.
 * objectKey always from DB after bake gates — never from snapshot/client.
 */
export async function authorizeStudioExportSourcesForDocument(params: {
  jobOwnerId: string;
  document: StudioExportDocumentSnapshotV1["document"];
  actorRole?: SystemRole;
}): Promise<{
  takes: AuthorizedStudioExportSources["takes"];
  beats: AuthorizedStudioExportSources["beats"];
  sourceRefs: ReturnType<typeof collectStudioExportSourceRefs>;
}> {
  const sourceRefs = collectStudioExportSourceRefs(params.document);
  const admin = createSupabaseAdminClient();
  const actorRole =
    params.actorRole ?? (await loadOwnerRole(params.jobOwnerId));

  const takes: AuthorizedStudioExportSources["takes"] = {};
  for (const takeId of sourceRefs.takeIds) {
    const { data: take, error: takeError } = await admin
      .from("takes")
      .select(
        "id, owner_id, beat_id, status, object_key, storage_bucket, content_type, duration_seconds, byte_size, expires_at, deleted_at",
      )
      .eq("id", takeId)
      .maybeSingle();
    if (takeError) throw new Error(takeError.message);
    if (!take) {
      throw new RenderJobDomainError(
        `Source take not found: ${takeId}.`,
        "NOT_FOUND",
      );
    }
    try {
      // Cross-beat allowed: expectedBeatId = take.beat_id (TAKE_EXPORT pattern).
      takes[takeId] = assertRenderTakeEligibleAtBake({
        take: {
          id: take.id as string,
          owner_id: take.owner_id as string | null,
          beat_id: take.beat_id as string,
          status: take.status as string,
          object_key: take.object_key as string,
          storage_bucket: take.storage_bucket as string,
          content_type: take.content_type as string | null,
          duration_seconds: take.duration_seconds as number | null,
          byte_size: (take.byte_size as number | null) ?? null,
          expires_at: take.expires_at as string,
          deleted_at: take.deleted_at as string | null,
        },
        jobOwnerId: params.jobOwnerId,
        expectedBeatId: take.beat_id as string,
      });
    } catch (error) {
      mapAuthzError(error);
    }
  }

  const beats: AuthorizedStudioExportSources["beats"] = {};
  for (const beatId of sourceRefs.beatIds) {
    const { data: beat, error: beatError } = await admin
      .from("beats")
      .select("id, status, duration_seconds")
      .eq("id", beatId)
      .maybeSingle();
    if (beatError) throw new Error(beatError.message);
    if (!beat) {
      throw new RenderJobDomainError(
        `Beat not found: ${beatId}.`,
        "NOT_FOUND",
      );
    }
    const asset = await resolveBeatMasterAsset(beat.id as string);
    try {
      const ref = assertRenderBeatEligibleAtBake({
        beatId: beat.id as string,
        beatStatus: beat.status as string,
        actorRole,
        durationSeconds: (beat.duration_seconds as number | null) ?? null,
        asset: {
          id: asset.id as string,
          object_key: asset.object_key as string,
          storage_bucket: asset.storage_bucket as string,
          content_type: (asset.content_type as string | null) ?? null,
          byte_size: (asset.byte_size as number | null) ?? null,
          status: asset.status as string,
          is_active: Boolean(asset.is_active),
          purpose: asset.purpose as string,
        },
      });
      beats[beatId] = {
        ...ref,
        assetId: asset.id as string,
      };
    } catch (error) {
      mapAuthzError(error);
    }
  }

  return { takes, beats, sourceRefs };
}

/**
 * Claim/FINDING-01 resolver — jobId only. Loads immutable snapshot, re-AuthZ sources.
 * Does not change job status (caller marks FAILED SOURCE_* on throw).
 */
export async function resolveAuthorizedStudioExportSourcesForJob(
  jobId: string,
): Promise<AuthorizedStudioExportSources> {
  if (E3_RENDER_JOBS_ENABLED !== true) {
    throw new RenderJobDomainError(
      "Render jobs are not enabled (E3_RENDER_JOBS_ENABLED=OFF).",
      "DISABLED",
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: job, error: jobError } = await admin
    .from("render_jobs")
    .select(
      "id, owner_id, mix_session_id, take_id, project_id, kind, requested_tier, status, entitlement_snapshot, document_snapshot",
    )
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) throw new Error(jobError.message);
  if (!job) {
    throw new RenderJobDomainError("Render job not found.", "NOT_FOUND");
  }
  if ((job.kind as string | null) !== "STUDIO_EXPORT") {
    throw new RenderJobDomainError(
      "Job kind is not STUDIO_EXPORT.",
      "INVALID",
    );
  }
  if (job.status !== "QUEUED" && job.status !== "RUNNING") {
    throw new RenderJobDomainError(
      `Cannot resolve sources for job in status ${job.status}.`,
      "CONFLICT",
    );
  }
  if (job.mix_session_id != null || job.take_id != null) {
    throw new RenderJobDomainError(
      "STUDIO_EXPORT job must not have mix_session_id or take_id.",
      "INVALID",
    );
  }
  if (typeof job.project_id !== "string" || !job.project_id) {
    throw new RenderJobDomainError(
      "STUDIO_EXPORT job missing project_id.",
      "INVALID",
    );
  }

  const entitlementSnapshot = parseRenderJobEntitlementSnapshot(
    job.entitlement_snapshot,
  );
  if (
    entitlementSnapshot.entitlement.userId != null &&
    entitlementSnapshot.entitlement.userId !== (job.owner_id as string)
  ) {
    throw new RenderJobDomainError(
      "Entitlement snapshot owner mismatch.",
      "FORBIDDEN",
    );
  }

  const documentSnapshot = parseStudioExportDocumentSnapshot(
    job.document_snapshot,
    {
      jobId: job.id as string,
      ownerId: job.owner_id as string,
      projectId: job.project_id as string,
    },
  );

  // Live project ownership re-check (snapshot is not ownership proof).
  const { data: project, error: projectError } = await admin
    .from("studio_projects")
    .select("id, owner_id")
    .eq("id", job.project_id as string)
    .maybeSingle();
  if (projectError) throw new Error(projectError.message);
  if (!project) {
    throw new RenderJobDomainError("Studio project not found.", "NOT_FOUND");
  }
  if ((project.owner_id as string) !== (job.owner_id as string)) {
    throw new RenderJobDomainError(
      "Studio project does not belong to job owner.",
      "FORBIDDEN",
    );
  }

  const { takes, beats } = await authorizeStudioExportSourcesForDocument({
    jobOwnerId: job.owner_id as string,
    document: documentSnapshot.document,
  });

  return {
    kind: "STUDIO_EXPORT",
    jobId: job.id as string,
    ownerId: job.owner_id as string,
    projectId: job.project_id as string,
    documentVersion: documentSnapshot.documentVersion,
    documentDigest: documentSnapshot.documentDigest,
    requestedTier: job.requested_tier as RenderJobTier,
    entitlementSnapshot,
    documentSnapshot,
    takes,
    beats,
  };
}
