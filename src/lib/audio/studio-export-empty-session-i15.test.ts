/**
 * Stage I.15 — STUDIO_EXPORT empty-session contract acceptance (local unit/source).
 * No DB, Storage, worker process, Contabo, or .env.local.
 *
 * Owner I.14-02: fully muted / inaudible session → STUDIO_RENDER_EMPTY_SESSION
 * at offline renderer; bake must FAILED without WAV artifact / SUCCEEDED.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { DecodedPcmStereo } from "@/lib/audio/render-decode";
import type {
  StudioEngineClip,
  StudioEngineDocument,
  StudioEngineTrack,
} from "@/lib/studio/studio-audio-schedule";
import {
  renderStudioDocumentOffline,
  STUDIO_OFFLINE_RENDER_SAMPLE_RATE,
} from "@/lib/studio/studio-offline-render";

const PIPELINE = "src/lib/audio/render-worker-pipeline.ts";
const EXPORT_SERVICE = "src/lib/audio/studio-export-service.ts";
const EXPORT_ROUTE =
  "src/app/api/studio/projects/[projectId]/export/route.ts";

function track(
  partial: Partial<StudioEngineTrack> & Pick<StudioEngineTrack, "id">,
): StudioEngineTrack {
  return {
    gainDb: 0,
    pan: 0,
    muted: false,
    solo: false,
    ...partial,
  };
}

function clip(
  partial: Partial<StudioEngineClip> &
    Pick<StudioEngineClip, "id" | "trackId" | "sourceKind">,
): StudioEngineClip {
  return {
    sourceTakeId: partial.sourceKind === "TAKE" ? "take-1" : null,
    sourceBeatId: partial.sourceKind === "BEAT_REF" ? "beat-1" : null,
    sourceOffsetMs: 0,
    timelineStartMs: 0,
    durationMs: 1000,
    gainDb: 0,
    muted: false,
    fadeInMs: 0,
    fadeOutMs: 0,
    ...partial,
  };
}

function doc(
  partial: Partial<StudioEngineDocument> &
    Pick<StudioEngineDocument, "tracks" | "clips">,
): StudioEngineDocument {
  return {
    timelineLengthMs: 1000,
    masterGainDb: 0,
    masterPan: 0,
    projectBeatId: "beat-1",
    ...partial,
  };
}

function constPcm(frames: number, amp = 0.25): DecodedPcmStereo {
  const interleaved = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    interleaved[i * 2] = amp;
    interleaved[i * 2 + 1] = amp;
  }
  return {
    sampleRate: STUDIO_OFFLINE_RENDER_SAMPLE_RATE,
    channels: 2,
    frames,
    interleaved,
  };
}

const resolveTake = async () => constPcm(2000);

describe("I.15 — offline EMPTY_SESSION (audible-set contract)", () => {
  it("1) all tracks muted → STUDIO_RENDER_EMPTY_SESSION (not silent WAV)", async () => {
    await expect(
      renderStudioDocumentOffline({
        document: doc({
          tracks: [track({ id: "t1", muted: true })],
          clips: [
            clip({
              id: "c1",
              trackId: "t1",
              sourceKind: "TAKE",
              sourceTakeId: "take-1",
            }),
          ],
        }),
        resolvePcm: resolveTake,
      }),
    ).rejects.toMatchObject({ code: "STUDIO_RENDER_EMPTY_SESSION" });
  });

  it("2) all clips muted (track unmuted) → STUDIO_RENDER_EMPTY_SESSION", async () => {
    await expect(
      renderStudioDocumentOffline({
        document: doc({
          tracks: [track({ id: "t1", muted: false })],
          clips: [
            clip({
              id: "c1",
              trackId: "t1",
              sourceKind: "TAKE",
              sourceTakeId: "take-1",
              muted: true,
            }),
          ],
        }),
        resolvePcm: resolveTake,
      }),
    ).rejects.toMatchObject({ code: "STUDIO_RENDER_EMPTY_SESSION" });
  });

  it("3) no clips → STUDIO_RENDER_EMPTY_SESSION (distinct from MIX/TAKE kinds)", async () => {
    await expect(
      renderStudioDocumentOffline({
        document: doc({
          tracks: [track({ id: "t1" })],
          clips: [],
        }),
        resolvePcm: resolveTake,
      }),
    ).rejects.toMatchObject({ code: "STUDIO_RENDER_EMPTY_SESSION" });
  });

  it("4) solo on empty track silences other tracks → EMPTY_SESSION", async () => {
    await expect(
      renderStudioDocumentOffline({
        document: doc({
          tracks: [
            track({ id: "t-solo", solo: true, muted: false }),
            track({ id: "t-audio", solo: false, muted: false }),
          ],
          clips: [
            clip({
              id: "c1",
              trackId: "t-audio",
              sourceKind: "TAKE",
              sourceTakeId: "take-1",
            }),
          ],
        }),
        resolvePcm: resolveTake,
      }),
    ).rejects.toMatchObject({ code: "STUDIO_RENDER_EMPTY_SESSION" });
  });

  it("5) audible session still renders PCM (non-empty path intact)", async () => {
    const result = await renderStudioDocumentOffline({
      document: doc({
        tracks: [track({ id: "t1" })],
        clips: [
          clip({
            id: "c1",
            trackId: "t1",
            sourceKind: "TAKE",
            sourceTakeId: "take-1",
            durationMs: 200,
          }),
        ],
        timelineLengthMs: 200,
      }),
      resolvePcm: resolveTake,
    });
    expect(result.frames).toBeGreaterThan(16);
    expect(result.interleaved.length).toBe(result.frames * 2);
    expect(result.sampleRate).toBe(STUDIO_OFFLINE_RENDER_SAMPLE_RATE);
  });
});

describe("I.15 — worker bake mapping (source contract; no live job)", () => {
  const src = readFileSync(join(process.cwd(), PIPELINE), "utf8");

  function studioExportFnBody(): string {
    const start = src.indexOf(
      "export async function runAlreadyClaimedStudioExportWorkerJob",
    );
    const end = src.indexOf("async function runClaimedTakeExportWorkerJob");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  }

  it("maps STUDIO_RENDER_EMPTY_SESSION → preserved job error_code (I.17)", () => {
    const mapStart = src.indexOf("function mapStudioOfflineRenderFail");
    const mapEnd = src.indexOf("export async function runRealRenderWorkerJob");
    const mapBody = src.slice(mapStart, mapEnd);
    expect(mapBody).toMatch(/case\s+"STUDIO_RENDER_EMPTY_SESSION"/);
    expect(mapBody).toMatch(
      /case\s+"STUDIO_RENDER_EMPTY_SESSION"\s*:\s*return\s*\{\s*code:\s*"STUDIO_RENDER_EMPTY_SESSION"/,
    );
  });

  it("EMPTY_SESSION path failRunningJob before encodeWav / artifact complete", () => {
    const body = studioExportFnBody();
    const offlineIdx = body.indexOf("renderStudioDocumentOffline");
    const failIdx = body.indexOf("failRunningJob", offlineIdx);
    const encodeIdx = body.indexOf("encodeWavFromBake");
    const completeIdx = body.indexOf("completeRealArtifactAfterEncode");
    expect(offlineIdx).toBeGreaterThanOrEqual(0);
    expect(failIdx).toBeGreaterThan(offlineIdx);
    expect(encodeIdx).toBeGreaterThan(failIdx);
    expect(completeIdx).toBeGreaterThan(encodeIdx);
    // Offline catch maps typed error then fails job — no silent continue to WAV.
    const afterOffline = body.slice(offlineIdx, encodeIdx);
    expect(afterOffline).toMatch(/mapStudioOfflineRenderFail/);
    expect(afterOffline).toMatch(/failRunningJob/);
    expect(afterOffline).not.toMatch(/encodeWavFromBake/);
  });

  it("preserves distinct mappings for source/limit failures (not collapsed into EMPTY)", () => {
    const mapStart = src.indexOf("function mapStudioOfflineRenderFail");
    const mapEnd = src.indexOf("export async function runRealRenderWorkerJob");
    const mapBody = src.slice(mapStart, mapEnd);
    expect(mapBody).toMatch(
      /STUDIO_RENDER_SOURCE_MISSING[\s\S]*code:\s*"SOURCE_UNAVAILABLE"/,
    );
    expect(mapBody).toMatch(
      /STUDIO_RENDER_DURATION_CAP[\s\S]*code:\s*"LIMIT"/,
    );
    expect(mapBody).toMatch(
      /STUDIO_RENDER_MEMORY_CAP[\s\S]*code:\s*"LIMIT"/,
    );
  });

  it("MIX and TAKE_EXPORT remain on separate bake entry paths", () => {
    expect(src).toMatch(/job\.kind === "TAKE_EXPORT"/);
    expect(src).toMatch(/job\.kind === "STUDIO_EXPORT"/);
    expect(src).toMatch(/runClaimedTakeExportWorkerJob/);
    expect(src).toMatch(/runAlreadyClaimedStudioExportWorkerJob/);
    // Pre-poller name must not return (I.45E contract).
    expect(src).not.toMatch(/runClaimedStudioExportWorkerJob/);
    // MIX still gated by requestedTier after STUDIO/TAKE dispatch.
    const dispatcher = src.slice(
      src.indexOf("export async function runRealRenderWorkerJob"),
      src.indexOf("export async function runAlreadyClaimedStudioExportWorkerJob"),
    );
    expect(dispatcher).toMatch(/TAKE_EXPORT/);
    expect(dispatcher).toMatch(/STUDIO_EXPORT/);
    expect(dispatcher).toMatch(
      /job\.kind === "STUDIO_EXPORT"[\s\S]*?return runAlreadyClaimedStudioExportWorkerJob\(job\)/,
    );
  });
});

describe("I.15 / I.17 — API surface (typed failure fields)", () => {
  it("status GET exposes allowlisted errorCode/errorMessage (I.17 variant B)", () => {
    const route = readFileSync(join(process.cwd(), EXPORT_ROUTE), "utf8");
    const service = readFileSync(join(process.cwd(), EXPORT_SERVICE), "utf8");
    expect(route).toMatch(/artifactId: job\.artifactId/);
    expect(route).toMatch(/errorCode:\s*job\.errorCode/);
    expect(route).toMatch(/errorMessage:\s*job\.errorMessage/);
    expect(service).toMatch(/errorCode\?:/);
    expect(service).toMatch(/publicStudioExportFailure/);
  });
});
