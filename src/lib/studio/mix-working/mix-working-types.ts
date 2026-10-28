/**
 * Studio Mix Working Plane — A0 pure domain types.
 * Tip SSOT remains StudioProjectDocument. Revisions are lineage, not a second tip.
 * No I/O. No ID/time generation inside consumers — pass values in.
 */

import type { StudioFxChainV1 } from "@/lib/studio/studio-fx-chain";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";

export const MIX_WORKING_SNAPSHOT_KIND = "MIX_WORKING" as const;

export const MIX_REVISION_KINDS = [
  "baseline",
  "manual_checkpoint",
  "auto_proposal",
  "accepted",
  "rejected",
  "restored",
  /** Durable tip apply via A1 atomic RPC (A2 persistence). */
  "tip_apply",
] as const;
export type MixRevisionKind = (typeof MIX_REVISION_KINDS)[number];

export const MIX_REVISION_STATUSES = [
  "draft",
  "proposed",
  "accepted",
  "rejected",
  "superseded",
] as const;
export type MixRevisionStatus = (typeof MIX_REVISION_STATUSES)[number];

export const MIX_REVISION_AUTHORS = ["USER", "AUTOMATION", "AI"] as const;
export type MixRevisionAuthor = (typeof MIX_REVISION_AUTHORS)[number];

export const MIX_PROPOSAL_STATUSES = [
  "proposed",
  "accepted",
  "rejected",
  "stale",
  "no_change",
] as const;
export type MixProposalStatus = (typeof MIX_PROPOSAL_STATUSES)[number];

/** Optional measurement facts supplied by callers — never invented here. */
export type MixWorkingMeasurementFact = {
  metric: string;
  value: number;
  unit: string;
  windowMs?: number;
};

export type MixWorkingSnapshotV1 = {
  snapshotKind: typeof MIX_WORKING_SNAPSHOT_KIND;
  ownerId: string;
  projectId: string;
  sourceDocumentVersion: number;
  documentDigest: string;
  /** ISO-8601 string supplied by caller (pure — no Date.now()). */
  capturedAt: string;
  document: StudioProjectDocument;
};

export type MixRevision = {
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
  /** ISO-8601 string supplied by caller. */
  createdAt: string;
  acceptedAt: string | null;
  /** Optional human description (persist layer / API). */
  description?: string | null;
  /** Links revision to A1 idempotency request (unique when set). */
  idempotencyRequestId?: string | null;
  /** For kind=restored: source revision id. */
  restoredFromRevisionId?: string | null;
};

/**
 * Allowlisted tip mutations only.
 * Forbidden: source TAKE/BEAT/ARTIFACT ids, owner, project, documentVersion, clip geometry.
 */
export type MixWorkingOp =
  | {
      op: "set_track_controls";
      trackId: string;
      gainDb?: number;
      pan?: number;
      muted?: boolean;
      solo?: boolean;
    }
  | {
      op: "set_master_mix";
      masterGainDb?: number;
      masterPan?: number;
    }
  | {
      op: "set_track_fx";
      trackId: string;
      effectsChain: StudioFxChainV1;
    }
  | {
      op: "set_master_fx";
      effectsChain: StudioFxChainV1;
    };

export type MixProposal = {
  id: string;
  projectId: string;
  ownerId: string;
  baseDocumentVersion: number;
  ops: MixWorkingOp[];
  status: MixProposalStatus;
  /** Caller-supplied only; empty when none provided. */
  measurements: MixWorkingMeasurementFact[];
  /** ISO-8601 string supplied by caller. */
  createdAt: string;
};

export type MixProposalFreshness =
  | { freshness: "CURRENT" }
  | { freshness: "STALE"; baseDocumentVersion: number; tipDocumentVersion: number };

/**
 * Validated plan for a *future* atomic apply path.
 * A0 does not perform PATCH/RPC and does not claim atomicity.
 */
export type MixWorkingCasApplyPlan = {
  kind: "MIX_WORKING_CAS_APPLY_PLAN";
  /** Explicit: multi-op apply requires a future atomic RPC/CAS (Owner direction). */
  atomicityRequirement: "REQUIRES_FUTURE_ATOMIC_RPC_CAS";
  baseDocumentVersion: number;
  ops: MixWorkingOp[];
};

export type MixWorkingDomainErrorCode =
  | "INVALID"
  | "LIMIT"
  | "UNKNOWN_OP"
  | "UNSUPPORTED_FX"
  | "FORBIDDEN_FIELD"
  | "STALE"
  | "NOT_FOUND";

export class MixWorkingDomainError extends Error {
  readonly code: MixWorkingDomainErrorCode;

  constructor(code: MixWorkingDomainErrorCode, message: string) {
    super(message);
    this.name = "MixWorkingDomainError";
    this.code = code;
  }
}
