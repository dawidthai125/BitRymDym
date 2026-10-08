import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  beatRefMatchesProjectSsot,
  resolvePrimaryBeatRef,
} from "@/lib/studio/studio-beat-audio";
import {
  mapMediaDevicesToAudioOutputs,
  resolveSelectedOutputDeviceId,
  shouldShowStudioOutputPicker,
  supportsAudioContextSetSinkId,
} from "@/lib/studio/studio-output-devices";
import type { StudioClipDto, StudioTrackDto } from "@/lib/studio/studio-types";

const root = process.cwd();

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const BEAT_NEW = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BEAT_OLD = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TRACK_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function beatTrack(): StudioTrackDto {
  return {
    id: TRACK_ID,
    projectId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    name: "Bit",
    trackType: "BEAT",
    sortOrder: 0,
    gainDb: 0,
    pan: 0,
    muted: false,
    solo: false,
    recordArmed: false,
    inputDeviceHint: null,
    outputRoute: "master",
    effectsChain: { schemaVersion: 1, effects: [] },
  };
}

function beatClip(overrides: Partial<StudioClipDto> = {}): StudioClipDto {
  return {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    trackId: TRACK_ID,
    sourceKind: "BEAT_REF",
    sourceTakeId: null,
    sourceBeatId: BEAT_OLD,
    sourceArtifactId: null,
    timelineStartMs: 0,
    durationMs: 60_000,
    sourceOffsetMs: 0,
    gainDb: 0,
    muted: false,
    fadeInMs: 0,
    fadeOutMs: 0,
    ...overrides,
  };
}

describe("AUD-01 beat attach + picker (source contracts)", () => {
  const service = readSrc("src/lib/studio/studio-service.ts");
  const beatRoute = readSrc(
    "src/app/api/studio/projects/[projectId]/beat/route.ts",
  );
  const pickerRoute = readSrc("src/app/api/studio/beat-picker/route.ts");
  const pickerUi = readSrc("src/components/studio/studio-beat-picker.tsx");
  const editor = readSrc("src/components/studio/studio-editor.tsx");

  it("attachBeat updates studio_projects.beat_id and reseeds BEAT_REF", () => {
    expect(service).toMatch(/attachBeatToStudioProjectFor/);
    expect(service).toMatch(/beat_id:\s*beatId/);
    expect(service).toMatch(/source_kind:\s*"BEAT_REF"/);
    expect(service).toMatch(/source_beat_id:\s*beatId/);
  });

  it("attach is fail-closed with snapshot + verify beat_id + restore", () => {
    expect(service).toMatch(/previousBeatRefs/);
    expect(service).toMatch(/runAttachBeatFailClosed/);
    expect(service).toMatch(/previousBeatId/);
    expect(service).toMatch(/readProjectBeatId/);
    expect(service).toMatch(/Project beat_id consistency check failed/);
    expect(service).toMatch(/BEAT_REF consistency check failed/);
    expect(service).toMatch(/Stale BEAT_REF remains after attach/);
    expect(service).toMatch(/assertOwnsProject/);
  });

  it("exposes POST attach + GET picker APIs", () => {
    expect(beatRoute).toMatch(/attachBeatToStudioProject/);
    expect(beatRoute).toMatch(/export async function POST/);
    expect(pickerRoute).toMatch(/listPublishedBeats/);
    expect(pickerRoute).toMatch(/listOwnUserBeats/);
    expect(pickerRoute).toMatch(/listMyDownloadHistory/);
    expect(pickerRoute).toMatch(/catalog\|mine\|downloads/);
  });

  it("picker UI has Katalog / Moje / Pobrane only (no favorites/saved)", () => {
    expect(pickerUi).toMatch(/Katalog/);
    expect(pickerUi).toMatch(/Moje/);
    expect(pickerUi).toMatch(/Pobrane/);
    expect(pickerUi).not.toMatch(/Ulubione/);
    expect(pickerUi).not.toMatch(/Zapisane/);
    expect(pickerUi).not.toMatch(/tab === "favorites"/);
  });

  it("editor empty state offers Wybierz bit CTA", () => {
    expect(editor).toMatch(/Wybierz bit/);
    expect(editor).toMatch(/StudioBeatPicker/);
    expect(editor).toMatch(/Nie masz jeszcze wybranego bitu/);
  });
});

describe("AUD-01 stale BEAT_REF vs projectBeatId SSOT", () => {
  it("beatRefMatchesProjectSsot rejects mismatched source", () => {
    expect(
      beatRefMatchesProjectSsot({
        projectBeatId: BEAT_NEW,
        sourceBeatId: BEAT_OLD,
      }),
    ).toBe(false);
    expect(
      beatRefMatchesProjectSsot({
        projectBeatId: BEAT_NEW,
        sourceBeatId: BEAT_NEW,
      }),
    ).toBe(true);
    expect(
      beatRefMatchesProjectSsot({
        projectBeatId: null,
        sourceBeatId: BEAT_OLD,
      }),
    ).toBe(false);
  });

  it("resolvePrimaryBeatRef ignores stale BEAT_REF and uses project SSOT", () => {
    const ref = resolvePrimaryBeatRef({
      tracks: [beatTrack()],
      clips: [beatClip({ sourceBeatId: BEAT_OLD, timelineStartMs: 0 })],
      projectBeatId: BEAT_NEW,
    });
    expect(ref).not.toBeNull();
    expect(ref!.beatId).toBe(BEAT_NEW);
    expect(ref!.clip.id).toBe("virtual-beat-ref");
    expect(ref!.clip.sourceBeatId).toBe(BEAT_NEW);
  });

  it("resolvePrimaryBeatRef keeps matching BEAT_REF when SSOT agrees", () => {
    const matching = beatClip({
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      sourceBeatId: BEAT_NEW,
      timelineStartMs: 1000,
    });
    const stale = beatClip({
      sourceBeatId: BEAT_OLD,
      timelineStartMs: 0,
    });
    const ref = resolvePrimaryBeatRef({
      tracks: [beatTrack()],
      clips: [stale, matching],
      projectBeatId: BEAT_NEW,
    });
    expect(ref!.beatId).toBe(BEAT_NEW);
    expect(ref!.clip.id).toBe(matching.id);
    expect(ref!.clip.timelineStartMs).toBe(1000);
  });
});

describe("AUD-01 output setSinkId helpers", () => {
  it("maps audiooutput devices only", () => {
    expect(
      mapMediaDevicesToAudioOutputs([
        { deviceId: "in", kind: "audioinput", label: "Mic" },
        { deviceId: "out", kind: "audiooutput", label: "Speakers" },
      ]),
    ).toEqual([{ deviceId: "out", label: "Speakers" }]);
  });

  it("Automatic preferred stays null; stale falls back to Automatic", () => {
    expect(
      resolveSelectedOutputDeviceId({
        preferredId: null,
        outputs: [{ deviceId: "a", label: "A" }],
      }),
    ).toEqual({ selectedId: null, fellBackFromStale: false });

    expect(
      resolveSelectedOutputDeviceId({
        preferredId: "gone",
        outputs: [{ deviceId: "a", label: "A" }],
      }),
    ).toEqual({ selectedId: null, fellBackFromStale: true });
  });

  it("shows picker only when setSinkId supported and not mobile", () => {
    expect(
      shouldShowStudioOutputPicker({
        supportsSetSinkId: true,
        isMobileLike: false,
      }),
    ).toBe(true);
    expect(
      shouldShowStudioOutputPicker({
        supportsSetSinkId: true,
        isMobileLike: true,
      }),
    ).toBe(false);
    expect(
      shouldShowStudioOutputPicker({
        supportsSetSinkId: false,
        isMobileLike: false,
      }),
    ).toBe(false);
  });

  it("detects setSinkId from prototype", () => {
    class FakeCtx {
      setSinkId() {
        return Promise.resolve();
      }
    }
    class NoSink {}
    expect(supportsAudioContextSetSinkId(FakeCtx as never)).toBe(true);
    expect(supportsAudioContextSetSinkId(NoSink as never)).toBe(false);
  });
});

describe("AUD-01 architecture + mic lifecycle guards", () => {
  const panel = readSrc("src/components/studio/studio-recording-panel.tsx");
  const engine = readSrc("src/lib/studio/studio-audio-engine.ts");
  const output = readSrc("src/lib/studio/studio-output-devices.ts");
  const beatAudio = readSrc("src/lib/studio/studio-beat-audio.ts");

  it("reuses useMicAnalyser + BrdInputMonitor for live tester", () => {
    expect(panel).toMatch(/useMicAnalyser/);
    expect(panel).toMatch(/BrdInputMonitor/);
    expect(panel).toMatch(/Test mikrofonu/);
    expect(panel).toMatch(/Zaawansowane ustawienia audio/);
    expect(panel).toMatch(/Automatycznie — urządzenie systemowe/);
  });

  it("stops tester before recorder.start (no dual-stream window)", () => {
    const startFn = panel.indexOf("async function startRecording");
    expect(startFn).toBeGreaterThan(-1);
    const armIdx = panel.indexOf("captureArmingRef.current = true", startFn);
    const stopIdx = panel.indexOf("stopTesterStream()", armIdx);
    const startIdx = panel.indexOf("await recorder.start", armIdx);
    expect(armIdx).toBeGreaterThan(startFn);
    expect(stopIdx).toBeGreaterThan(armIdx);
    expect(startIdx).toBeGreaterThan(stopIdx);
  });

  it("does not invent a second StudioAudioEngine or fake output without setSinkId", () => {
    expect(panel).not.toMatch(/new StudioAudioEngine/);
    expect(panel).not.toMatch(/new AudioContext/);
    expect(output).toMatch(/setSinkId/);
    expect(engine).toMatch(/setOutputSinkId/);
    expect(engine.match(/class StudioAudioEngine/g)?.length).toBe(1);
  });

  it("transport SSOT guard lives in studio-beat-audio", () => {
    expect(beatAudio).toMatch(/beatRefMatchesProjectSsot/);
    expect(beatAudio).toMatch(/projectBeatId/);
  });

  it("editor + schedule filter stale BEAT_REF from engine path", () => {
    const editor = readSrc("src/components/studio/studio-editor.tsx");
    const schedule = readSrc("src/lib/studio/studio-audio-schedule.ts");
    expect(editor).toMatch(/projectBeatId:\s*doc\.project\.beatId/);
    expect(editor).toMatch(/beatRefMatchesProjectSsot/);
    expect(schedule).toMatch(/projectBeatId/);
    expect(schedule).toMatch(/beatRefMatchesProjectSsot/);
    expect(schedule).toMatch(/sourceKind === "BEAT_REF"/);
  });

  it("mobile output copy is Automatic-only when picker disabled", () => {
    expect(panel).toMatch(/Automatyczny — urządzenie systemowe/);
    expect(panel).toMatch(/pickerEnabled/);
  });
});
