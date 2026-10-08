/**
 * P5.2 — StudioTransport BEAT_REF playback unit tests.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  gainDbToLinearVolume,
  msToSeconds,
  projectPlayheadToSourceSeconds,
  resolvePrimaryBeatRef,
  secondsToMs,
  sourceSecondsToProjectPlayheadMs,
} from "@/lib/studio/studio-beat-audio";
import {
  createStudioTransportState,
  reduceStudioTransport,
} from "@/lib/studio/studio-transport";
import type { StudioClipDto, StudioTrackDto } from "@/lib/studio/studio-types";

const BEAT_ID = "11111111-1111-4111-8111-111111111111";
const TRACK_ID = "22222222-2222-4222-8222-222222222222";

function beatTrack(overrides: Partial<StudioTrackDto> = {}): StudioTrackDto {
  return {
    id: TRACK_ID,
    projectId: "33333333-3333-4333-8333-333333333333",
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
    ...overrides,
  };
}

function beatClip(overrides: Partial<StudioClipDto> = {}): StudioClipDto {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    trackId: TRACK_ID,
    sourceKind: "BEAT_REF",
    sourceTakeId: null,
    sourceBeatId: BEAT_ID,
    sourceArtifactId: null,
    timelineStartMs: 0,
    durationMs: 90_000,
    sourceOffsetMs: 0,
    gainDb: 0,
    muted: false,
    fadeInMs: 0,
    fadeOutMs: 0,
    ...overrides,
  };
}

describe("P5.2 Project → BEAT_REF", () => {
  it("resolves primary BEAT_REF from clip + BEAT track", () => {
    const ref = resolvePrimaryBeatRef({
      tracks: [beatTrack()],
      clips: [beatClip()],
      projectBeatId: BEAT_ID,
    });
    expect(ref).not.toBeNull();
    expect(ref!.beatId).toBe(BEAT_ID);
    expect(ref!.clip.sourceKind).toBe("BEAT_REF");
    expect(ref!.track.trackType).toBe("BEAT");
  });

  it("falls back to project.beatId when clip missing", () => {
    const ref = resolvePrimaryBeatRef({
      tracks: [beatTrack()],
      clips: [],
      projectBeatId: BEAT_ID,
    });
    expect(ref?.beatId).toBe(BEAT_ID);
    expect(ref?.clip.id).toBe("virtual-beat-ref");
  });

  it("returns null without beat reference", () => {
    expect(
      resolvePrimaryBeatRef({
        tracks: [beatTrack({ trackType: "VOCAL", name: "Wokal" })],
        clips: [],
        projectBeatId: null,
      }),
    ).toBeNull();
  });

  it("prefers earliest BEAT_REF on timeline", () => {
    const later = beatClip({
      id: "55555555-5555-4555-8555-555555555555",
      timelineStartMs: 5000,
      sourceBeatId: "66666666-6666-4666-8666-666666666666",
    });
    const earlier = beatClip({ timelineStartMs: 1000 });
    const ref = resolvePrimaryBeatRef({
      tracks: [beatTrack()],
      clips: [later, earlier],
    });
    expect(ref!.beatId).toBe(BEAT_ID);
    expect(ref!.clip.timelineStartMs).toBe(1000);
  });

  it("AUD-01: rejects stale BEAT_REF when projectBeatId SSOT differs", () => {
    const stale = beatClip({
      sourceBeatId: "66666666-6666-4666-8666-666666666666",
      timelineStartMs: 0,
    });
    const ref = resolvePrimaryBeatRef({
      tracks: [beatTrack()],
      clips: [stale],
      projectBeatId: BEAT_ID,
    });
    expect(ref!.beatId).toBe(BEAT_ID);
    expect(ref!.clip.id).toBe("virtual-beat-ref");
  });
});

describe("P5.2 StudioTransport play/pause/stop/seek/position/duration", () => {
  it("play → tick position → pause preserves playhead → stop resets", () => {
    let state = createStudioTransportState(90_000);
    expect(state.timelineLengthMs).toBe(90_000);

    state = reduceStudioTransport(state, { type: "PLAY" });
    expect(state.phase).toBe("playing");

    state = reduceStudioTransport(state, { type: "TICK", deltaMs: 1500 });
    expect(state.playheadMs).toBe(1500);

    state = reduceStudioTransport(state, { type: "PAUSE" });
    expect(state.phase).toBe("paused");
    expect(state.playheadMs).toBe(1500);

    state = reduceStudioTransport(state, { type: "SEEK", playheadMs: 12_345 });
    expect(state.playheadMs).toBe(12_345);

    state = reduceStudioTransport(state, { type: "STOP" });
    expect(state.phase).toBe("stopped");
    expect(state.playheadMs).toBe(0);
  });

  it("seek clamps to timeline duration (integer ms)", () => {
    let state = createStudioTransportState(10_000);
    state = reduceStudioTransport(state, { type: "SEEK", playheadMs: 99_999 });
    expect(state.playheadMs).toBe(10_000);
    state = reduceStudioTransport(state, { type: "SEEK", playheadMs: -5 });
    expect(state.playheadMs).toBe(0);
  });
});

describe("P5.2 timeline synchronization (project ↔ source)", () => {
  it("maps playhead inside clip to source seconds", () => {
    const sec = projectPlayheadToSourceSeconds({
      playheadMs: 2500,
      clipTimelineStartMs: 1000,
      clipSourceOffsetMs: 500,
      clipDurationMs: 8000,
    });
    expect(sec).toBe(2); // (500 + 1500) ms
  });

  it("returns null when playhead outside clip", () => {
    expect(
      projectPlayheadToSourceSeconds({
        playheadMs: 50,
        clipTimelineStartMs: 1000,
        clipSourceOffsetMs: 0,
        clipDurationMs: 5000,
      }),
    ).toBeNull();
  });

  it("maps source seconds back to project playhead", () => {
    expect(
      sourceSecondsToProjectPlayheadMs({
        sourceSeconds: 3.5,
        clipTimelineStartMs: 1000,
        clipSourceOffsetMs: 500,
      }),
    ).toBe(4000); // 1000 + (3500 - 500)
  });

  it("converts ms ↔ seconds without float SSOT in persisted model", () => {
    expect(msToSeconds(1500)).toBe(1.5);
    expect(secondsToMs(1.5)).toBe(1500);
    expect(secondsToMs(Number.NaN)).toBe(0);
  });

  it("gainDb maps to linear volume for beat loudness", () => {
    expect(gainDbToLinearVolume(0)).toBe(1);
    expect(gainDbToLinearVolume(-6)).toBeCloseTo(0.501, 2);
    expect(gainDbToLinearVolume(12)).toBe(1); // capped
  });
});

describe("P5.2 authorization / unavailable asset / PlayerProvider isolation", () => {
  const providerSrc = readFileSync(
    join(process.cwd(), "src/components/studio/studio-transport-provider.tsx"),
    "utf8",
  );
  const beatAudioSrc = readFileSync(
    join(process.cwd(), "src/lib/studio/studio-beat-audio.ts"),
    "utf8",
  );
  const editorSrc = readFileSync(
    join(process.cwd(), "src/components/studio/studio-editor.tsx"),
    "utf8",
  );
  const serviceSrc = readFileSync(
    join(process.cwd(), "src/lib/studio/studio-service.ts"),
    "utf8",
  );
  const playerStateSrc = readFileSync(
    join(process.cwd(), "src/lib/player/playback-state.ts"),
    "utf8",
  );

  it("StudioTransportProvider uses StudioAudioEngine, not PlayerProvider engine", () => {
    expect(providerSrc).toMatch(/StudioAudioEngine/);
    expect(providerSrc).toMatch(/Distinct from PlayerProvider/);
    expect(providerSrc).toMatch(/setSuppressed\(true\)/);
    expect(providerSrc).not.toMatch(/reducePlayback/);
    expect(providerSrc).toMatch(/requestBeatAudioAccessAction/);
    expect(providerSrc).not.toMatch(/pickTakeClipAtPlayhead/);
  });

  it("surfaces Polish error without technical leak on unavailable asset", () => {
    const errorsSrc = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-audio-errors.ts"),
      "utf8",
    );
    expect(errorsSrc).toMatch(
      /Nie udało się odtworzyć bitu\. Sprawdź połączenie lub spróbuj ponownie\./,
    );
    expect(providerSrc).not.toMatch(/stack/i);
    expect(providerSrc).not.toMatch(/service_role/);
  });

  it("loading states include loading/ready/playing/paused/error/no_beat", () => {
    expect(providerSrc).toMatch(/"loading"/);
    expect(providerSrc).toMatch(/"ready"/);
    expect(providerSrc).toMatch(/"playing"/);
    expect(providerSrc).toMatch(/"paused"/);
    expect(providerSrc).toMatch(/"error"/);
    expect(providerSrc).toMatch(/"no_beat"/);
  });

  it("editor wires BEAT_REF into StudioTransportProvider", () => {
    expect(editorSrc).toMatch(/resolvePrimaryBeatRef/);
    expect(editorSrc).toMatch(/StudioTransportProvider/);
    expect(editorSrc).toMatch(/engineDocument/);
    expect(editorSrc).toMatch(/Bit projektu/);
  });

  it("create path still asserts ownership and BEAT_REF source_kind", () => {
    expect(serviceSrc).toMatch(/assertOwnsProject/);
    expect(serviceSrc).toMatch(/source_kind: "BEAT_REF"/);
    expect(serviceSrc).toMatch(/source_beat_id: beatId/);
  });

  it("catalog PlayerProvider playback-state unchanged by studio beat helpers", () => {
    expect(playerStateSrc).not.toMatch(/studio-beat-audio/);
    expect(playerStateSrc).not.toMatch(/StudioTransport/);
    expect(beatAudioSrc).not.toMatch(/playback-state/);
  });
});

describe("P5.2 P3/P4 regression guards", () => {
  it("studio service does not import take claim / eligibility mutators", () => {
    const service = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-service.ts"),
      "utf8",
    );
    expect(service).not.toMatch(/anon-account-claim/);
    expect(service).not.toMatch(/recording-eligibility-service/);
    expect(service).not.toMatch(/take-transport/);
  });

  it("P3 claim unit surface still present", () => {
    const claim = readFileSync(
      join(process.cwd(), "src/lib/takes/p3-claim-unit.test.ts"),
      "utf8",
    );
    expect(claim.length).toBeGreaterThan(100);
  });

  it("P4 foundation unit surface still present", () => {
    const p4 = readFileSync(
      join(process.cwd(), "src/lib/takes/p4-foundation.test.ts"),
      "utf8",
    );
    expect(p4.length).toBeGreaterThan(100);
  });
});
