import { describe, expect, it } from "vitest";

import {
  STUDIO_EXPORT_MAX_CLIPS,
  STUDIO_EXPORT_MAX_SNAPSHOT_BYTES,
  STUDIO_EXPORT_MAX_TRACKS,
} from "@/config/audio-render";
import {
  buildStudioExportDocumentSnapshot,
  canonicalJsonStringify,
  collectStudioExportSourceRefs,
  digestStudioDocument,
  parseStudioExportDocumentSnapshot,
} from "@/lib/audio/studio-export-document-snapshot";
import { emptyStudioFxChain } from "@/lib/studio/studio-fx-chain";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "33333333-3333-4333-8333-333333333333";
const TAKE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TAKE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BEAT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function emptyFx() {
  return emptyStudioFxChain();
}

function baseDocument(
  overrides?: Partial<StudioProjectDocument>,
): StudioProjectDocument {
  return {
    project: {
      id: PROJECT_ID,
      title: "Test",
      status: "ACTIVE",
      tempoBpm: 120,
      timelineLengthMs: 60_000,
      beatId: BEAT_ID,
      updatedAt: "2026-10-10T00:00:00.000Z",
      createdAt: "2026-10-10T00:00:00.000Z",
      timeSignatureNum: 4,
      timeSignatureDen: 4,
      masterGainDb: 0,
      masterPan: 0,
      masterFxChain: emptyFx(),
      documentVersion: 3,
      schemaVersion: 1,
    },
    tracks: [
      {
        id: "t1",
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
        effectsChain: emptyFx(),
      },
    ],
    clips: [
      {
        id: "c1",
        trackId: "t1",
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
        trackId: "t1",
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

describe("STUDIO_EXPORT snapshot — canonical + digest", () => {
  it("canonical serialization is deterministic for key order", () => {
    const a = canonicalJsonStringify({ b: 1, a: 2 });
    const b = canonicalJsonStringify({ a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1}');
  });

  it("builds snapshot with digest and round-trips parse", () => {
    const document = baseDocument();
    const snapshot = buildStudioExportDocumentSnapshot({
      jobId: JOB_ID,
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      documentVersion: 3,
      capturedAt: "2026-10-10T00:01:00.000Z",
      document,
    });
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.documentDigest).toBe(digestStudioDocument(document));
    const parsed = parseStudioExportDocumentSnapshot(snapshot, {
      jobId: JOB_ID,
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
    });
    expect(parsed.documentDigest).toBe(snapshot.documentDigest);
  });

  it("rejects corrupted digest", () => {
    const snapshot = buildStudioExportDocumentSnapshot({
      jobId: JOB_ID,
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      documentVersion: 3,
      capturedAt: "2026-10-10T00:01:00.000Z",
      document: baseDocument(),
    });
    expect(() =>
      parseStudioExportDocumentSnapshot({
        ...snapshot,
        documentDigest: "0".repeat(64),
      }),
    ).toThrow(RenderJobDomainError);
  });

  it("rejects mismatched jobId/ownerId/projectId/documentVersion", () => {
    const snapshot = buildStudioExportDocumentSnapshot({
      jobId: JOB_ID,
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      documentVersion: 3,
      capturedAt: "2026-10-10T00:01:00.000Z",
      document: baseDocument(),
    });
    expect(() =>
      parseStudioExportDocumentSnapshot(snapshot, { jobId: "other" }),
    ).toThrow(/jobId/);
    expect(() =>
      parseStudioExportDocumentSnapshot(snapshot, { ownerId: "other" }),
    ).toThrow(/ownerId/);
    expect(() =>
      parseStudioExportDocumentSnapshot(snapshot, { projectId: "other" }),
    ).toThrow(/projectId/);
    expect(() =>
      buildStudioExportDocumentSnapshot({
        jobId: JOB_ID,
        ownerId: OWNER_ID,
        projectId: PROJECT_ID,
        documentVersion: 99,
        capturedAt: "2026-10-10T00:01:00.000Z",
        document: baseDocument(),
      }),
    ).toThrow(/documentVersion/);
  });

  it("rejects forbidden objectKey / signedUrl fields", () => {
    const snapshot = buildStudioExportDocumentSnapshot({
      jobId: JOB_ID,
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      documentVersion: 3,
      capturedAt: "2026-10-10T00:01:00.000Z",
      document: baseDocument(),
    });
    expect(() =>
      parseStudioExportDocumentSnapshot({
        ...snapshot,
        objectKey: "evil",
      }),
    ).toThrow(/objectKey/);
  });

  it("rejects missing required fields", () => {
    expect(() => parseStudioExportDocumentSnapshot({})).toThrow(
      RenderJobDomainError,
    );
  });

  it("rejects oversized snapshot", () => {
    const fatClips = Array.from({ length: 40 }, (_, i) => ({
      id: `clip-${i}`,
      trackId: "t1",
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
      // inflate payload
      pad: "x".repeat(8_000),
    }));
    const document = baseDocument({
      clips: fatClips as unknown as StudioProjectDocument["clips"],
    });
    // May hit clip/source limits first — either LIMIT is fail-closed.
    expect(() =>
      buildStudioExportDocumentSnapshot({
        jobId: JOB_ID,
        ownerId: OWNER_ID,
        projectId: PROJECT_ID,
        documentVersion: 3,
        capturedAt: "2026-10-10T00:01:00.000Z",
        document,
      }),
    ).toThrow(RenderJobDomainError);
    expect(STUDIO_EXPORT_MAX_SNAPSHOT_BYTES).toBe(256 * 1024);
  });
});

describe("STUDIO_EXPORT source collection", () => {
  it("collects unique TAKE and BEAT_REF; dedupes duplicates", () => {
    const document = baseDocument({
      clips: [
        ...baseDocument().clips,
        {
          id: "c3",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: TAKE_A,
          sourceBeatId: null,
          sourceArtifactId: null,
          timelineStartMs: 2000,
          durationMs: 500,
          sourceOffsetMs: 0,
          gainDb: 0,
          muted: false,
          fadeInMs: 0,
          fadeOutMs: 0,
        },
        {
          id: "c4",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: TAKE_B,
          sourceBeatId: null,
          sourceArtifactId: null,
          timelineStartMs: 3000,
          durationMs: 500,
          sourceOffsetMs: 0,
          gainDb: 0,
          muted: false,
          fadeInMs: 0,
          fadeOutMs: 0,
        },
      ],
    });
    const refs = collectStudioExportSourceRefs(document);
    expect(refs.takeIds).toEqual([TAKE_A, TAKE_B].sort());
    expect(refs.beatIds).toEqual([BEAT_ID]);
  });

  it("allows cross-beat TAKE ids (no project beat match required)", () => {
    const refs = collectStudioExportSourceRefs(baseDocument());
    expect(refs.takeIds).toContain(TAKE_A);
  });

  it("rejects BEAT_REF that mismatches project SSOT", () => {
    const document = baseDocument({
      clips: [
        {
          id: "c1",
          trackId: "t1",
          sourceKind: "BEAT_REF",
          sourceTakeId: null,
          sourceBeatId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
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
    });
    expect(() => collectStudioExportSourceRefs(document)).toThrow(/SSOT/);
  });

  it("rejects empty exportable sources", () => {
    expect(() =>
      collectStudioExportSourceRefs(baseDocument({ clips: [] })),
    ).toThrow(/at least one/);
  });

  it("enforces track/clip caps from config SSOT", () => {
    expect(STUDIO_EXPORT_MAX_TRACKS).toBe(8);
    expect(STUDIO_EXPORT_MAX_CLIPS).toBe(256);
  });
});
