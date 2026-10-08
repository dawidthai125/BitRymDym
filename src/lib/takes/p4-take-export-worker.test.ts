/**
 * P4.6 Phase 1 — TAKE_EXPORT worker code contracts (unit / source).
 * No production enqueue · no Contabo · no Storage mutation.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildTakeExportArtifactObjectKey,
  expectedTakeExportArtifactObjectKey,
  buildAudioArtifactObjectKey,
} from "@/lib/audio/artifact-object-key";
import { rejectClientRenderSourceClaims } from "@/lib/audio/render-source-core";
import { assertRenderTakeEligibleAtBake } from "@/lib/audio/render-source-core";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import {
  canExportOwnTake,
  renderTierForTakeExportQuality,
} from "@/lib/takes/take-export-capability";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const OWNER = "11111111-1111-1111-1111-111111111111";
const TAKE = "22222222-2222-2222-2222-222222222222";
const JOB = "33333333-3333-3333-3333-333333333333";
const BEAT = "44444444-4444-4444-4444-444444444444";
const MIX = "55555555-5555-5555-5555-555555555555";

function readyTake(overrides: Partial<Parameters<typeof assertRenderTakeEligibleAtBake>[0]["take"]> = {}) {
  const objectKey = `user/${OWNER}/takes/${TAKE}/mic.bin`;
  return {
    id: TAKE,
    owner_id: OWNER,
    beat_id: BEAT,
    status: "READY",
    object_key: objectKey,
    storage_bucket: "take-audio",
    content_type: "audio/webm",
    duration_seconds: 12,
    byte_size: 1024,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    deleted_at: null,
    ...overrides,
  };
}

describe("P4.6 Phase 1 TAKE_EXPORT source AuthZ (T01–T04)", () => {
  it("T01 ready owned take resolves", () => {
    const ref = assertRenderTakeEligibleAtBake({
      take: readyTake(),
      jobOwnerId: OWNER,
      expectedBeatId: BEAT,
    });
    expect(ref.kind).toBe("take");
    expect(ref.id).toBe(TAKE);
    expect(ref.storageBucket).toBe("take-audio");
  });

  it("T02 ownership rejection", () => {
    expect(() =>
      assertRenderTakeEligibleAtBake({
        take: readyTake({ owner_id: "99999999-9999-9999-9999-999999999999" }),
        jobOwnerId: OWNER,
        expectedBeatId: BEAT,
      }),
    ).toThrow(RenderJobDomainError);
  });

  it("T03 READY requirement", () => {
    expect(() =>
      assertRenderTakeEligibleAtBake({
        take: readyTake({ status: "PENDING_UPLOAD" }),
        jobOwnerId: OWNER,
        expectedBeatId: BEAT,
      }),
    ).toThrow(/READY/);
  });

  it("T04 client object_key spoof rejected", () => {
    expect(() =>
      rejectClientRenderSourceClaims({
        jobId: JOB,
        object_key: "evil/path.bin",
      }),
    ).toThrow(/object_key/);
  });
});

describe("P4.6 Phase 1 tier mapping (T05–T08, T17)", () => {
  it("T05 BASIC_MP3 / MP3_128", () => {
    expect(renderTierForTakeExportQuality("MP3_128")).toBe("BASIC_MP3");
    expect(canExportOwnTake({ premiumTier: "FREE", quality: "MP3_128" })).toBe(
      true,
    );
  });

  it("T06 MP3_192", () => {
    expect(renderTierForTakeExportQuality("MP3_192")).toBe("MP3_192");
    expect(canExportOwnTake({ premiumTier: "BRONZE", quality: "MP3_192" })).toBe(
      true,
    );
    expect(canExportOwnTake({ premiumTier: "FREE", quality: "MP3_192" })).toBe(
      false,
    );
  });

  it("T07 HQ_MP3 / MP3_320", () => {
    expect(renderTierForTakeExportQuality("MP3_320")).toBe("HQ_MP3");
  });

  it("T08 WAV", () => {
    expect(renderTierForTakeExportQuality("WAV")).toBe("WAV");
  });

  it("T17 tier from server quality map only (not client bitrate)", () => {
    const src = read("src/lib/takes/take-export-service.ts");
    expect(src).toMatch(/renderTierForTakeExportQuality/);
    expect(src).not.toMatch(/body\.bitrate|clientTier|requested_tier:\s*body/);
  });
});

describe("P4.6 Phase 1 artifact keys (T09–T11)", () => {
  it("T09 take-export artifact key", () => {
    const key = buildTakeExportArtifactObjectKey({
      ownerId: OWNER,
      takeId: TAKE,
      jobId: JOB,
      tier: "MP3_192",
    });
    expect(key).toBe(
      `user/${OWNER}/take-export/${TAKE}/jobs/${JOB}/MP3_192.mp3`,
    );
    expect(
      expectedTakeExportArtifactObjectKey({
        ownerId: OWNER,
        takeId: TAKE,
        jobId: JOB,
        tier: "MP3_192",
        objectKey: key,
      }),
    ).toBe(true);
  });

  it("T10/T11 completion writes take_id and null mix_session_id", () => {
    const pipeline = read("src/lib/audio/render-worker-pipeline.ts");
    expect(pipeline).toMatch(/take_id:\s*takeIdForInsert/);
    expect(pipeline).toMatch(
      /mix_session_id:\s*mode === "TAKE_EXPORT" \? null/,
    );
  });

  it("MIX key remains distinct from take-export", () => {
    const mixKey = buildAudioArtifactObjectKey({
      ownerId: OWNER,
      mixSessionId: MIX,
      jobId: JOB,
      tier: "BASIC_MP3",
    });
    expect(mixKey).toContain("/mix/");
    expect(mixKey).not.toContain("/take-export/");
    expect(() =>
      buildAudioArtifactObjectKey({
        ownerId: OWNER,
        mixSessionId: MIX,
        jobId: JOB,
        tier: "MP3_192",
      }),
    ).toThrow(/take-export only/);
  });
});

describe("P4.6 Phase 1 worker pipeline contracts (T12–T20)", () => {
  const pipeline = read("src/lib/audio/render-worker-pipeline.ts");
  const resolution = read("src/lib/audio/render-source-resolution.ts");
  const service = read("src/lib/takes/take-export-service.ts");
  const menu = read("src/components/takes/take-download-menu.tsx");
  const exportRoute = read("src/app/api/takes/export/route.ts");

  it("T12 MIX path still uses beat + bake", () => {
    expect(pipeline).toMatch(/bakeServerBasicV1/);
    expect(pipeline).toMatch(/bakeServerProV1/);
    expect(pipeline).toMatch(/resolveAuthorizedRenderSourcesForJob/);
  });

  it("T13/T18 TAKE_EXPORT does not call MIX bake", () => {
    const takeFnStart = pipeline.indexOf(
      "async function runClaimedTakeExportWorkerJob",
    );
    const nextFn = pipeline.indexOf(
      "async function runClaimedBasicMp3WorkerJob",
      takeFnStart,
    );
    const takeFn = pipeline.slice(takeFnStart, nextFn);
    expect(takeFn).toMatch(/resolveAuthorizedTakeExportSourcesForJob/);
    expect(takeFn).not.toMatch(/bakeServerBasicV1\(|bakeServerProV1\(/);
    expect(takeFn).not.toMatch(/fresh\.beat/);
  });

  it("T14 idempotency on enqueue", () => {
    expect(service).toMatch(/idempotency_key/);
    expect(service).toMatch(/eq\("idempotency_key"/);
  });

  it("T15 upload failure rollback pattern retained", () => {
    expect(pipeline).toMatch(/UPLOAD_FAILED/);
    expect(pipeline).toMatch(/\.remove\(\[params\.objectKey\]\)/);
  });

  it("T16 job failure helper retained", () => {
    expect(pipeline).toMatch(/failRunningJob/);
    expect(pipeline).toMatch(/ensureFailedIfStillRunning/);
  });

  it("T19 MP3_192 uses encodeMp3192FromBake", () => {
    expect(pipeline).toMatch(/encodeMp3192FromBake/);
    const takeFnStart = pipeline.indexOf("runClaimedTakeExportWorkerJob");
    const takeFn = pipeline.slice(takeFnStart, takeFnStart + 3500);
    expect(takeFn).toMatch(/encodeMp3192FromBake\(bake\)/);
  });

  it("T20 no FFmpeg in Vercel enqueue path", () => {
    expect(service).not.toMatch(/child_process|spawn\(|execFile\(|runFfmpeg/);
    expect(exportRoute).not.toMatch(/runRealRenderWorkerJob|encodeMp3/);
  });

  it("source resolution take-export exists; MIX resolver rejects TAKE_EXPORT", () => {
    expect(resolution).toMatch(/resolveAuthorizedTakeExportSourcesForJob/);
    expect(resolution).toMatch(
      /TAKE_EXPORT must use resolveAuthorizedTakeExportSourcesForJob/,
    );
  });

  it("workerInfraStatus is PREPARED_CODE (not false live READY)", () => {
    expect(service).toMatch(/workerInfraStatus:\s*"PREPARED_CODE"/);
    expect(service).not.toMatch(/workerInfraStatus:\s*"READY"/);
  });

  it("UI polls job and reuses mix artifact download", () => {
    expect(menu).toMatch(/\/api\/takes\/export\?jobId=/);
    expect(menu).toMatch(/\/api\/mix\/artifacts\/\$\{artifactId\}\/download/);
  });

  it("GET export status route present", () => {
    expect(exportRoute).toMatch(/export async function GET/);
    expect(exportRoute).toMatch(/getOwnTakeExportJob/);
  });

  it("dispatcher routes TAKE_EXPORT before MIX tiers", () => {
    const disp = pipeline.indexOf("export async function runRealRenderWorkerJob");
    const body = pipeline.slice(disp, disp + 800);
    expect(body.indexOf('job.kind === "TAKE_EXPORT"')).toBeLessThan(
      body.indexOf('job.requestedTier === "BASIC_MP3"'),
    );
  });
});
