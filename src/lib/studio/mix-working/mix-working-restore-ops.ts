/**
 * Mix Working Plane — build allowlisted ops to move tip → restore target (A2, pure).
 */

import type { StudioProjectDocument } from "@/lib/studio/studio-types";
import { diffMixWorkingDocuments } from "@/lib/studio/mix-working/mix-working-diff";
import { validateMixWorkingOps } from "@/lib/studio/mix-working/mix-working-ops";
import {
  MixWorkingDomainError,
  type MixWorkingOp,
  type MixWorkingSnapshotV1,
} from "@/lib/studio/mix-working/mix-working-types";

/**
 * Produce validated ops that transform current tip into the mix plane of target.
 * Rejects identity conflicts. Empty ops → INVALID (nothing to restore).
 */
export function buildRestoreOpsFromSnapshot(params: {
  tip: StudioProjectDocument;
  target: MixWorkingSnapshotV1;
}): MixWorkingOp[] {
  if (params.target.projectId !== params.tip.project.id) {
    throw new MixWorkingDomainError(
      "INVALID",
      "Restore snapshot projectId does not match tip.",
    );
  }
  if (params.target.document.project.id !== params.tip.project.id) {
    throw new MixWorkingDomainError(
      "INVALID",
      "Restore snapshot document project mismatch.",
    );
  }

  const diff = diffMixWorkingDocuments({
    projectId: params.tip.project.id,
    before: params.tip,
    after: params.target.document,
  });

  if (diff.identityConflicts.length > 0) {
    throw new MixWorkingDomainError(
      "FORBIDDEN_FIELD",
      `Restore blocked by identity conflicts: ${diff.identityConflicts.join(", ")}`,
    );
  }

  const ops: MixWorkingOp[] = [];
  const targetTracks = new Map(
    params.target.document.tracks.map((t) => [t.id, t]),
  );

  for (const change of diff.changes) {
    if (change.path === "project.masterGainDb") {
      ops.push({
        op: "set_master_mix",
        masterGainDb: params.target.document.project.masterGainDb,
      });
      continue;
    }
    if (change.path === "project.masterPan") {
      ops.push({
        op: "set_master_mix",
        masterPan: params.target.document.project.masterPan,
      });
      continue;
    }
    if (change.path === "project.masterFxChain") {
      ops.push({
        op: "set_master_fx",
        effectsChain: params.target.document.project.masterFxChain,
      });
      continue;
    }

    const trackGain = /^tracks\.([^.]+)\.gainDb$/.exec(change.path);
    if (trackGain) {
      const track = targetTracks.get(trackGain[1]!);
      if (!track) continue;
      ops.push({
        op: "set_track_controls",
        trackId: track.id,
        gainDb: track.gainDb,
      });
      continue;
    }
    const trackPan = /^tracks\.([^.]+)\.pan$/.exec(change.path);
    if (trackPan) {
      const track = targetTracks.get(trackPan[1]!);
      if (!track) continue;
      ops.push({
        op: "set_track_controls",
        trackId: track.id,
        pan: track.pan,
      });
      continue;
    }
    const trackMuted = /^tracks\.([^.]+)\.muted$/.exec(change.path);
    if (trackMuted) {
      const track = targetTracks.get(trackMuted[1]!);
      if (!track) continue;
      ops.push({
        op: "set_track_controls",
        trackId: track.id,
        muted: track.muted,
      });
      continue;
    }
    const trackSolo = /^tracks\.([^.]+)\.solo$/.exec(change.path);
    if (trackSolo) {
      const track = targetTracks.get(trackSolo[1]!);
      if (!track) continue;
      ops.push({
        op: "set_track_controls",
        trackId: track.id,
        solo: track.solo,
      });
      continue;
    }
    const trackFx = /^tracks\.([^.]+)\.effectsChain$/.exec(change.path);
    if (trackFx) {
      const track = targetTracks.get(trackFx[1]!);
      if (!track) continue;
      ops.push({
        op: "set_track_fx",
        trackId: track.id,
        effectsChain: track.effectsChain,
      });
    }
  }

  // Coalesce consecutive set_track_controls / set_master_mix for same target.
  const coalesced = coalesceRestoreOps(ops);
  if (coalesced.length === 0) {
    throw new MixWorkingDomainError(
      "INVALID",
      "Restore target matches tip mix plane (no ops).",
    );
  }

  return validateMixWorkingOps({
    document: params.tip,
    ops: coalesced,
  });
}

function coalesceRestoreOps(ops: MixWorkingOp[]): MixWorkingOp[] {
  const trackControls = new Map<
    string,
    Extract<MixWorkingOp, { op: "set_track_controls" }>
  >();
  let masterMix: Extract<MixWorkingOp, { op: "set_master_mix" }> | null = null;
  const trackFx = new Map<
    string,
    Extract<MixWorkingOp, { op: "set_track_fx" }>
  >();
  let masterFx: Extract<MixWorkingOp, { op: "set_master_fx" }> | null = null;

  for (const op of ops) {
    if (op.op === "set_track_controls") {
      const prev = trackControls.get(op.trackId) ?? {
        op: "set_track_controls" as const,
        trackId: op.trackId,
      };
      trackControls.set(op.trackId, {
        ...prev,
        ...(op.gainDb !== undefined ? { gainDb: op.gainDb } : {}),
        ...(op.pan !== undefined ? { pan: op.pan } : {}),
        ...(op.muted !== undefined ? { muted: op.muted } : {}),
        ...(op.solo !== undefined ? { solo: op.solo } : {}),
      });
    } else if (op.op === "set_master_mix") {
      masterMix = {
        op: "set_master_mix",
        ...(masterMix ?? {}),
        ...(op.masterGainDb !== undefined
          ? { masterGainDb: op.masterGainDb }
          : {}),
        ...(op.masterPan !== undefined ? { masterPan: op.masterPan } : {}),
      };
    } else if (op.op === "set_track_fx") {
      trackFx.set(op.trackId, op);
    } else if (op.op === "set_master_fx") {
      masterFx = op;
    }
  }

  const out: MixWorkingOp[] = [];
  for (const id of [...trackControls.keys()].sort()) {
    out.push(trackControls.get(id)!);
  }
  for (const id of [...trackFx.keys()].sort()) {
    out.push(trackFx.get(id)!);
  }
  if (masterMix) out.push(masterMix);
  if (masterFx) out.push(masterFx);
  return out;
}
