/**
 * Mix Working Plane — proposal freshness, revision factories, restore lineage (pure).
 * No auto-mix. No measurement generation. No tip/API writes.
 */

import type { StudioProjectDocument } from "@/lib/studio/studio-types";
import { validateMixWorkingOps } from "@/lib/studio/mix-working/mix-working-ops";
import { cloneStudioProjectDocument } from "@/lib/studio/mix-working/mix-working-snapshot";
import {
  MixWorkingDomainError,
  type MixProposal,
  type MixProposalFreshness,
  type MixRevision,
  type MixRevisionAuthor,
  type MixRevisionKind,
  type MixRevisionStatus,
  type MixWorkingMeasurementFact,
  type MixWorkingOp,
  type MixWorkingSnapshotV1,
} from "@/lib/studio/mix-working/mix-working-types";

export function isMixProposalStale(params: {
  baseDocumentVersion: number;
  tipDocumentVersion: number;
}): MixProposalFreshness {
  if (
    !Number.isInteger(params.baseDocumentVersion) ||
    params.baseDocumentVersion < 1 ||
    !Number.isInteger(params.tipDocumentVersion) ||
    params.tipDocumentVersion < 1
  ) {
    throw new MixWorkingDomainError(
      "INVALID",
      "document versions must be integers >= 1.",
    );
  }
  if (params.baseDocumentVersion === params.tipDocumentVersion) {
    return { freshness: "CURRENT" };
  }
  return {
    freshness: "STALE",
    baseDocumentVersion: params.baseDocumentVersion,
    tipDocumentVersion: params.tipDocumentVersion,
  };
}

/**
 * Build a MixProposal after validating ops against tip.
 * Measurements are accepted only when provided — never invented.
 * Does not auto-apply. STALE proposals must not be applied by callers.
 */
export function buildMixProposal(params: {
  id: string;
  projectId: string;
  ownerId: string;
  document: StudioProjectDocument;
  ops: readonly unknown[];
  measurements?: readonly MixWorkingMeasurementFact[];
  createdAt: string;
  status?: MixProposal["status"];
}): MixProposal {
  if (!params.id || !params.projectId || !params.ownerId) {
    throw new MixWorkingDomainError(
      "INVALID",
      "id, projectId, ownerId required.",
    );
  }
  if (params.document.project.id !== params.projectId) {
    throw new MixWorkingDomainError(
      "INVALID",
      "Proposal projectId does not match document.",
    );
  }

  const ops = validateMixWorkingOps({
    document: params.document,
    ops: params.ops,
  });

  const measurements = params.measurements
    ? params.measurements.map((m) => ({ ...m }))
    : [];

  return {
    id: params.id,
    projectId: params.projectId,
    ownerId: params.ownerId,
    baseDocumentVersion: params.document.project.documentVersion,
    ops,
    status: params.status ?? "proposed",
    measurements,
    createdAt: params.createdAt,
  };
}

/** Pure revision factory — all identity/time fields supplied by caller. */
export function buildMixRevision(params: {
  id: string;
  projectId: string;
  ownerId: string;
  parentRevisionId: string | null;
  kind: MixRevisionKind;
  author: MixRevisionAuthor;
  status: MixRevisionStatus;
  sourceDocumentVersion: number;
  documentDigest: string;
  snapshot: MixWorkingSnapshotV1 | null;
  ops: MixWorkingOp[] | null;
  proposalId: string | null;
  createdAt: string;
  acceptedAt?: string | null;
  description?: string | null;
  idempotencyRequestId?: string | null;
  restoredFromRevisionId?: string | null;
}): MixRevision {
  if (!params.id || !params.projectId || !params.ownerId) {
    throw new MixWorkingDomainError(
      "INVALID",
      "id, projectId, ownerId required.",
    );
  }
  if (
    !Number.isInteger(params.sourceDocumentVersion) ||
    params.sourceDocumentVersion < 1
  ) {
    throw new MixWorkingDomainError(
      "INVALID",
      "sourceDocumentVersion must be integer >= 1.",
    );
  }
  if (
    typeof params.documentDigest !== "string" ||
    params.documentDigest.length < 1
  ) {
    throw new MixWorkingDomainError("INVALID", "documentDigest required.");
  }

  return {
    id: params.id,
    projectId: params.projectId,
    ownerId: params.ownerId,
    parentRevisionId: params.parentRevisionId,
    kind: params.kind,
    author: params.author,
    status: params.status,
    sourceDocumentVersion: params.sourceDocumentVersion,
    documentDigest: params.documentDigest,
    snapshot: params.snapshot,
    ops: params.ops,
    proposalId: params.proposalId,
    createdAt: params.createdAt,
    acceptedAt: params.acceptedAt ?? null,
    description: params.description ?? null,
    idempotencyRequestId: params.idempotencyRequestId ?? null,
    restoredFromRevisionId: params.restoredFromRevisionId ?? null,
  };
}

/**
 * Domain restore: new revision pointing at parent. Parent object is not mutated.
 * Snapshot document is deep-cloned — no shared mutable reference with parent.
 * Does not write tip / DB / API.
 */
export function buildRestoreRevision(params: {
  newRevisionId: string;
  parent: MixRevision;
  author?: MixRevisionAuthor;
  createdAt: string;
}): { restored: MixRevision; parentUnchanged: MixRevision } {
  if (!params.parent.snapshot) {
    throw new MixWorkingDomainError(
      "INVALID",
      "Restore requires parent snapshot.",
    );
  }

  const parentSnapshot = params.parent.snapshot;
  const parentDocumentClone = cloneStudioProjectDocument(parentSnapshot.document);

  const parentCopy: MixRevision = {
    ...params.parent,
    ops: params.parent.ops ? [...params.parent.ops] : null,
    snapshot: {
      ...parentSnapshot,
      document: parentDocumentClone,
    },
  };

  const restoredDocument = cloneStudioProjectDocument(parentSnapshot.document);

  const restored = buildMixRevision({
    id: params.newRevisionId,
    projectId: params.parent.projectId,
    ownerId: params.parent.ownerId,
    parentRevisionId: params.parent.id,
    kind: "restored",
    author: params.author ?? "USER",
    status: "draft",
    sourceDocumentVersion: params.parent.sourceDocumentVersion,
    documentDigest: params.parent.documentDigest,
    snapshot: {
      ...parentSnapshot,
      capturedAt: params.createdAt,
      document: restoredDocument,
    },
    ops: null,
    proposalId: null,
    createdAt: params.createdAt,
    acceptedAt: null,
  });

  return { restored, parentUnchanged: parentCopy };
}

/**
 * Guard for future apply paths (pure — no status mutation, no I/O).
 * Rejects proposal.status rejected|stale even when tip version matches base.
 * Also rejects version freshness STALE independently of status.
 */
export function assertMixProposalApplicable(params: {
  proposal: MixProposal;
  tipDocumentVersion: number;
}): void {
  if (
    params.proposal.status === "rejected" ||
    params.proposal.status === "stale"
  ) {
    throw new MixWorkingDomainError(
      "INVALID",
      `Proposal status ${params.proposal.status} is not applicable.`,
    );
  }

  const freshness = isMixProposalStale({
    baseDocumentVersion: params.proposal.baseDocumentVersion,
    tipDocumentVersion: params.tipDocumentVersion,
  });
  if (freshness.freshness === "STALE") {
    throw new MixWorkingDomainError(
      "STALE",
      `Proposal is STALE (base=${freshness.baseDocumentVersion}, tip=${freshness.tipDocumentVersion}).`,
    );
  }
}
