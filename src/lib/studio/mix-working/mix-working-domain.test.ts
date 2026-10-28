/**
 * A0 — Studio Mix Working Plane pure domain tests.
 * No I/O, no DB, no network.
 */

import { describe, expect, it } from "vitest";

import {
  STUDIO_EXPORT_MAX_SNAPSHOT_BYTES,
  STUDIO_EXPORT_MAX_TRACKS,
} from "@/config/audio-render";
import { digestStudioDocument } from "@/lib/audio/studio-export-document-snapshot";
import {
  defaultStudioFxParams,
  emptyStudioFxChain,
} from "@/lib/studio/studio-fx-chain";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";
import { applyMixWorkingOpsInMemory } from "@/lib/studio/mix-working/mix-working-apply";
import { fingerprintMixWorkingRequest } from "@/lib/studio/mix-working/mix-working-fingerprint";
import {
  planMixWorkingCasApply,
  validateMixWorkingOps,
} from "@/lib/studio/mix-working/mix-working-ops";
import {
  assertMixProposalApplicable,
  buildMixProposal,
  buildMixRevision,
  buildRestoreRevision,
  isMixProposalStale,
} from "@/lib/studio/mix-working/mix-working-proposal";
import {
  buildMixWorkingSnapshot,
  cloneStudioProjectDocument,
  digestMixWorkingDocument,
} from "@/lib/studio/mix-working/mix-working-snapshot";
import {
  MixWorkingDomainError,
  type MixRevision,
} from "@/lib/studio/mix-working/mix-working-types";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const TAKE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BEAT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TRACK_ID = "t1";
const FX_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const CAPTURED = "2026-10-20T12:00:00.000Z";

function baseDocument(
  overrides?: Partial<StudioProjectDocument>,
): StudioProjectDocument {
  return {
    project: {
      id: PROJECT_ID,
      title: "WP Test",
      status: "ACTIVE",
      tempoBpm: 120,
      timelineLengthMs: 60_000,
      beatId: BEAT_ID,
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
      {
        id: "c2",
        trackId: TRACK_ID,
        sourceKind: "BEAT_REF",
        sourceTakeId: null,
        sourceBeatId: BEAT_ID,
        sourceArtifactId: null,
        timelineStartMs: 0,
        durationMs: 5000,
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

describe("A0 Mix Working — snapshot + digest", () => {
  it("reuses canonical digestStudioDocument (stable)", () => {
    const doc = baseDocument();
    const a = digestMixWorkingDocument(doc);
    const b = digestStudioDocument(doc);
    const c = digestMixWorkingDocument(cloneStudioProjectDocument(doc));
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects documents over export track limits", () => {
    const tracks = Array.from({ length: STUDIO_EXPORT_MAX_TRACKS + 1 }, (_, i) => ({
      ...baseDocument().tracks[0]!,
      id: `t${i}`,
    }));
    const doc = baseDocument({ tracks });
    expect(() =>
      buildMixWorkingSnapshot({
        ownerId: OWNER_ID,
        projectId: PROJECT_ID,
        document: doc,
        capturedAt: CAPTURED,
      }),
    ).toThrow(MixWorkingDomainError);
  });

  it("does not mutate the input tip document", () => {
    const doc = baseDocument();
    const before = JSON.stringify(doc);
    const snap = buildMixWorkingSnapshot({
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      document: doc,
      capturedAt: CAPTURED,
    });
    snap.document.tracks[0]!.gainDb = -6;
    snap.document.clips[0]!.sourceTakeId = "mutated";
    expect(JSON.stringify(doc)).toBe(before);
    expect(doc.tracks[0]!.gainDb).toBe(0);
    expect(doc.clips[0]!.sourceTakeId).toBe(TAKE_A);
  });

  it("accepts snapshot under STUDIO_EXPORT_MAX_SNAPSHOT_BYTES", () => {
    const snap = buildMixWorkingSnapshot({
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      document: baseDocument(),
      capturedAt: CAPTURED,
    });
    const bytes = Buffer.byteLength(JSON.stringify(snap), "utf8");
    expect(bytes).toBeLessThanOrEqual(STUDIO_EXPORT_MAX_SNAPSHOT_BYTES);
    expect(STUDIO_EXPORT_MAX_SNAPSHOT_BYTES).toBe(256 * 1024);
  });

  it("rejects snapshot exceeding STUDIO_EXPORT_MAX_SNAPSHOT_BYTES", () => {
    const fatClips = Array.from({ length: 40 }, (_, i) => ({
      id: `clip-${i}`,
      trackId: TRACK_ID,
      sourceKind: "TAKE" as const,
      sourceTakeId: TAKE_A,
      sourceBeatId: null,
      sourceArtifactId: null,
      timelineStartMs: i * 10,
      durationMs: 10,
      sourceOffsetMs: 0,
      gainDb: 0,
      muted: false,
      fadeInMs: 0,
      fadeOutMs: 0,
      pad: "x".repeat(8_000),
    }));
    const document = baseDocument({
      clips: fatClips as unknown as StudioProjectDocument["clips"],
    });
    expect(() =>
      buildMixWorkingSnapshot({
        ownerId: OWNER_ID,
        projectId: PROJECT_ID,
        document,
        capturedAt: CAPTURED,
      }),
    ).toThrow(MixWorkingDomainError);
    try {
      buildMixWorkingSnapshot({
        ownerId: OWNER_ID,
        projectId: PROJECT_ID,
        document,
        capturedAt: CAPTURED,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(MixWorkingDomainError);
      expect((error as MixWorkingDomainError).code).toBe("LIMIT");
    }
  });
});

describe("A0 Mix Working — revisions", () => {
  it("builds a revision model without becoming a second tip SSOT", () => {
    const doc = baseDocument();
    const snap = buildMixWorkingSnapshot({
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      document: doc,
      capturedAt: CAPTURED,
    });
    const rev = buildMixRevision({
      id: "rev-1",
      projectId: PROJECT_ID,
      ownerId: OWNER_ID,
      parentRevisionId: null,
      kind: "manual_checkpoint",
      author: "USER",
      status: "draft",
      sourceDocumentVersion: snap.sourceDocumentVersion,
      documentDigest: snap.documentDigest,
      snapshot: snap,
      ops: null,
      proposalId: null,
      createdAt: CAPTURED,
    });
    expect(rev.kind).toBe("manual_checkpoint");
    expect(rev.documentDigest).toBe(digestStudioDocument(doc));
    expect(rev.snapshot?.document.project.documentVersion).toBe(3);
  });
});

describe("A0 Mix Working — ops validation", () => {
  it("accepts valid track controls", () => {
    const ops = validateMixWorkingOps({
      document: baseDocument(),
      ops: [
        {
          op: "set_track_controls",
          trackId: TRACK_ID,
          gainDb: -3,
          pan: -0.25,
          muted: false,
          solo: true,
        },
      ],
    });
    expect(ops).toEqual([
      {
        op: "set_track_controls",
        trackId: TRACK_ID,
        gainDb: -3,
        pan: -0.25,
        muted: false,
        solo: true,
      },
    ]);
  });

  it("rejects invalid gain/pan ranges (master/track UI bounds)", () => {
    expect(() =>
      validateMixWorkingOps({
        document: baseDocument(),
        ops: [{ op: "set_track_controls", trackId: TRACK_ID, gainDb: -25 }],
      }),
    ).toThrow();
    expect(() =>
      validateMixWorkingOps({
        document: baseDocument(),
        ops: [{ op: "set_track_controls", trackId: TRACK_ID, pan: 1.5 }],
      }),
    ).toThrow();
  });

  it("accepts supported FX types via parseStudioFxChainForWrite", () => {
    const chain = {
      schemaVersion: 1 as const,
      effects: [
        {
          id: FX_ID,
          type: "eq" as const,
          enabled: true,
          params: defaultStudioFxParams("eq"),
        },
      ],
    };
    const ops = validateMixWorkingOps({
      document: baseDocument(),
      ops: [{ op: "set_track_fx", trackId: TRACK_ID, effectsChain: chain }],
    });
    expect(ops[0]?.op).toBe("set_track_fx");
  });

  it("rejects unsupported FX types and unknown ops", () => {
    expect(() =>
      validateMixWorkingOps({
        document: baseDocument(),
        ops: [
          {
            op: "set_track_fx",
            trackId: TRACK_ID,
            effectsChain: {
              schemaVersion: 1,
              effects: [
                {
                  id: FX_ID,
                  type: "deesser",
                  enabled: true,
                  params: {},
                },
              ],
            },
          },
        ],
      }),
    ).toThrow(MixWorkingDomainError);

    expect(() =>
      validateMixWorkingOps({
        document: baseDocument(),
        ops: [{ op: "delete_project" }],
      }),
    ).toThrow(MixWorkingDomainError);
  });

  it("rejects ops that attempt to carry source TAKE/BEAT fields", () => {
    expect(() =>
      validateMixWorkingOps({
        document: baseDocument(),
        ops: [
          {
            op: "set_track_controls",
            trackId: TRACK_ID,
            gainDb: -1,
            sourceTakeId: TAKE_A,
          },
        ],
      }),
    ).toThrow(MixWorkingDomainError);

    const before = baseDocument();
    const takeBefore = before.clips[0]!.sourceTakeId;
    const beatBefore = before.clips[1]!.sourceBeatId;
    validateMixWorkingOps({
      document: before,
      ops: [{ op: "set_track_controls", trackId: TRACK_ID, gainDb: -1 }],
    });
    expect(before.clips[0]!.sourceTakeId).toBe(takeBefore);
    expect(before.clips[1]!.sourceBeatId).toBe(beatBefore);
  });

  it("rejects empty ops list", () => {
    expect(() =>
      validateMixWorkingOps({
        document: baseDocument(),
        ops: [],
      }),
    ).toThrow(MixWorkingDomainError);
  });

  it("rejects master FX when enabled limiter is not last", () => {
    const lim = {
      id: "llllllll-llll-4lll-8lll-llllllllllll",
      type: "limiter" as const,
      enabled: true,
      params: defaultStudioFxParams("limiter"),
    };
    const eq = {
      id: FX_ID,
      type: "eq" as const,
      enabled: true,
      params: defaultStudioFxParams("eq"),
    };
    expect(() =>
      validateMixWorkingOps({
        document: baseDocument(),
        ops: [
          {
            op: "set_master_fx",
            effectsChain: {
              schemaVersion: 1,
              effects: [lim, eq],
            },
          },
        ],
      }),
    ).toThrow(MixWorkingDomainError);
  });
});

describe("A0 Mix Working — proposal + stale", () => {
  it("detects CURRENT vs STALE against tip version", () => {
    expect(
      isMixProposalStale({ baseDocumentVersion: 3, tipDocumentVersion: 3 }),
    ).toEqual({ freshness: "CURRENT" });
    expect(
      isMixProposalStale({ baseDocumentVersion: 3, tipDocumentVersion: 4 }),
    ).toEqual({
      freshness: "STALE",
      baseDocumentVersion: 3,
      tipDocumentVersion: 4,
    });
  });

  it("treats tip < base as STALE (no false CURRENT)", () => {
    expect(
      isMixProposalStale({ baseDocumentVersion: 5, tipDocumentVersion: 3 }),
    ).toEqual({
      freshness: "STALE",
      baseDocumentVersion: 5,
      tipDocumentVersion: 3,
    });
  });

  it("buildMixProposal does not invent measurements", () => {
    const proposal = buildMixProposal({
      id: "prop-1",
      projectId: PROJECT_ID,
      ownerId: OWNER_ID,
      document: baseDocument(),
      ops: [{ op: "set_master_mix", masterGainDb: -1 }],
      createdAt: CAPTURED,
    });
    expect(proposal.measurements).toEqual([]);
    expect(proposal.baseDocumentVersion).toBe(3);
  });

  it("rejects proposal projectId mismatch with document", () => {
    expect(() =>
      buildMixProposal({
        id: "prop-mismatch",
        projectId: "99999999-9999-4999-8999-999999999999",
        ownerId: OWNER_ID,
        document: baseDocument(),
        ops: [{ op: "set_master_mix", masterGainDb: -1 }],
        createdAt: CAPTURED,
      }),
    ).toThrow(MixWorkingDomainError);
  });

  it("refuses applying version-STALE proposals", () => {
    const proposal = buildMixProposal({
      id: "prop-2",
      projectId: PROJECT_ID,
      ownerId: OWNER_ID,
      document: baseDocument(),
      ops: [{ op: "set_track_controls", trackId: TRACK_ID, muted: true }],
      createdAt: CAPTURED,
    });
    expect(() =>
      assertMixProposalApplicable({
        proposal,
        tipDocumentVersion: 99,
      }),
    ).toThrow(MixWorkingDomainError);
  });

  it("rejects status rejected even when tip version matches", () => {
    const proposal = buildMixProposal({
      id: "prop-rej",
      projectId: PROJECT_ID,
      ownerId: OWNER_ID,
      document: baseDocument(),
      ops: [{ op: "set_track_controls", trackId: TRACK_ID, gainDb: -1 }],
      createdAt: CAPTURED,
      status: "rejected",
    });
    expect(() =>
      assertMixProposalApplicable({
        proposal,
        tipDocumentVersion: 3,
      }),
    ).toThrow(MixWorkingDomainError);
  });

  it("rejects status stale even when tip version matches", () => {
    const proposal = buildMixProposal({
      id: "prop-stale-status",
      projectId: PROJECT_ID,
      ownerId: OWNER_ID,
      document: baseDocument(),
      ops: [{ op: "set_track_controls", trackId: TRACK_ID, gainDb: -1 }],
      createdAt: CAPTURED,
      status: "stale",
    });
    expect(() =>
      assertMixProposalApplicable({
        proposal,
        tipDocumentVersion: 3,
      }),
    ).toThrow(MixWorkingDomainError);
  });

  it("allows proposed + CURRENT tip version", () => {
    const proposal = buildMixProposal({
      id: "prop-ok",
      projectId: PROJECT_ID,
      ownerId: OWNER_ID,
      document: baseDocument(),
      ops: [{ op: "set_track_controls", trackId: TRACK_ID, gainDb: -1 }],
      createdAt: CAPTURED,
      status: "proposed",
    });
    expect(() =>
      assertMixProposalApplicable({
        proposal,
        tipDocumentVersion: 3,
      }),
    ).not.toThrow();
  });
});

describe("A0 Mix Working — restore lineage", () => {
  it("creates a new restored revision without mutating parent", () => {
    const snap = buildMixWorkingSnapshot({
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      document: baseDocument(),
      capturedAt: CAPTURED,
    });
    const parent: MixRevision = buildMixRevision({
      id: "rev-parent",
      projectId: PROJECT_ID,
      ownerId: OWNER_ID,
      parentRevisionId: null,
      kind: "manual_checkpoint",
      author: "USER",
      status: "accepted",
      sourceDocumentVersion: 3,
      documentDigest: snap.documentDigest,
      snapshot: snap,
      ops: null,
      proposalId: null,
      createdAt: CAPTURED,
      acceptedAt: CAPTURED,
    });
    const parentJson = JSON.stringify(parent);
    const { restored, parentUnchanged } = buildRestoreRevision({
      newRevisionId: "rev-restore",
      parent,
      createdAt: "2026-10-20T13:00:00.000Z",
    });
    expect(restored.id).toBe("rev-restore");
    expect(restored.parentRevisionId).toBe("rev-parent");
    expect(restored.kind).toBe("restored");
    expect(JSON.stringify(parent)).toBe(parentJson);
    expect(parentUnchanged.id).toBe("rev-parent");
    expect(parentUnchanged.kind).toBe("manual_checkpoint");
  });

  it("restore snapshot document is independent from parent snapshot", () => {
    const snap = buildMixWorkingSnapshot({
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      document: baseDocument(),
      capturedAt: CAPTURED,
    });
    const parent: MixRevision = buildMixRevision({
      id: "rev-parent-2",
      projectId: PROJECT_ID,
      ownerId: OWNER_ID,
      parentRevisionId: null,
      kind: "manual_checkpoint",
      author: "USER",
      status: "accepted",
      sourceDocumentVersion: 3,
      documentDigest: snap.documentDigest,
      snapshot: snap,
      ops: null,
      proposalId: null,
      createdAt: CAPTURED,
      acceptedAt: CAPTURED,
    });
    const { restored } = buildRestoreRevision({
      newRevisionId: "rev-restore-2",
      parent,
      createdAt: "2026-10-20T14:00:00.000Z",
    });
    expect(restored.snapshot).not.toBeNull();
    expect(parent.snapshot).not.toBeNull();
    restored.snapshot!.document.tracks[0]!.gainDb = -12;
    restored.snapshot!.document.clips[0]!.sourceTakeId = "mutated-take";
    expect(parent.snapshot!.document.tracks[0]!.gainDb).toBe(0);
    expect(parent.snapshot!.document.clips[0]!.sourceTakeId).toBe(TAKE_A);
  });
});

describe("A0 Mix Working — CAS plan (non-atomic, non-I/O)", () => {
  it("plans validated ops with explicit future atomic RPC requirement", () => {
    const plan = planMixWorkingCasApply({
      document: baseDocument(),
      ops: [
        { op: "set_track_controls", trackId: TRACK_ID, gainDb: -2 },
        { op: "set_master_mix", masterPan: 0.1 },
      ],
    });
    expect(plan.kind).toBe("MIX_WORKING_CAS_APPLY_PLAN");
    expect(plan.atomicityRequirement).toBe("REQUIRES_FUTURE_ATOMIC_RPC_CAS");
    expect(plan.baseDocumentVersion).toBe(3);
    expect(plan.ops).toHaveLength(2);
  });
});

describe("A1 Mix Working — pure apply + fingerprint", () => {
  it("applies multiple ops on an independent copy", () => {
    const doc = baseDocument();
    const before = JSON.stringify(doc);
    const result = applyMixWorkingOpsInMemory({
      document: doc,
      ops: [
        {
          op: "set_track_controls",
          trackId: TRACK_ID,
          gainDb: -6,
          muted: true,
        },
        { op: "set_master_mix", masterGainDb: -1, masterPan: 0.25 },
      ],
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      capturedAt: CAPTURED,
    });
    expect(JSON.stringify(doc)).toBe(before);
    expect(doc.tracks[0]!.gainDb).toBe(0);
    expect(result.nextDocument.tracks[0]!.gainDb).toBe(-6);
    expect(result.nextDocument.tracks[0]!.muted).toBe(true);
    expect(result.nextDocument.project.masterGainDb).toBe(-1);
    expect(result.nextDocument.project.masterPan).toBe(0.25);
    expect(result.nextDocument.project.documentVersion).toBe(4);
    expect(result.baseDocumentVersion).toBe(3);
    expect(result.patch.tracks[TRACK_ID]).toMatchObject({
      gain_db: -6,
      muted: true,
    });
    expect(result.patch.master).toMatchObject({
      master_gain_db: -1,
      master_pan: 0.25,
    });
    expect(result.documentDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("preserves TAKE/BEAT clip identity fields", () => {
    const doc = baseDocument();
    const result = applyMixWorkingOpsInMemory({
      document: doc,
      ops: [{ op: "set_track_controls", trackId: TRACK_ID, solo: true }],
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      capturedAt: CAPTURED,
    });
    expect(result.nextDocument.clips[0]!.sourceTakeId).toBe(TAKE_A);
    expect(result.nextDocument.clips[0]!.sourceKind).toBe("TAKE");
    expect(result.nextDocument.clips[1]!.sourceBeatId).toBe(BEAT_ID);
    expect(result.nextDocument.project.beatId).toBe(BEAT_ID);
  });

  it("rejects forbidden identity fields in ops", () => {
    expect(() =>
      applyMixWorkingOpsInMemory({
        document: baseDocument(),
        ops: [
          {
            op: "set_track_controls",
            trackId: TRACK_ID,
            gainDb: -1,
            sourceTakeId: "x",
          },
        ],
        ownerId: OWNER_ID,
        projectId: PROJECT_ID,
        capturedAt: CAPTURED,
      }),
    ).toThrow(MixWorkingDomainError);
  });

  it("rejects unknown / forbidden ops", () => {
    expect(() =>
      applyMixWorkingOpsInMemory({
        document: baseDocument(),
        ops: [{ op: "set_clip_gain", trackId: TRACK_ID }],
        ownerId: OWNER_ID,
        projectId: PROJECT_ID,
        capturedAt: CAPTURED,
      }),
    ).toThrow(MixWorkingDomainError);
  });

  it("rejects out-of-range gain/pan", () => {
    // A0 parsers raise StudioFxChainError for range; apply must not accept.
    expect(() =>
      applyMixWorkingOpsInMemory({
        document: baseDocument(),
        ops: [{ op: "set_track_controls", trackId: TRACK_ID, gainDb: -99 }],
        ownerId: OWNER_ID,
        projectId: PROJECT_ID,
        capturedAt: CAPTURED,
      }),
    ).toThrow();
  });

  it("rejects invalid FX / master limiter-not-last", () => {
    expect(() =>
      applyMixWorkingOpsInMemory({
        document: baseDocument(),
        ops: [
          {
            op: "set_master_fx",
            effectsChain: {
              schemaVersion: 1,
              effects: [
                {
                  id: FX_ID,
                  type: "limiter",
                  enabled: true,
                  params: defaultStudioFxParams("limiter"),
                },
                {
                  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
                  type: "eq",
                  enabled: true,
                  params: defaultStudioFxParams("eq"),
                },
              ],
            },
          },
        ],
        ownerId: OWNER_ID,
        projectId: PROJECT_ID,
        capturedAt: CAPTURED,
      }),
    ).toThrow(MixWorkingDomainError);
  });

  it("rejects empty ops (A0 contract)", () => {
    expect(() =>
      applyMixWorkingOpsInMemory({
        document: baseDocument(),
        ops: [],
        ownerId: OWNER_ID,
        projectId: PROJECT_ID,
        capturedAt: CAPTURED,
      }),
    ).toThrow(MixWorkingDomainError);
  });

  it("rejects projectId mismatch", () => {
    expect(() =>
      applyMixWorkingOpsInMemory({
        document: baseDocument(),
        ops: [{ op: "set_track_controls", trackId: TRACK_ID, gainDb: -1 }],
        ownerId: OWNER_ID,
        projectId: "99999999-9999-4999-8999-999999999999",
        capturedAt: CAPTURED,
      }),
    ).toThrow(MixWorkingDomainError);
  });

  it("rejects oversized next-tip snapshot", () => {
    const fatClips = Array.from({ length: 40 }, (_, i) => ({
      id: `clip-${i}`,
      trackId: TRACK_ID,
      sourceKind: "TAKE" as const,
      sourceTakeId: TAKE_A,
      sourceBeatId: null,
      sourceArtifactId: null,
      timelineStartMs: i * 10,
      durationMs: 10,
      sourceOffsetMs: 0,
      gainDb: 0,
      muted: false,
      fadeInMs: 0,
      fadeOutMs: 0,
      pad: "x".repeat(8_000),
    }));
    expect(() =>
      applyMixWorkingOpsInMemory({
        document: baseDocument({
          clips: fatClips as unknown as StudioProjectDocument["clips"],
        }),
        ops: [{ op: "set_track_controls", trackId: TRACK_ID, gainDb: -1 }],
        ownerId: OWNER_ID,
        projectId: PROJECT_ID,
        capturedAt: CAPTURED,
      }),
    ).toThrow(MixWorkingDomainError);
  });

  it("fingerprint is stable for identical request and order-sensitive", () => {
    const opsA = validateMixWorkingOps({
      document: baseDocument(),
      ops: [
        { op: "set_track_controls", trackId: TRACK_ID, gainDb: -2 },
        { op: "set_master_mix", masterPan: 0.1 },
      ],
    });
    const opsB = validateMixWorkingOps({
      document: baseDocument(),
      ops: [
        { op: "set_master_mix", masterPan: 0.1 },
        { op: "set_track_controls", trackId: TRACK_ID, gainDb: -2 },
      ],
    });
    const fp1 = fingerprintMixWorkingRequest({
      expectedDocumentVersion: 3,
      ops: opsA,
    });
    const fp2 = fingerprintMixWorkingRequest({
      expectedDocumentVersion: 3,
      ops: opsA,
    });
    const fpOrder = fingerprintMixWorkingRequest({
      expectedDocumentVersion: 3,
      ops: opsB,
    });
    const fpVersion = fingerprintMixWorkingRequest({
      expectedDocumentVersion: 4,
      ops: opsA,
    });
    const fpPayload = fingerprintMixWorkingRequest({
      expectedDocumentVersion: 3,
      ops: validateMixWorkingOps({
        document: baseDocument(),
        ops: [{ op: "set_track_controls", trackId: TRACK_ID, gainDb: -3 }],
      }),
    });
    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^[a-f0-9]{64}$/);
    expect(fp1).not.toBe(fpOrder);
    expect(fp1).not.toBe(fpVersion);
    expect(fp1).not.toBe(fpPayload);
  });

  it("apply order changes resulting tip state", () => {
    const gainThenMute = applyMixWorkingOpsInMemory({
      document: baseDocument(),
      ops: [
        { op: "set_track_controls", trackId: TRACK_ID, gainDb: -4 },
        { op: "set_track_controls", trackId: TRACK_ID, muted: true },
      ],
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      capturedAt: CAPTURED,
    });
    const muteThenGain = applyMixWorkingOpsInMemory({
      document: baseDocument(),
      ops: [
        { op: "set_track_controls", trackId: TRACK_ID, muted: true },
        { op: "set_track_controls", trackId: TRACK_ID, gainDb: -4 },
      ],
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      capturedAt: CAPTURED,
    });
    expect(gainThenMute.nextDocument.tracks[0]!.gainDb).toBe(-4);
    expect(gainThenMute.nextDocument.tracks[0]!.muted).toBe(true);
    expect(muteThenGain.nextDocument.tracks[0]!.gainDb).toBe(-4);
    expect(muteThenGain.nextDocument.tracks[0]!.muted).toBe(true);
    // Same final tip fields, but fingerprints differ by op order.
    expect(
      fingerprintMixWorkingRequest({
        expectedDocumentVersion: 3,
        ops: gainThenMute.ops,
      }),
    ).not.toBe(
      fingerprintMixWorkingRequest({
        expectedDocumentVersion: 3,
        ops: muteThenGain.ops,
      }),
    );
  });
});
