/**
 * SFM worker pipeline — orchestration with injectable deps (no remote I/O).
 * Contabo STUDIO_EXPORT poller must not call this module.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { AUDIO_CODEC } from "@/config/audio-render";
import type { BakePcmInput } from "@/lib/audio/mp3-encode";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import { SfmDomainError } from "@/lib/sfm/sfm-domain";
import { buildSfmAcceptContentSnapshot } from "@/lib/sfm/sfm-version-snapshot";
import { runAlreadyClaimedSfmWorkerJob } from "@/lib/sfm/sfm-worker-pipeline";
import { bakeSfmMasterPcmFromResolvedPcm } from "@/lib/sfm/sfm-worker-bake";
import { validateSfmMixPrepareSnapshot } from "@/lib/sfm/sfm-worker-core";
import type { StudioProjectDocument } from "@/lib/studio/studio-types";
import { emptyStudioFxChain } from "@/lib/studio/studio-fx-chain";
import {
  isPollerOutOfScopeKind,
  qualifyStudioExportPollerJob,
} from "@/lib/audio/studio-export-poller-qualify";
import type { RenderJobKind, RenderJobStatus } from "@/types/domain";
import { SFM_EXECUTOR_JOB_KINDS } from "@/types/domain";

const PROJECT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const VERSION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const JOB_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const TAKE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BEAT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const POLLER = "src/lib/audio/studio-export-poller.ts";
const RENDER_PIPELINE = "src/lib/audio/render-worker-pipeline.ts";
const SFM_PIPELINE = "src/lib/sfm/sfm-worker-pipeline.ts";
const ELIGIBILITY = "src/lib/takes/recording-eligibility-service.ts";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function baseDocument(): StudioProjectDocument {
  return {
    project: {
      id: PROJECT_ID,
      title: "Test",
      status: "ACTIVE",
      tempoBpm: 120,
      timelineLengthMs: 2_000,
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

function acceptSnapshot() {
  return buildSfmAcceptContentSnapshot({
    ownerId: OWNER_ID,
    projectId: PROJECT_ID,
    documentVersion: 3,
    capturedAt: "2026-10-14T12:00:00.000Z",
    document: baseDocument(),
  });
}

function synthBake(frames = 4410): BakePcmInput {
  const interleaved = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    interleaved[i * 2] = 0.15;
    interleaved[i * 2 + 1] = -0.15;
  }
  return {
    sampleRate: AUDIO_CODEC.WAV_SAMPLE_RATE,
    channels: 2,
    interleaved,
    frames,
    durationMs: Math.max(
      1,
      Math.round((frames / AUDIO_CODEC.WAV_SAMPLE_RATE) * 1000),
    ),
  };
}

function baseJob(
  overrides: Partial<{
    kind: RenderJobKind;
    status: RenderJobStatus;
    sfmQuality: string | null;
    sfmVersionId: string | null;
    projectId: string | null;
  }> = {},
) {
  return {
    id: JOB_ID,
    kind: (overrides.kind ?? "SFM_MIX_PREPARE") as RenderJobKind,
    status: (overrides.status ?? "RUNNING") as RenderJobStatus,
    ownerId: OWNER_ID,
    projectId: overrides.projectId ?? PROJECT_ID,
    sfmVersionId: overrides.sfmVersionId ?? VERSION_ID,
    sfmQuality: overrides.sfmQuality ?? null,
  };
}

describe("SFM worker pipeline — kind dispatch (mocked deps)", () => {
  it("SFM_MIX_PREPARE validates snapshot and marks SUCCEEDED + stage", async () => {
    const snapshot = acceptSnapshot();
    const markSucceeded = vi.fn(async () => undefined);
    const markFailed = vi.fn(async () => undefined);
    const complete = vi.fn(async () => undefined);

    const result = await runAlreadyClaimedSfmWorkerJob(baseJob(), {
      loadVersionContentSnapshot: async () => snapshot,
      assertSourcesAvailable: async () => undefined,
      markJobSucceeded: markSucceeded,
      markJobFailed: markFailed,
      completeDomainStageAfterJob: complete,
      bakeMasterPcmFromSnapshot: async () => {
        throw new Error("bake must not run for MIX_PREPARE");
      },
    });

    expect(result.outcome).toBe("mix_prepare_ok");
    expect(markSucceeded).toHaveBeenCalledWith(JOB_ID);
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        versionId: VERSION_ID,
        jobKind: "SFM_MIX_PREPARE",
        status: "SUCCEEDED",
      }),
    );
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("SFM_MASTER_BAKE runs bake+QC then SUCCEEDED", async () => {
    const snapshot = acceptSnapshot();
    const bake = synthBake();
    const markSucceeded = vi.fn(async () => undefined);
    const complete = vi.fn(async () => undefined);

    const result = await runAlreadyClaimedSfmWorkerJob(
      baseJob({ kind: "SFM_MASTER_BAKE" }),
      {
        loadVersionContentSnapshot: async () => snapshot,
        bakeMasterPcmFromSnapshot: async () => bake,
        markJobSucceeded: markSucceeded,
        markJobFailed: async () => undefined,
        completeDomainStageAfterJob: complete,
      },
    );

    expect(result).toMatchObject({
      outcome: "master_bake_ok",
      kind: "SFM_MASTER_BAKE",
      frames: bake.frames,
    });
    expect(markSucceeded).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ jobKind: "SFM_MASTER_BAKE", status: "SUCCEEDED" }),
    );
  });

  it("SFM_QUALITY_ENCODE re-bakes, encodes, finalizes (no stage complete)", async () => {
    const snapshot = acceptSnapshot();
    const bake = synthBake();
    const markSucceeded = vi.fn(async () => undefined);
    const complete = vi.fn(async () => undefined);
    const encode = vi.fn(async () => ({
      quality: "MP3_192" as const,
      bytes: Buffer.from("fake-but-mocked"),
      contentType: "audio/mpeg",
      byteSize: 16,
      durationMs: 100,
      checksumSha256: "sha256:abc",
      sampleRate: AUDIO_CODEC.WAV_SAMPLE_RATE,
      bitrateKbps: 192,
      encoder: "mock",
      qcPassed: true as const,
    }));
    const finalize = vi.fn(async () => ({
      artifactId: "art-1",
      promoted: true,
    }));

    const result = await runAlreadyClaimedSfmWorkerJob(
      baseJob({ kind: "SFM_QUALITY_ENCODE", sfmQuality: "MP3_192" }),
      {
        loadVersionContentSnapshot: async () => snapshot,
        bakeMasterPcmFromSnapshot: async () => bake,
        markJobSucceeded: markSucceeded,
        markJobFailed: async () => undefined,
        completeDomainStageAfterJob: complete,
        encodeQuality: encode,
        finalizeQualityArtifact: finalize,
      },
    );

    expect(result).toMatchObject({
      outcome: "quality_encode_ok",
      quality: "MP3_192",
      artifactId: "art-1",
      promoted: true,
    });
    expect(encode).toHaveBeenCalledWith("MP3_192", bake);
    expect(finalize).toHaveBeenCalledOnce();
    // QUALITY_ENCODE has no domain stage — complete must not be required for success.
    expect(complete).not.toHaveBeenCalled();
    // finalize owns SUCCEEDED mark.
    expect(markSucceeded).not.toHaveBeenCalled();
  });

  it("unknown / non-SFM kind marks FAILED and does not bake", async () => {
    const markFailed = vi.fn(async () => undefined);
    const bake = vi.fn(async () => synthBake());

    await expect(
      runAlreadyClaimedSfmWorkerJob(baseJob({ kind: "MIX" }), {
        loadVersionContentSnapshot: async () => acceptSnapshot(),
        bakeMasterPcmFromSnapshot: bake,
        markJobSucceeded: async () => undefined,
        markJobFailed: markFailed,
        completeDomainStageAfterJob: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(RenderJobDomainError);

    expect(markFailed).toHaveBeenCalledWith(
      JOB_ID,
      expect.any(String),
      expect.any(String),
    );
    expect(bake).not.toHaveBeenCalled();
  });

  it("bake QC failure marks FAILED and does not succeed", async () => {
    const markSucceeded = vi.fn(async () => undefined);
    const markFailed = vi.fn(async () => undefined);
    const complete = vi.fn(async () => undefined);
    const badBake: BakePcmInput = {
      ...synthBake(),
      sampleRate: 48000,
    };

    await expect(
      runAlreadyClaimedSfmWorkerJob(baseJob({ kind: "SFM_MASTER_BAKE" }), {
        loadVersionContentSnapshot: async () => acceptSnapshot(),
        bakeMasterPcmFromSnapshot: async () => badBake,
        markJobSucceeded: markSucceeded,
        markJobFailed: markFailed,
        completeDomainStageAfterJob: complete,
      }),
    ).rejects.toBeInstanceOf(RenderJobDomainError);

    expect(markSucceeded).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ status: "FAILED", jobKind: "SFM_MASTER_BAKE" }),
    );
  });

  it("Storage/download-class bake error marks FAILED (no false success)", async () => {
    const markSucceeded = vi.fn(async () => undefined);
    const markFailed = vi.fn(async () => undefined);

    await expect(
      runAlreadyClaimedSfmWorkerJob(baseJob({ kind: "SFM_MASTER_BAKE" }), {
        loadVersionContentSnapshot: async () => acceptSnapshot(),
        bakeMasterPcmFromSnapshot: async () => {
          throw new RenderJobDomainError("SFM source download failed", "NOT_FOUND");
        },
        markJobSucceeded: markSucceeded,
        markJobFailed: markFailed,
        completeDomainStageAfterJob: async () => undefined,
      }),
    ).rejects.toThrow(/download failed/i);

    expect(markSucceeded).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith(JOB_ID, "NOT_FOUND", expect.any(String));
  });

  it("encode failure does not finalize artifact", async () => {
    const finalize = vi.fn(async () => ({ artifactId: "x", promoted: false }));
    const markFailed = vi.fn(async () => undefined);

    await expect(
      runAlreadyClaimedSfmWorkerJob(
        baseJob({ kind: "SFM_QUALITY_ENCODE", sfmQuality: "WAV" }),
        {
          loadVersionContentSnapshot: async () => acceptSnapshot(),
          bakeMasterPcmFromSnapshot: async () => synthBake(),
          markJobSucceeded: async () => undefined,
          markJobFailed: markFailed,
          completeDomainStageAfterJob: async () => undefined,
          encodeQuality: async () => {
            throw new RenderJobDomainError("FFmpeg failed", "INVALID");
          },
          finalizeQualityArtifact: finalize,
        },
      ),
    ).rejects.toThrow(/FFmpeg failed/i);

    expect(finalize).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledOnce();
  });

  it("rejects non-RUNNING status without mutating", async () => {
    await expect(
      runAlreadyClaimedSfmWorkerJob(baseJob({ status: "QUEUED" }), {
        loadVersionContentSnapshot: async () => acceptSnapshot(),
        bakeMasterPcmFromSnapshot: async () => synthBake(),
        markJobSucceeded: async () => undefined,
        markJobFailed: async () => undefined,
        completeDomainStageAfterJob: async () => undefined,
      }),
    ).rejects.toThrow(/expects RUNNING/i);
  });

  it("owner mismatch on snapshot marks FAILED", async () => {
    const markFailed = vi.fn(async () => undefined);
    const snap = acceptSnapshot();

    await expect(
      runAlreadyClaimedSfmWorkerJob(
        { ...baseJob(), ownerId: "22222222-2222-4222-8222-222222222222" },
        {
          loadVersionContentSnapshot: async () => snap,
          bakeMasterPcmFromSnapshot: async () => synthBake(),
          markJobSucceeded: async () => undefined,
          markJobFailed: markFailed,
          completeDomainStageAfterJob: async () => undefined,
        },
      ),
    ).rejects.toBeInstanceOf(SfmDomainError);

    expect(markFailed).toHaveBeenCalledOnce();
  });
});

describe("SFM worker pipeline — DEFECT-1 job SUCCEEDED / stage FAILED guard", () => {
  it("markJobSucceeded rejection keeps pre-success fail path (FAILED job + FAILED stage)", async () => {
    const markSucceeded = vi.fn(async () => {
      throw new RenderJobDomainError(
        "SFM job left RUNNING before SUCCEEDED mark.",
        "CONFLICT",
      );
    });
    const markFailed = vi.fn(async () => undefined);
    const complete = vi.fn(async () => undefined);

    await expect(
      runAlreadyClaimedSfmWorkerJob(baseJob({ kind: "SFM_MASTER_BAKE" }), {
        loadVersionContentSnapshot: async () => acceptSnapshot(),
        bakeMasterPcmFromSnapshot: async () => synthBake(),
        markJobSucceeded: markSucceeded,
        markJobFailed: markFailed,
        completeDomainStageAfterJob: complete,
      }),
    ).rejects.toBeInstanceOf(RenderJobDomainError);

    expect(markSucceeded).toHaveBeenCalledOnce();
    expect(markFailed).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "FAILED",
        jobKind: "SFM_MASTER_BAKE",
      }),
    );
    expect(complete).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "SUCCEEDED" }),
    );
  });

  it("stage SUCCEEDED failure after markJobSucceeded does not FAIL job or stage", async () => {
    const markSucceeded = vi.fn(async () => undefined);
    const markFailed = vi.fn(async () => undefined);
    const complete = vi.fn(async (params: { status: string }) => {
      if (params.status === "SUCCEEDED") {
        throw new RenderJobDomainError("stage complete RPC unavailable", "CONFLICT");
      }
    });

    await expect(
      runAlreadyClaimedSfmWorkerJob(baseJob({ kind: "SFM_MIX_PREPARE" }), {
        loadVersionContentSnapshot: async () => acceptSnapshot(),
        assertSourcesAvailable: async () => undefined,
        bakeMasterPcmFromSnapshot: async () => {
          throw new Error("bake must not run");
        },
        markJobSucceeded: markSucceeded,
        markJobFailed: markFailed,
        completeDomainStageAfterJob: complete,
      }),
    ).rejects.toThrow(/stage complete RPC unavailable/i);

    expect(markSucceeded).toHaveBeenCalledOnce();
    expect(markFailed).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "SUCCEEDED",
        jobKind: "SFM_MIX_PREPARE",
      }),
    );
    expect(complete).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "FAILED" }),
    );
  });

  it("MASTER_BAKE: stage SUCCEEDED failure after markJobSucceeded is not reported as success", async () => {
    const markSucceeded = vi.fn(async () => undefined);
    const markFailed = vi.fn(async () => undefined);
    const complete = vi.fn(async () => {
      throw new SfmDomainError("Complete stage RPC returned no row.", "CONFLICT");
    });

    let outcome: unknown = null;
    await expect(
      (async () => {
        outcome = await runAlreadyClaimedSfmWorkerJob(
          baseJob({ kind: "SFM_MASTER_BAKE" }),
          {
            loadVersionContentSnapshot: async () => acceptSnapshot(),
            bakeMasterPcmFromSnapshot: async () => synthBake(),
            markJobSucceeded: markSucceeded,
            markJobFailed: markFailed,
            completeDomainStageAfterJob: complete,
          },
        );
      })(),
    ).rejects.toBeInstanceOf(SfmDomainError);

    expect(outcome).toBeNull();
    expect(markFailed).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "FAILED" }),
    );
  });

  it("render error before markJobSucceeded still marks FAILED job + FAILED stage", async () => {
    const markSucceeded = vi.fn(async () => undefined);
    const markFailed = vi.fn(async () => undefined);
    const complete = vi.fn(async () => undefined);

    await expect(
      runAlreadyClaimedSfmWorkerJob(baseJob({ kind: "SFM_MASTER_BAKE" }), {
        loadVersionContentSnapshot: async () => acceptSnapshot(),
        bakeMasterPcmFromSnapshot: async () => {
          throw new RenderJobDomainError("offline render failed", "INVALID");
        },
        markJobSucceeded: markSucceeded,
        markJobFailed: markFailed,
        completeDomainStageAfterJob: complete,
      }),
    ).rejects.toThrow(/offline render failed/i);

    expect(markSucceeded).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith(JOB_ID, "INVALID", expect.any(String));
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "FAILED",
        jobKind: "SFM_MASTER_BAKE",
        errorCode: "INVALID",
      }),
    );
  });
});

describe("SFM worker bake — resolved PCM offline path", () => {
  it("bakes stereo 44.1 kHz PCM from synthetic resolvePcm", async () => {
    const validation = validateSfmMixPrepareSnapshot(acceptSnapshot(), {
      ownerId: OWNER_ID,
      projectId: PROJECT_ID,
    });
    const frames = 4410;
    const interleaved = new Float32Array(frames * 2);
    interleaved.fill(0.05);
    const pcm = {
      sampleRate: AUDIO_CODEC.WAV_SAMPLE_RATE,
      channels: 2 as const,
      interleaved,
      frames,
    };

    const bake = await bakeSfmMasterPcmFromResolvedPcm(validation, (key) => {
      if (key.kind === "TAKE" && key.takeId === TAKE_A) return pcm;
      return null;
    });

    expect(bake.sampleRate).toBe(AUDIO_CODEC.WAV_SAMPLE_RATE);
    expect(bake.channels).toBe(2);
    expect(bake.frames).toBeGreaterThan(0);
  });
});

describe("SFM worker — STUDIO_EXPORT / E3 / TAKE / Sacred WIP isolation", () => {
  it("poller qualification rejects all SFM kinds", () => {
    for (const kind of SFM_EXECUTOR_JOB_KINDS) {
      expect(
        qualifyStudioExportPollerJob({
          kind,
          status: "QUEUED",
          requestedTier: "WAV",
          projectId: PROJECT_ID,
          mixSessionId: null,
          takeId: null,
          attempt: 1,
        }),
      ).toEqual({ eligible: false, reason: "KIND_OUT" });
      expect(isPollerOutOfScopeKind(kind)).toBe(true);
    }
  });

  it("STUDIO poller and MIX dispatcher do not import SFM worker bake", () => {
    const poller = read(POLLER);
    const pipeline = read(RENDER_PIPELINE);
    const sfmPipeline = read(SFM_PIPELINE);

    expect(poller).not.toMatch(/claim_next_sfm_job|runAlreadyClaimedSfmWorkerJob/);
    expect(pipeline).not.toMatch(/from \"@\/lib\/sfm\/sfm-worker/);
    expect(pipeline).toMatch(/SFM claim\/bake is separate/);
    expect(sfmPipeline).toMatch(/MUST NOT be called from STUDIO_EXPORT poller/);
    expect(sfmPipeline).toMatch(/claim_next_sfm_job/);
  });

  it("does not modify Sacred WIP recording-eligibility-service", () => {
    const eligibility = read(ELIGIBILITY);
    expect(eligibility).not.toMatch(
      /sfm-worker|SFM_MIX_PREPARE|claim_next_sfm|runAlreadyClaimedSfm/,
    );
  });

  it("documents no auto FAILED→QUEUED in SFM pipeline source", () => {
    const sfmPipeline = read(SFM_PIPELINE);
    expect(sfmPipeline).toMatch(/No auto FAILED→QUEUED/);
    expect(sfmPipeline).not.toMatch(/status:\s*[\"']QUEUED[\"']/);
  });
});
