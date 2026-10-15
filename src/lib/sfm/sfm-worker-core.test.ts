/**
 * SFM worker core — kind recognition, Accept snapshot validation, PCM QC.
 * No DB · no Storage · no Contabo · no remote claim.
 */

import { describe, expect, it } from "vitest";

import { AUDIO_CODEC } from "@/config/audio-render";
import type { BakePcmInput } from "@/lib/audio/mp3-encode";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import { SfmDomainError } from "@/lib/sfm/sfm-domain";
import {
  buildSfmAcceptContentSnapshot,
  SFM_ACCEPT_SNAPSHOT_KIND,
} from "@/lib/sfm/sfm-version-snapshot";
import {
  qcSfmMasterBakePcm,
  requireSfmExecutorJobKind,
  requireSfmQualityFromJob,
  sfmWorkerAllowsAutoRequeue,
  validateSfmMixPrepareSnapshot,
} from "@/lib/sfm/sfm-worker-core";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";
import { emptyStudioFxChain } from "@/lib/studio/studio-fx-chain";
import { SFM_EXECUTOR_JOB_KINDS } from "@/types/domain";

const PROJECT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_OWNER = "22222222-2222-4222-8222-222222222222";
const TAKE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BEAT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function baseDocument(): StudioProjectDocument {
  return {
    project: {
      id: PROJECT_ID,
      title: "Test",
      status: "ACTIVE",
      tempoBpm: 120,
      timelineLengthMs: 60_000,
      beatId: BEAT_ID,
      updatedAt: "2026-10-14T00:00:00.000Z",
      createdAt: "2026-10-14T00:00:00.000Z",
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
        effectsChain: emptyStudioFxChain(),
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
    ],
  };
}

function synthBake(frames = 4410): BakePcmInput {
  const interleaved = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    interleaved[i * 2] = 0.1;
    interleaved[i * 2 + 1] = -0.1;
  }
  return {
    sampleRate: AUDIO_CODEC.WAV_SAMPLE_RATE,
    channels: 2,
    interleaved,
    frames,
    durationMs: Math.max(1, Math.round((frames / AUDIO_CODEC.WAV_SAMPLE_RATE) * 1000)),
  };
}

describe("SFM worker core — executor kind recognition", () => {
  it("accepts all three OD-SFM-ID-07 kinds", () => {
    for (const kind of SFM_EXECUTOR_JOB_KINDS) {
      expect(requireSfmExecutorJobKind(kind)).toBe(kind);
    }
  });

  it("fail-closed on unknown and non-SFM kinds (no MIX/STUDIO fallback)", () => {
    expect(() => requireSfmExecutorJobKind("WEIRD")).toThrow(RenderJobDomainError);
    expect(() => requireSfmExecutorJobKind("MIX")).toThrow(/non-SFM|rejects/i);
    expect(() => requireSfmExecutorJobKind("STUDIO_EXPORT")).toThrow(
      RenderJobDomainError,
    );
    expect(() => requireSfmExecutorJobKind("TAKE_EXPORT")).toThrow(
      RenderJobDomainError,
    );
    expect(() => requireSfmExecutorJobKind("SFM_MIX")).toThrow(RenderJobDomainError);
    expect(() => requireSfmExecutorJobKind(null)).toThrow(RenderJobDomainError);
  });

  it("never allows auto-requeue of terminal jobs", () => {
    expect(sfmWorkerAllowsAutoRequeue()).toBe(false);
  });
});

describe("SFM worker core — MIX_PREPARE snapshot validation", () => {
  it("accepts a valid Accept snapshot for matching owner/project", () => {
    const snapshot = buildSfmAcceptContentSnapshot({
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      documentVersion: 3,
      capturedAt: "2026-10-14T12:00:00.000Z",
      document: baseDocument(),
    });
    const result = validateSfmMixPrepareSnapshot(snapshot, {
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
    });
    expect(result.snapshot.snapshotKind).toBe(SFM_ACCEPT_SNAPSHOT_KIND);
    expect(result.sourceRefs.takeIds).toEqual([TAKE_A]);
    expect(result.documentDigest).toBe(snapshot.documentDigest);
  });

  it("rejects owner or project mismatch (fail-closed)", () => {
    const snapshot = buildSfmAcceptContentSnapshot({
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      documentVersion: 3,
      capturedAt: "2026-10-14T12:00:00.000Z",
      document: baseDocument(),
    });
    expect(() =>
      validateSfmMixPrepareSnapshot(snapshot, {
        ownerId: OTHER_OWNER,
        projectId: PROJECT_ID,
      }),
    ).toThrow(SfmDomainError);
    expect(() =>
      validateSfmMixPrepareSnapshot(snapshot, {
        ownerId: OWNER_ID,
        projectId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      }),
    ).toThrow(/project mismatch/i);
  });

  it("rejects missing snapshot / digest tamper", () => {
    expect(() =>
      validateSfmMixPrepareSnapshot(null, {
        ownerId: OWNER_ID,
        projectId: PROJECT_ID,
      }),
    ).toThrow(/content_snapshot missing/i);

    const snapshot = buildSfmAcceptContentSnapshot({
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
      documentVersion: 3,
      capturedAt: "2026-10-14T12:00:00.000Z",
      document: baseDocument(),
    });
    expect(() =>
      validateSfmMixPrepareSnapshot(
        { ...snapshot, documentDigest: "0".repeat(64) },
        { ownerId: OWNER_ID, projectId: PROJECT_ID },
      ),
    ).toThrow(/documentDigest mismatch/i);
  });
});

describe("SFM worker core — master PCM QC + quality", () => {
  it("accepts stereo 44.1 kHz PCM", () => {
    expect(() => qcSfmMasterBakePcm(synthBake())).not.toThrow();
  });

  it("rejects empty / wrong geometry / non-finite PCM", () => {
    expect(() =>
      qcSfmMasterBakePcm({ ...synthBake(0), frames: 0, interleaved: new Float32Array(0) }),
    ).toThrow(/empty/i);
    expect(() =>
      qcSfmMasterBakePcm({ ...synthBake(), sampleRate: 48000 }),
    ).toThrow(/44100/);
    const nanBake = synthBake(10);
    nanBake.interleaved[0] = Number.NaN;
    expect(() => qcSfmMasterBakePcm(nanBake)).toThrow(/non-finite/i);
  });

  it("requires valid sfm_quality for QUALITY_ENCODE", () => {
    expect(requireSfmQualityFromJob("MP3_128")).toBe("MP3_128");
    expect(requireSfmQualityFromJob("WAV")).toBe("WAV");
    expect(() => requireSfmQualityFromJob(null)).toThrow(RenderJobDomainError);
    expect(() => requireSfmQualityFromJob("FLAC")).toThrow(RenderJobDomainError);
  });
});
