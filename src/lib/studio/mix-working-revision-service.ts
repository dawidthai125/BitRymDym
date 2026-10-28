import "server-only";

import { randomUUID } from "node:crypto";

import { requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { isUuid } from "@/lib/beats/audio-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MixWorkingApplyError } from "@/lib/studio/mix-working/mix-working-apply-errors";
import { diffMixWorkingRevisions } from "@/lib/studio/mix-working/mix-working-diff";
import { fingerprintMixWorkingRestoreRequest } from "@/lib/studio/mix-working/mix-working-fingerprint";
import { buildRestoreOpsFromSnapshot } from "@/lib/studio/mix-working/mix-working-restore-ops";
import {
  MixWorkingDomainError,
  type MixRevision,
  type MixRevisionAuthor,
  type MixRevisionKind,
  type MixRevisionStatus,
  type MixWorkingOp,
  type MixWorkingSnapshotV1,
} from "@/lib/studio/mix-working/mix-working-types";
import {
  applyStudioMixWorkingOpsFor,
  loadMixWorkingIdempotencyFor,
} from "@/lib/studio/mix-working-apply-service";
import { getStudioProjectDocumentFor } from "@/lib/studio/studio-service";
import { parseExpectedDocumentVersion } from "@/lib/studio/studio-fx-chain";

type RevisionRow = {
  id: string;
  owner_id: string;
  project_id: string;
  parent_revision_id: string | null;
  restored_from_revision_id: string | null;
  kind: string;
  author: string;
  status: string;
  description: string | null;
  source_document_version: number;
  document_digest: string;
  snapshot: MixWorkingSnapshotV1;
  ops: MixWorkingOp[] | null;
  proposal_id: string | null;
  idempotency_request_id: string | null;
  created_at: string;
  accepted_at: string | null;
};

function mapRevision(row: RevisionRow): MixRevision {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerId: row.owner_id,
    parentRevisionId: row.parent_revision_id,
    kind: row.kind as MixRevisionKind,
    author: row.author as MixRevisionAuthor,
    status: row.status as MixRevisionStatus,
    sourceDocumentVersion: Number(row.source_document_version),
    documentDigest: row.document_digest,
    snapshot: row.snapshot,
    ops: row.ops,
    proposalId: row.proposal_id,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    description: row.description,
    idempotencyRequestId: row.idempotency_request_id,
    restoredFromRevisionId: row.restored_from_revision_id,
  };
}

function mapDomain(error: MixWorkingDomainError): never {
  if (error.code === "FORBIDDEN_FIELD") {
    throw new MixWorkingApplyError("FORBIDDEN_OP", error.message);
  }
  if (error.code === "LIMIT") {
    throw new MixWorkingApplyError("SNAPSHOT_TOO_LARGE", error.message);
  }
  if (error.code === "NOT_FOUND") {
    throw new MixWorkingApplyError("REVISION_NOT_FOUND", error.message);
  }
  throw new MixWorkingApplyError("REVISION_INVALID", error.message);
}

async function assertProjectOwned(
  context: AuthContext,
  projectId: string,
): Promise<void> {
  await getStudioProjectDocumentFor(context, projectId);
}

export async function listMixWorkingRevisionsFor(
  context: AuthContext,
  input: {
    projectId: string;
    limit?: unknown;
    cursor?: unknown;
  },
): Promise<{
  revisions: Array<Omit<MixRevision, "snapshot" | "ops"> & { hasSnapshot: boolean }>;
  nextCursor: string | null;
}> {
  await assertProjectOwned(context, input.projectId);
  const limitRaw = input.limit === undefined ? 20 : Number(input.limit);
  const limit =
    Number.isInteger(limitRaw) && limitRaw >= 1 && limitRaw <= 50
      ? limitRaw
      : (() => {
          throw new MixWorkingApplyError(
            "INVALID_REQUEST",
            "limit must be an integer 1..50.",
          );
        })();

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("studio_mix_working_revisions")
    .select(
      "id, owner_id, project_id, parent_revision_id, restored_from_revision_id, kind, author, status, description, source_document_version, document_digest, proposal_id, idempotency_request_id, created_at, accepted_at",
    )
    .eq("project_id", input.projectId)
    .eq("owner_id", context.userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (typeof input.cursor === "string" && input.cursor.length > 0) {
    // cursor = ISO created_at of the last seen row (stable enough for v1 lists).
    if (Number.isNaN(Date.parse(input.cursor))) {
      throw new MixWorkingApplyError("INVALID_REQUEST", "Invalid cursor.");
    }
    query = query.lt("created_at", input.cursor);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<Omit<RevisionRow, "snapshot" | "ops">>;
  const page = rows.slice(0, limit);
  const next =
    rows.length > limit ? page[page.length - 1]!.created_at : null;

  return {
    revisions: page.map((row) => {
      const mapped = mapRevision({
        ...row,
        snapshot: null as unknown as MixWorkingSnapshotV1,
        ops: null,
      });
      const { snapshot: _s, ops: _o, ...rest } = mapped;
      return { ...rest, hasSnapshot: true };
    }),
    nextCursor: next,
  };
}

export async function getMixWorkingRevisionFor(
  context: AuthContext,
  input: { projectId: string; revisionId: string },
): Promise<MixRevision> {
  if (!isUuid(input.revisionId)) {
    throw new MixWorkingApplyError("INVALID_REQUEST", "revisionId must be a UUID.");
  }
  await assertProjectOwned(context, input.projectId);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("studio_mix_working_revisions")
    .select("*")
    .eq("id", input.revisionId)
    .eq("project_id", input.projectId)
    .eq("owner_id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new MixWorkingApplyError("REVISION_NOT_FOUND", "Revision not found.");
  }
  return mapRevision(data as RevisionRow);
}

export async function compareMixWorkingRevisionsFor(
  context: AuthContext,
  input: {
    projectId: string;
    fromRevisionId: unknown;
    toRevisionId: unknown;
  },
) {
  if (!isUuid(input.fromRevisionId) || !isUuid(input.toRevisionId)) {
    throw new MixWorkingApplyError(
      "INVALID_REQUEST",
      "fromRevisionId and toRevisionId must be UUIDs.",
    );
  }
  const from = await getMixWorkingRevisionFor(context, {
    projectId: input.projectId,
    revisionId: input.fromRevisionId,
  });
  const to = await getMixWorkingRevisionFor(context, {
    projectId: input.projectId,
    revisionId: input.toRevisionId,
  });
  try {
    return diffMixWorkingRevisions({ from, to });
  } catch (error) {
    if (error instanceof MixWorkingDomainError) mapDomain(error);
    throw error;
  }
}

function isRestoreNoOpsError(error: unknown): boolean {
  return (
    error instanceof MixWorkingDomainError &&
    error.code === "INVALID" &&
    error.message.includes("Restore target matches tip mix plane")
  );
}

export async function restoreMixWorkingRevisionFor(
  context: AuthContext,
  input: {
    projectId: string;
    revisionId: string;
    expectedDocumentVersion: unknown;
    requestId: unknown;
  },
) {
  if (!isUuid(input.revisionId)) {
    throw new MixWorkingApplyError("INVALID_REQUEST", "revisionId must be a UUID.");
  }
  if (!isUuid(input.requestId)) {
    throw new MixWorkingApplyError(
      "INVALID_REQUEST",
      "requestId must be a UUID.",
    );
  }
  const expected = parseExpectedDocumentVersion(input.expectedDocumentVersion);
  const requestId = String(input.requestId).toLowerCase();

  const source = await getMixWorkingRevisionFor(context, {
    projectId: input.projectId,
    revisionId: input.revisionId,
  });
  if (!source.snapshot) {
    throw new MixWorkingApplyError(
      "REVISION_INVALID",
      "Revision has no snapshot.",
    );
  }

  const restoreFingerprint = fingerprintMixWorkingRestoreRequest({
    expectedDocumentVersion: expected,
    restoredFromRevisionId: source.id,
  });

  const tip = await getStudioProjectDocumentFor(context, input.projectId);
  let ops: MixWorkingOp[];
  try {
    ops = buildRestoreOpsFromSnapshot({
      tip,
      target: source.snapshot,
    });
  } catch (error) {
    if (!isRestoreNoOpsError(error)) {
      if (error instanceof MixWorkingDomainError) mapDomain(error);
      throw error;
    }

    // Tip mix already matches target — only A1 idempotent replay is allowed.
    // Do not create an empty apply/revision for a fresh requestId.
    const existing = await loadMixWorkingIdempotencyFor(context, {
      projectId: input.projectId,
      requestId,
    });
    if (!existing) {
      throw new MixWorkingApplyError(
        "REVISION_INVALID",
        "Restore target matches tip mix plane (no ops).",
      );
    }
    if (existing.request_fingerprint !== restoreFingerprint) {
      throw new MixWorkingApplyError(
        "IDEMPOTENCY_KEY_REUSE",
        "Idempotency key was reused with a different payload.",
      );
    }
    const revisionId =
      existing.result && typeof existing.result === "object"
        ? (existing.result as { revisionId?: string | null }).revisionId
        : null;
    return {
      documentVersion: Number(existing.version_after),
      documentDigest: String(existing.result_document_digest),
      replay: true,
      revisionId: revisionId ? String(revisionId) : null,
    };
  }

  return applyStudioMixWorkingOpsFor(context, {
    projectId: input.projectId,
    expectedDocumentVersion: expected,
    requestId,
    ops,
    requestFingerprint: restoreFingerprint,
    revision: {
      kind: "restored",
      description: `Restore from ${source.id}`,
      restoredFromRevisionId: source.id,
      // A3.5-B: parent resolved in RPC TX from tip source_document_version
      recordRevision: true,
    },
  });
}

export async function listMixWorkingRevisions(
  input: Parameters<typeof listMixWorkingRevisionsFor>[1],
) {
  return listMixWorkingRevisionsFor(await requireUser(), input);
}

export async function getMixWorkingRevision(
  input: Parameters<typeof getMixWorkingRevisionFor>[1],
) {
  return getMixWorkingRevisionFor(await requireUser(), input);
}

export async function compareMixWorkingRevisions(
  input: Parameters<typeof compareMixWorkingRevisionsFor>[1],
) {
  return compareMixWorkingRevisionsFor(await requireUser(), input);
}

export async function restoreMixWorkingRevision(
  input: Parameters<typeof restoreMixWorkingRevisionFor>[1],
) {
  return restoreMixWorkingRevisionFor(await requireUser(), input);
}

/** Test helper — not used by routes. */
export function newRevisionId(): string {
  return randomUUID();
}
