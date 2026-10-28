/**
 * Mix Working Plane — allowlisted ops validation + future CAS plan (pure).
 * Does not PATCH, does not claim atomic multi-op apply.
 */

import { parseStudioFxChainForWrite } from "@/lib/studio/studio-fx-chain";
import {
  parseStudioMasterGainDb,
  parseStudioMasterPan,
} from "@/lib/studio/studio-master-mix";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";
import {
  MixWorkingDomainError,
  type MixWorkingCasApplyPlan,
  type MixWorkingOp,
} from "@/lib/studio/mix-working/mix-working-types";

const FORBIDDEN_OP_KEYS = new Set([
  "sourceTakeId",
  "sourceBeatId",
  "sourceArtifactId",
  "sourceKind",
  "ownerId",
  "projectId",
  "documentVersion",
  "beatId",
  "clipId",
]);

function assertNoForbiddenFields(raw: Record<string, unknown>): void {
  for (const key of Object.keys(raw)) {
    if (FORBIDDEN_OP_KEYS.has(key)) {
      throw new MixWorkingDomainError(
        "FORBIDDEN_FIELD",
        `Operation must not include ${key}.`,
      );
    }
  }
}

function requireTrack(
  document: StudioProjectDocument,
  trackId: string,
): void {
  if (!document.tracks.some((t) => t.id === trackId)) {
    throw new MixWorkingDomainError(
      "NOT_FOUND",
      `Track not found: ${trackId}`,
    );
  }
}

/** Stable createId — write validation must not invent effect ids. */
function rejectMissingFxId(): string {
  throw new MixWorkingDomainError(
    "INVALID",
    "FX effect id is required; cannot invent ids in Mix Working ops.",
  );
}

function validateOneOp(
  op: MixWorkingOp,
  document: StudioProjectDocument,
): MixWorkingOp {
  assertNoForbiddenFields(op as unknown as Record<string, unknown>);

  switch (op.op) {
    case "set_track_controls": {
      requireTrack(document, op.trackId);
      const hasAny =
        op.gainDb !== undefined ||
        op.pan !== undefined ||
        op.muted !== undefined ||
        op.solo !== undefined;
      if (!hasAny) {
        throw new MixWorkingDomainError(
          "INVALID",
          "set_track_controls requires at least one control field.",
        );
      }
      const next: MixWorkingOp = {
        op: "set_track_controls",
        trackId: op.trackId,
      };
      if (op.gainDb !== undefined) {
        next.gainDb = parseStudioMasterGainDb(op.gainDb);
      }
      if (op.pan !== undefined) {
        next.pan = parseStudioMasterPan(op.pan);
      }
      if (op.muted !== undefined) {
        if (typeof op.muted !== "boolean") {
          throw new MixWorkingDomainError("INVALID", "muted must be boolean.");
        }
        next.muted = op.muted;
      }
      if (op.solo !== undefined) {
        if (typeof op.solo !== "boolean") {
          throw new MixWorkingDomainError("INVALID", "solo must be boolean.");
        }
        next.solo = op.solo;
      }
      return next;
    }
    case "set_master_mix": {
      if (op.masterGainDb === undefined && op.masterPan === undefined) {
        throw new MixWorkingDomainError(
          "INVALID",
          "set_master_mix requires masterGainDb and/or masterPan.",
        );
      }
      const next: MixWorkingOp = { op: "set_master_mix" };
      if (op.masterGainDb !== undefined) {
        next.masterGainDb = parseStudioMasterGainDb(op.masterGainDb);
      }
      if (op.masterPan !== undefined) {
        next.masterPan = parseStudioMasterPan(op.masterPan);
      }
      return next;
    }
    case "set_track_fx": {
      requireTrack(document, op.trackId);
      try {
        const effectsChain = parseStudioFxChainForWrite(op.effectsChain, {
          role: "track",
          createId: rejectMissingFxId,
        });
        return {
          op: "set_track_fx",
          trackId: op.trackId,
          effectsChain,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid track FX chain.";
        if (/unsupported|schemaVersion/i.test(message)) {
          throw new MixWorkingDomainError("UNSUPPORTED_FX", message);
        }
        throw new MixWorkingDomainError("INVALID", message);
      }
    }
    case "set_master_fx": {
      try {
        const effectsChain = parseStudioFxChainForWrite(op.effectsChain, {
          role: "master",
          createId: rejectMissingFxId,
        });
        return { op: "set_master_fx", effectsChain };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid master FX chain.";
        if (/unsupported|schemaVersion/i.test(message)) {
          throw new MixWorkingDomainError("UNSUPPORTED_FX", message);
        }
        throw new MixWorkingDomainError("INVALID", message);
      }
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

/**
 * Validate allowlisted ops against tip document + existing P6/master parsers.
 * Does not mutate document. Does not apply ops.
 */
export function validateMixWorkingOps(params: {
  document: StudioProjectDocument;
  ops: readonly unknown[];
}): MixWorkingOp[] {
  if (!Array.isArray(params.ops)) {
    throw new MixWorkingDomainError("INVALID", "ops must be an array.");
  }
  if (params.ops.length === 0) {
    throw new MixWorkingDomainError("INVALID", "ops must not be empty.");
  }

  const validated: MixWorkingOp[] = [];
  for (const raw of params.ops) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new MixWorkingDomainError("INVALID", "Each op must be an object.");
    }
    const record = raw as Record<string, unknown>;
    assertNoForbiddenFields(record);
    if (typeof record.op !== "string") {
      throw new MixWorkingDomainError("UNKNOWN_OP", "op discriminator required.");
    }
    validated.push(
      validateOneOp(record as unknown as MixWorkingOp, params.document),
    );
  }
  return validated;
}

/**
 * Build a validation-only CAS apply plan.
 * Explicitly NOT atomic and NOT executable in A0.
 * Future apply: Owner prefers atomic RPC/CAS (not a PATCH sequence).
 */
export function planMixWorkingCasApply(params: {
  document: StudioProjectDocument;
  ops: readonly unknown[];
}): MixWorkingCasApplyPlan {
  const ops = validateMixWorkingOps(params);
  return {
    kind: "MIX_WORKING_CAS_APPLY_PLAN",
    atomicityRequirement: "REQUIRES_FUTURE_ATOMIC_RPC_CAS",
    baseDocumentVersion: params.document.project.documentVersion,
    ops,
  };
}
