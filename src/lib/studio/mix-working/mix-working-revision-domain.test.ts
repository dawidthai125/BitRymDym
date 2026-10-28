/**
 * A2 — Mix Working revision diff + restore ops (pure domain).
 */

import { describe, expect, it } from "vitest";

import { emptyStudioFxChain } from "@/lib/studio/studio-fx-chain";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";
import { applyMixWorkingOpsInMemory } from "@/lib/studio/mix-working/mix-working-apply";
import {
  diffMixWorkingDocuments,
  diffMixWorkingRevisions,
} from "@/lib/studio/mix-working/mix-working-diff";
import { buildMixRevision } from "@/lib/studio/mix-working/mix-working-proposal";
import {
  fingerprintMixWorkingRequest,
  fingerprintMixWorkingRestoreRequest,
} from "@/lib/studio/mix-working/mix-working-fingerprint";
import { buildRestoreOpsFromSnapshot } from "@/lib/studio/mix-working/mix-working-restore-ops";
import { buildMixWorkingSnapshot } from "@/lib/studio/mix-working/mix-working-snapshot";
import { MixWorkingDomainError } from "@/lib/studio/mix-working/mix-working-types";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const TRACK_ID = "t1";
const TAKE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CAPTURED = "2026-10-20T12:00:00.000Z";

function baseDocument(
  overrides?: Partial<StudioProjectDocument>,
): StudioProjectDocument {
  return {
    project: {
      id: PROJECT_ID,
      title: "WP Rev",
      status: "ACTIVE",
      tempoBpm: 120,
      timelineLengthMs: 60_000,
      beatId: null,
      updatedAt: CAPTURED,
      createdAt: CAPTURED,
      timeSignatureNum: 4,
      timeSignatureDen: 4,
      masterGainDb: 0,
      masterPan: 0,
      masterFxChain: emptyStudioFxChain(),
      documentVersion: 3,
      schemaVersion: 1,
    },
    tracks: [
      {
        id: TRACK_ID,
        projectId: PROJECT_ID,
        name: "Vox",
        trackType: "VOCAL",
        sortOrder: 0,
        gainDb: 0,
        pan: 0,
        muted: false,
        solo: false,
        recordArmed: false,
        inputDeviceHint: null,
        outputRoute: "master",
        effectsChain: emptyStudioFxChain(),
      },
    ],
    clips: [
      {
        id: "c1",
        trackId: TRACK_ID,
        sourceKind: "TAKE",
        sourceTakeId: TAKE_A,
        sourceBeatId: null,
        sourceArtifactId: null,
        timelineStartMs: 0,
        durationMs: 1000,
        sourceOffsetMs: 0,
        gainDb: 0,
        muted: false,
        fadeInMs: 0,
        fadeOutMs: 0,
      },
    ],
    ...overrides,
  };
}

describe("A2 Mix Working — revision diff", () => {
  it("diffs allowlisted mix fields deterministically", () => {
    const before = baseDocument();
    const afterPlan = applyMixWorkingOpsInMemory({
      document: before,
      ops: [
        { op: "set_track_controls", trackId: TRACK_ID, gainDb: -6, muted: true },
        { op: "set_master_mix", masterGainDb: -2 },
      ],
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      capturedAt: CAPTURED,
    });
    const diff = diffMixWorkingDocuments({
      projectId: PROJECT_ID,
      before,
      after: afterPlan.nextDocument,
    });
    expect(diff.identityConflicts).toEqual([]);
    expect(diff.changes.map((c) => c.path).sort()).toEqual([
      "project.masterGainDb",
      "tracks.t1.gainDb",
      "tracks.t1.muted",
    ]);
  });

  it("rejects cross-project revision compare", () => {
    const snap = buildMixWorkingSnapshot({
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      document: baseDocument(),
      capturedAt: CAPTURED,
    });
    const a = buildMixRevision({
      id: "r1",
      projectId: PROJECT_ID,
      ownerId: OWNER_ID,
      parentRevisionId: null,
      kind: "tip_apply",
      author: "USER",
      status: "accepted",
      sourceDocumentVersion: 3,
      documentDigest: snap.documentDigest,
      snapshot: snap,
      ops: null,
      proposalId: null,
      createdAt: CAPTURED,
    });
    const b = {
      ...a,
      id: "r2",
      projectId: "99999999-9999-4999-8999-999999999999",
    };
    expect(() => diffMixWorkingRevisions({ from: a, to: b })).toThrow(
      MixWorkingDomainError,
    );
  });

  it("flags clip identity conflicts", () => {
    const before = baseDocument();
    const after = baseDocument();
    after.clips[0]!.sourceTakeId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const diff = diffMixWorkingDocuments({
      projectId: PROJECT_ID,
      before,
      after,
    });
    expect(diff.identityConflicts.some((c) => c.includes("identity"))).toBe(
      true,
    );
  });
});

describe("A2 Mix Working — restore ops", () => {
  it("builds ops from tip to prior snapshot without mutating tip", () => {
    const tip = baseDocument({
      project: { ...baseDocument().project, documentVersion: 5, masterGainDb: -3 },
      tracks: [
        {
          ...baseDocument().tracks[0]!,
          gainDb: -8,
          muted: true,
        },
      ],
    });
    const targetDoc = baseDocument();
    const target = buildMixWorkingSnapshot({
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      document: targetDoc,
      capturedAt: CAPTURED,
    });
    const tipJson = JSON.stringify(tip);
    const ops = buildRestoreOpsFromSnapshot({ tip, target });
    expect(JSON.stringify(tip)).toBe(tipJson);
    expect(ops.length).toBeGreaterThan(0);
    const applied = applyMixWorkingOpsInMemory({
      document: tip,
      ops,
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      capturedAt: CAPTURED,
    });
    expect(applied.nextDocument.tracks[0]!.gainDb).toBe(0);
    expect(applied.nextDocument.tracks[0]!.muted).toBe(false);
    expect(applied.nextDocument.project.masterGainDb).toBe(0);
    expect(applied.nextDocument.clips[0]!.sourceTakeId).toBe(TAKE_A);
  });

  it("rejects restore when identity diverges", () => {
    const tip = baseDocument();
    const targetDoc = baseDocument();
    targetDoc.clips[0]!.sourceTakeId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const target = buildMixWorkingSnapshot({
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      document: targetDoc,
      capturedAt: CAPTURED,
    });
    expect(() => buildRestoreOpsFromSnapshot({ tip, target })).toThrow(
      MixWorkingDomainError,
    );
  });

  it("restore fingerprint is tip-independent and distinct from ops fingerprint", () => {
    const revId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const a = fingerprintMixWorkingRestoreRequest({
      expectedDocumentVersion: 5,
      restoredFromRevisionId: revId,
    });
    const b = fingerprintMixWorkingRestoreRequest({
      expectedDocumentVersion: 5,
      restoredFromRevisionId: revId.toUpperCase(),
    });
    const otherRev = fingerprintMixWorkingRestoreRequest({
      expectedDocumentVersion: 5,
      restoredFromRevisionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    const otherVer = fingerprintMixWorkingRestoreRequest({
      expectedDocumentVersion: 6,
      restoredFromRevisionId: revId,
    });
    const opsFp = fingerprintMixWorkingRequest({
      expectedDocumentVersion: 5,
      ops: [{ op: "set_master_mix", masterGainDb: -1 }],
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toBe(otherRev);
    expect(a).not.toBe(otherVer);
    expect(a).not.toBe(opsFp);
  });
});
