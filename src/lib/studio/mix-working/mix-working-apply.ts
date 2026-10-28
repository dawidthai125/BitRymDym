/**
 * Mix Working Plane — pure in-memory apply → patch plan (A1).
 * No I/O. Tip input document is never mutated.
 */

import {
  assertStudioDocumentWithinExportLimits,
  digestStudioDocument,
} from "@/lib/audio/studio-export-document-snapshot";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import type { StudioFxChainV1 } from "@/lib/studio/studio-fx-chain";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";
import { validateMixWorkingOps } from "@/lib/studio/mix-working/mix-working-ops";
import {
  assertMixWorkingSnapshotWithinByteLimit,
  buildMixWorkingSnapshot,
  cloneStudioProjectDocument,
} from "@/lib/studio/mix-working/mix-working-snapshot";
import {
  MixWorkingDomainError,
  type MixWorkingOp,
} from "@/lib/studio/mix-working/mix-working-types";

/** Closed allowlist for SQL RPC p_patch (snake_case column names). */
export type MixWorkingTrackPatch = {
  gain_db?: number;
  pan?: number;
  muted?: boolean;
  solo?: boolean;
  effects_chain?: StudioFxChainV1;
};

export type MixWorkingMasterPatch = {
  master_gain_db?: number;
  master_pan?: number;
  master_fx_chain?: StudioFxChainV1;
};

export type MixWorkingPatchPlan = {
  tracks: Record<string, MixWorkingTrackPatch>;
  master: MixWorkingMasterPatch;
};

export type MixWorkingApplyResult = {
  /** Validated ops in apply order. */
  ops: MixWorkingOp[];
  /** Tip version the plan was built against. */
  baseDocumentVersion: number;
  /** Independent next tip (not written). */
  nextDocument: StudioProjectDocument;
  documentDigest: string;
  patch: MixWorkingPatchPlan;
};

function applyOneOp(
  doc: StudioProjectDocument,
  op: MixWorkingOp,
): void {
  switch (op.op) {
    case "set_track_controls": {
      const track = doc.tracks.find((t) => t.id === op.trackId);
      if (!track) {
        throw new MixWorkingDomainError("NOT_FOUND", `Track not found: ${op.trackId}`);
      }
      if (op.gainDb !== undefined) track.gainDb = op.gainDb;
      if (op.pan !== undefined) track.pan = op.pan;
      if (op.muted !== undefined) track.muted = op.muted;
      if (op.solo !== undefined) track.solo = op.solo;
      return;
    }
    case "set_master_mix": {
      if (op.masterGainDb !== undefined) {
        doc.project.masterGainDb = op.masterGainDb;
      }
      if (op.masterPan !== undefined) {
        doc.project.masterPan = op.masterPan;
      }
      return;
    }
    case "set_track_fx": {
      const track = doc.tracks.find((t) => t.id === op.trackId);
      if (!track) {
        throw new MixWorkingDomainError("NOT_FOUND", `Track not found: ${op.trackId}`);
      }
      track.effectsChain = op.effectsChain;
      return;
    }
    case "set_master_fx": {
      doc.project.masterFxChain = op.effectsChain;
      return;
    }
    default: {
      const unknown = op as { op?: string };
      throw new MixWorkingDomainError(
        "UNKNOWN_OP",
        `Unknown Mix Working op: ${String(unknown?.op)}`,
      );
    }
  }
}

function buildPatchPlan(
  before: StudioProjectDocument,
  after: StudioProjectDocument,
  ops: MixWorkingOp[],
): MixWorkingPatchPlan {
  const tracks: Record<string, MixWorkingTrackPatch> = {};
  const master: MixWorkingMasterPatch = {};
  const touchedTrackIds = new Set<string>();

  for (const op of ops) {
    if (op.op === "set_track_controls" || op.op === "set_track_fx") {
      touchedTrackIds.add(op.trackId);
    }
    if (op.op === "set_master_mix") {
      if (op.masterGainDb !== undefined) {
        master.master_gain_db = after.project.masterGainDb;
      }
      if (op.masterPan !== undefined) {
        master.master_pan = after.project.masterPan;
      }
    }
    if (op.op === "set_master_fx") {
      master.master_fx_chain = after.project.masterFxChain;
    }
  }

  for (const trackId of touchedTrackIds) {
    const b = before.tracks.find((t) => t.id === trackId);
    const a = after.tracks.find((t) => t.id === trackId);
    if (!b || !a) {
      throw new MixWorkingDomainError("NOT_FOUND", `Track not found: ${trackId}`);
    }
    const patch: MixWorkingTrackPatch = {};
    if (a.gainDb !== b.gainDb) patch.gain_db = a.gainDb;
    if (a.pan !== b.pan) patch.pan = a.pan;
    if (a.muted !== b.muted) patch.muted = a.muted;
    if (a.solo !== b.solo) patch.solo = a.solo;
    if (JSON.stringify(a.effectsChain) !== JSON.stringify(b.effectsChain)) {
      patch.effects_chain = a.effectsChain;
    }
    if (Object.keys(patch).length > 0) {
      tracks[trackId] = patch;
    }
  }

  return { tracks, master };
}

/**
 * Validate ops, apply on a deep clone, enforce limits, build SQL patch plan.
 */
export function applyMixWorkingOpsInMemory(params: {
  document: StudioProjectDocument;
  ops: readonly unknown[];
  ownerId: string;
  projectId: string;
  capturedAt: string;
}): MixWorkingApplyResult {
  if (params.document.project.id !== params.projectId) {
    throw new MixWorkingDomainError(
      "INVALID",
      "projectId does not match document.project.id.",
    );
  }

  const ops = validateMixWorkingOps({
    document: params.document,
    ops: params.ops,
  });

  const beforeClips = JSON.stringify(params.document.clips);
  const nextDocument = cloneStudioProjectDocument(params.document);

  for (const op of ops) {
    applyOneOp(nextDocument, op);
  }

  // Tip version on nextDocument stays as base (CAS bump is RPC-only).
  if (JSON.stringify(nextDocument.clips) !== beforeClips) {
    throw new MixWorkingDomainError(
      "FORBIDDEN_FIELD",
      "Mix Working apply must not mutate clips or source identity.",
    );
  }

  try {
    assertStudioDocumentWithinExportLimits(nextDocument);
  } catch (error) {
    if (error instanceof RenderJobDomainError) {
      throw new MixWorkingDomainError("LIMIT", error.message);
    }
    throw error;
  }

  // Byte limit on Working Plane snapshot envelope of the *next* tip.
  const snap = buildMixWorkingSnapshot({
    ownerId: params.ownerId,
    projectId: params.projectId,
    document: nextDocument,
    capturedAt: params.capturedAt,
  });
  assertMixWorkingSnapshotWithinByteLimit(snap);

  // CAS bump is applied only by RPC; digest the post-apply tip version.
  nextDocument.project.documentVersion =
    params.document.project.documentVersion + 1;
  const documentDigest = digestStudioDocument(nextDocument);
  const patch = buildPatchPlan(params.document, nextDocument, ops);

  return {
    ops,
    baseDocumentVersion: params.document.project.documentVersion,
    nextDocument,
    documentDigest,
    patch,
  };
}
