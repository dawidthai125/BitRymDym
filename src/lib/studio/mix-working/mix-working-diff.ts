/**
 * Mix Working Plane — deterministic revision/document diff (A2, pure).
 * Allowlisted tip mix fields only. No clip/identity comparison as editable delta.
 */

import { canonicalJsonStringify } from "@/lib/audio/studio-export-document-snapshot";
import type { StudioFxChainV1 } from "@/lib/studio/studio-fx-chain";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";
import {
  MixWorkingDomainError,
  type MixRevision,
  type MixWorkingSnapshotV1,
} from "@/lib/studio/mix-working/mix-working-types";

export type MixWorkingFieldChange = {
  path: string;
  before: unknown;
  after: unknown;
};

export type MixWorkingRevisionDiff = {
  kind: "MIX_WORKING_REVISION_DIFF";
  projectId: string;
  fromRevisionId: string | null;
  toRevisionId: string | null;
  fromDocumentVersion: number;
  toDocumentVersion: number;
  fromDigest: string;
  toDigest: string;
  changes: MixWorkingFieldChange[];
  /** Identity/clip mismatches — restore must fail if any. */
  identityConflicts: string[];
};

function fxKey(chain: StudioFxChainV1 | null | undefined): string {
  return canonicalJsonStringify(chain ?? { schemaVersion: 1, effects: [] });
}

function pushChange(
  out: MixWorkingFieldChange[],
  path: string,
  before: unknown,
  after: unknown,
): void {
  if (before === after) return;
  if (
    typeof before === "object" ||
    typeof after === "object" ||
    before !== after
  ) {
    if (
      typeof before === "object" &&
      typeof after === "object" &&
      before !== null &&
      after !== null &&
      canonicalJsonStringify(before) === canonicalJsonStringify(after)
    ) {
      return;
    }
    out.push({ path, before, after });
  }
}

/**
 * Diff allowlisted mix tip fields between two documents.
 * Reports identityConflicts when clip/source fields diverge (not editable deltas).
 */
export function diffMixWorkingDocuments(params: {
  projectId: string;
  before: StudioProjectDocument;
  after: StudioProjectDocument;
  fromRevisionId?: string | null;
  toRevisionId?: string | null;
}): MixWorkingRevisionDiff {
  if (
    params.before.project.id !== params.projectId ||
    params.after.project.id !== params.projectId
  ) {
    throw new MixWorkingDomainError(
      "INVALID",
      "Diff projectId does not match document.project.id.",
    );
  }

  const changes: MixWorkingFieldChange[] = [];
  const identityConflicts: string[] = [];

  pushChange(
    changes,
    "project.masterGainDb",
    params.before.project.masterGainDb,
    params.after.project.masterGainDb,
  );
  pushChange(
    changes,
    "project.masterPan",
    params.before.project.masterPan,
    params.after.project.masterPan,
  );
  if (
    fxKey(params.before.project.masterFxChain) !==
    fxKey(params.after.project.masterFxChain)
  ) {
    changes.push({
      path: "project.masterFxChain",
      before: params.before.project.masterFxChain,
      after: params.after.project.masterFxChain,
    });
  }

  if (params.before.project.beatId !== params.after.project.beatId) {
    identityConflicts.push("project.beatId");
  }

  const beforeTracks = new Map(params.before.tracks.map((t) => [t.id, t]));
  const afterTracks = new Map(params.after.tracks.map((t) => [t.id, t]));
  const trackIds = [
    ...new Set([...beforeTracks.keys(), ...afterTracks.keys()]),
  ].sort();

  for (const id of trackIds) {
    const b = beforeTracks.get(id);
    const a = afterTracks.get(id);
    if (!b || !a) {
      identityConflicts.push(`tracks.${id}.presence`);
      continue;
    }
    pushChange(changes, `tracks.${id}.gainDb`, b.gainDb, a.gainDb);
    pushChange(changes, `tracks.${id}.pan`, b.pan, a.pan);
    pushChange(changes, `tracks.${id}.muted`, b.muted, a.muted);
    pushChange(changes, `tracks.${id}.solo`, b.solo, a.solo);
    if (fxKey(b.effectsChain) !== fxKey(a.effectsChain)) {
      changes.push({
        path: `tracks.${id}.effectsChain`,
        before: b.effectsChain,
        after: a.effectsChain,
      });
    }
    if (b.trackType !== a.trackType) {
      identityConflicts.push(`tracks.${id}.trackType`);
    }
  }

  const beforeClips = [...params.before.clips].sort((x, y) =>
    x.id.localeCompare(y.id),
  );
  const afterClips = [...params.after.clips].sort((x, y) =>
    x.id.localeCompare(y.id),
  );
  if (beforeClips.length !== afterClips.length) {
    identityConflicts.push("clips.length");
  } else {
    for (let i = 0; i < beforeClips.length; i++) {
      const b = beforeClips[i]!;
      const a = afterClips[i]!;
      if (
        b.id !== a.id ||
        b.trackId !== a.trackId ||
        b.sourceKind !== a.sourceKind ||
        b.sourceTakeId !== a.sourceTakeId ||
        b.sourceBeatId !== a.sourceBeatId ||
        b.sourceArtifactId !== a.sourceArtifactId
      ) {
        identityConflicts.push(`clips.${b.id}.identity`);
      }
    }
  }

  return {
    kind: "MIX_WORKING_REVISION_DIFF",
    projectId: params.projectId,
    fromRevisionId: params.fromRevisionId ?? null,
    toRevisionId: params.toRevisionId ?? null,
    fromDocumentVersion: params.before.project.documentVersion,
    toDocumentVersion: params.after.project.documentVersion,
    fromDigest: "", // filled by callers that have digests
    toDigest: "",
    changes,
    identityConflicts,
  };
}

export function diffMixWorkingSnapshots(params: {
  from: MixWorkingSnapshotV1;
  to: MixWorkingSnapshotV1;
  fromRevisionId?: string | null;
  toRevisionId?: string | null;
}): MixWorkingRevisionDiff {
  if (params.from.projectId !== params.to.projectId) {
    throw new MixWorkingDomainError(
      "INVALID",
      "Cannot diff snapshots from different projects.",
    );
  }
  if (params.from.ownerId !== params.to.ownerId) {
    throw new MixWorkingDomainError(
      "INVALID",
      "Cannot diff snapshots from different owners.",
    );
  }
  const diff = diffMixWorkingDocuments({
    projectId: params.from.projectId,
    before: params.from.document,
    after: params.to.document,
    fromRevisionId: params.fromRevisionId,
    toRevisionId: params.toRevisionId,
  });
  return {
    ...diff,
    fromDigest: params.from.documentDigest,
    toDigest: params.to.documentDigest,
    fromDocumentVersion: params.from.sourceDocumentVersion,
    toDocumentVersion: params.to.sourceDocumentVersion,
  };
}

export function diffMixWorkingRevisions(params: {
  from: MixRevision;
  to: MixRevision;
}): MixWorkingRevisionDiff {
  if (params.from.projectId !== params.to.projectId) {
    throw new MixWorkingDomainError(
      "INVALID",
      "Cannot compare revisions from different projects.",
    );
  }
  if (params.from.ownerId !== params.to.ownerId) {
    throw new MixWorkingDomainError(
      "INVALID",
      "Cannot compare revisions from different owners.",
    );
  }
  if (!params.from.snapshot || !params.to.snapshot) {
    throw new MixWorkingDomainError(
      "INVALID",
      "Both revisions require snapshots for compare.",
    );
  }
  return diffMixWorkingSnapshots({
    from: params.from.snapshot,
    to: params.to.snapshot,
    fromRevisionId: params.from.id,
    toRevisionId: params.to.id,
  });
}
