import "server-only";

import { randomUUID } from "node:crypto";

import { AuthError, requireUser } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { isUuid } from "@/lib/beats/audio-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  applyMixWorkingOpsInMemory,
  type MixWorkingPatchPlan,
} from "@/lib/studio/mix-working/mix-working-apply";
import { MixWorkingApplyError } from "@/lib/studio/mix-working/mix-working-apply-errors";
import {
  fingerprintMixWorkingRequest,
  fingerprintMixWorkingRestoreRequest,
} from "@/lib/studio/mix-working/mix-working-fingerprint";
import { validateMixWorkingOps } from "@/lib/studio/mix-working/mix-working-ops";
import { buildMixWorkingSnapshot } from "@/lib/studio/mix-working/mix-working-snapshot";
import {
  MixWorkingDomainError,
  type MixRevisionKind,
  type MixWorkingOp,
} from "@/lib/studio/mix-working/mix-working-types";
import {
  parseExpectedDocumentVersion,
  StudioFxCasConflictError,
  StudioFxChainError,
} from "@/lib/studio/studio-fx-chain";
import { getStudioProjectDocumentFor } from "@/lib/studio/studio-service";

function parseRequestId(raw: unknown): string {
  if (!isUuid(raw)) {
    throw new MixWorkingApplyError(
      "INVALID_REQUEST",
      "requestId must be a UUID.",
    );
  }
  return raw.toLowerCase();
}

function mapDomainError(error: MixWorkingDomainError): never {
  switch (error.code) {
    case "FORBIDDEN_FIELD":
    case "UNKNOWN_OP":
      throw new MixWorkingApplyError("FORBIDDEN_OP", error.message);
    case "LIMIT":
      throw new MixWorkingApplyError("SNAPSHOT_TOO_LARGE", error.message);
    case "UNSUPPORTED_FX":
    case "INVALID":
    case "NOT_FOUND":
    case "STALE":
      throw new MixWorkingApplyError("INVALID_DOCUMENT", error.message);
    default: {
      const _exhaustive: never = error.code;
      throw new MixWorkingApplyError("INVALID_DOCUMENT", String(_exhaustive));
    }
  }
}

function mapRpcError(message: string): never {
  if (message.includes("IDEMPOTENCY_KEY_REUSE")) {
    throw new MixWorkingApplyError(
      "IDEMPOTENCY_KEY_REUSE",
      "Idempotency key was reused with a different payload.",
    );
  }
  if (message.includes("FX_CHAIN_VERSION_CONFLICT")) {
    throw new StudioFxCasConflictError();
  }
  if (message.includes("MIX_WORKING_REVISION_INVALID")) {
    throw new MixWorkingApplyError("REVISION_INVALID", message);
  }
  if (
    message.includes("TRACK_NOT_FOUND") ||
    message.includes("MIX_WORKING_PATCH_INVALID")
  ) {
    throw new MixWorkingApplyError("INVALID_DOCUMENT", message);
  }
  throw new Error(message);
}

function withDomainMapping<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof MixWorkingDomainError) {
      mapDomainError(error);
    }
    if (error instanceof StudioFxChainError) {
      throw new MixWorkingApplyError("INVALID_DOCUMENT", error.message);
    }
    throw error;
  }
}

export type MixWorkingApplyServiceResult = {
  documentVersion: number;
  documentDigest: string;
  replay: boolean;
  revisionId: string | null;
};

export type MixWorkingApplyRevisionMeta = {
  kind?: MixRevisionKind;
  description?: string | null;
  /**
   * @deprecated A3.5-B — parent is resolved inside the CAS RPC transaction
   * from source_document_version = expected tip. Ignored if supplied.
   */
  parentRevisionId?: string | null;
  restoredFromRevisionId?: string | null;
  /** When false, skip durable revision (tests/legacy). Default true. */
  recordRevision?: boolean;
};

type IdempotencyRow = {
  request_fingerprint: string;
  version_after: number;
  result_document_digest: string;
  result: { revisionId?: string | null } | null;
};

/**
 * Load succeeded idempotency row for owner+project+requestId (service_role).
 * Used by restore when tip already matches and ops cannot be rebuilt.
 */
export async function loadMixWorkingIdempotencyFor(
  context: AuthContext,
  input: { projectId: string; requestId: string },
): Promise<IdempotencyRow | null> {
  if (!context.userId) {
    throw new AuthError("UNAUTHENTICATED", "Wymagane logowanie.");
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("studio_mix_working_idempotency")
    .select("request_fingerprint, version_after, result_document_digest, result")
    .eq("owner_id", context.userId)
    .eq("project_id", input.projectId)
    .eq("request_id", input.requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as IdempotencyRow;
}

/**
 * Atomic Mix Working apply (A1) with optional A2 revision in the same RPC TX.
 */
export async function applyStudioMixWorkingOpsFor(
  context: AuthContext,
  input: {
    projectId: string;
    expectedDocumentVersion: unknown;
    requestId: unknown;
    ops: unknown;
    revision?: MixWorkingApplyRevisionMeta;
    /**
     * Optional precomputed fingerprint (restore path only).
     * Must be computed server-side — never from client body.
     */
    requestFingerprint?: string;
  },
): Promise<MixWorkingApplyServiceResult> {
  if (!context.userId) {
    throw new AuthError("UNAUTHENTICATED", "Wymagane logowanie.");
  }

  const expected = parseExpectedDocumentVersion(input.expectedDocumentVersion);
  const requestId = parseRequestId(input.requestId);
  const rawOps = Array.isArray(input.ops) ? input.ops : [];
  const recordRevision = input.revision?.recordRevision !== false;
  const restoredFrom = input.revision?.restoredFromRevisionId ?? null;

  const document = await getStudioProjectDocumentFor(context, input.projectId);

  let ops: MixWorkingOp[];
  let patch: MixWorkingPatchPlan;
  let documentDigest: string;
  let nextDocument = document;
  let revisionPayload: Record<string, unknown> | null = null;

  if (document.project.documentVersion === expected) {
    const plan = withDomainMapping(() =>
      applyMixWorkingOpsInMemory({
        document,
        ops: rawOps,
        ownerId: context.userId,
        projectId: input.projectId,
        capturedAt: new Date().toISOString(),
      }),
    );
    ops = plan.ops;
    patch = plan.patch;
    documentDigest = plan.documentDigest;
    nextDocument = plan.nextDocument;

    if (recordRevision) {
      // A3.5-B: do not pre-read or pass parentRevisionId — RPC resolves parent
      // under advisory lock + project FOR UPDATE from tip source_document_version.
      void input.revision?.parentRevisionId;
      const capturedAt = new Date().toISOString();
      const snapshot = withDomainMapping(() =>
        buildMixWorkingSnapshot({
          ownerId: context.userId,
          projectId: input.projectId,
          document: nextDocument,
          capturedAt,
        }),
      );
      const kind: MixRevisionKind = input.revision?.kind ?? "tip_apply";
      revisionPayload = {
        id: randomUUID(),
        kind,
        author: "USER",
        status: "accepted",
        description: input.revision?.description ?? null,
        restoredFromRevisionId: restoredFrom,
        snapshot,
        ops,
      };
    }
  } else {
    ops = withDomainMapping(() =>
      validateMixWorkingOps({ document, ops: rawOps }),
    );
    patch = { tracks: {}, master: {} };
    documentDigest = "0".repeat(64);
    // Replay path: omit revision payload; RPC returns stored revisionId.
  }

  if (
    input.requestFingerprint !== undefined &&
    !/^[a-f0-9]{64}$/.test(input.requestFingerprint)
  ) {
    throw new MixWorkingApplyError(
      "INVALID_REQUEST",
      "Invalid request fingerprint.",
    );
  }

  const requestFingerprint =
    input.requestFingerprint ??
    (restoredFrom && isUuid(restoredFrom)
      ? fingerprintMixWorkingRestoreRequest({
          expectedDocumentVersion: expected,
          restoredFromRevisionId: restoredFrom,
        })
      : fingerprintMixWorkingRequest({
          expectedDocumentVersion: expected,
          ops,
        }));

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("studio_cas_apply_mix_working_ops", {
    p_project_id: input.projectId,
    p_owner_id: context.userId,
    p_expected: expected,
    p_request_id: requestId,
    p_request_fingerprint: requestFingerprint,
    p_patch: patch,
    p_result_document_digest: documentDigest,
    p_revision: revisionPayload,
  });

  if (error) {
    mapRpcError(error.message);
  }

  const row =
    (
      data as
        | Array<{
            document_version: number;
            document_digest: string;
            replay: boolean;
            revision_id: string | null;
          }>
        | null
    )?.[0] ?? null;

  if (!row) {
    throw new StudioFxCasConflictError();
  }

  return {
    documentVersion: Number(row.document_version),
    documentDigest: String(row.document_digest),
    replay: Boolean(row.replay),
    revisionId: row.revision_id ? String(row.revision_id) : null,
  };
}

export async function applyStudioMixWorkingOps(
  input: Parameters<typeof applyStudioMixWorkingOpsFor>[1],
): Promise<MixWorkingApplyServiceResult> {
  return applyStudioMixWorkingOpsFor(await requireUser(), input);
}
