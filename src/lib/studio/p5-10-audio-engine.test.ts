/**
 * P5.10 StudioAudioEngine / multi-source playback unit tests.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createStudioClockEpoch,
  isVoiceInSync,
  MAX_SYNC_SKEW_MS,
  playheadMsFromContextClock,
  sourceOffsetSecondsAtPlayhead,
} from "@/lib/studio/studio-audio-clock";
import {
  StudioAudioEngine,
  type StudioAudioContextLike,
  type StudioAudioEngineHost,
  type StudioMediaElement,
} from "@/lib/studio/studio-audio-engine";
import {
  isStudioAudioErrorCode,
  labelStudioAudioError,
  STUDIO_AUDIO_ERROR_CODES,
} from "@/lib/studio/studio-audio-errors";
import {
  clipGraphGain,
  masterGraphParams,
  planVoicesAtPlayhead,
  trackGraphParams,
  type StudioEngineClip,
  type StudioEngineDocument,
  type StudioEngineTrack,
} from "@/lib/studio/studio-audio-schedule";
import {
  createArtifactSourceAdapter,
  createBeatRefSourceAdapter,
  createDefaultStudioSourceAdapters,
  createStudioSourceAdapterRegistry,
  createTakeSourceAdapter,
} from "@/lib/studio/studio-audio-source-adapter";
import { reduceStudioTransport } from "@/lib/studio/studio-transport";

const BEAT_ID = "11111111-1111-4111-8111-111111111111";
const TAKE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TAKE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function track(
  id: string,
  overrides: Partial<StudioEngineTrack> = {},
): StudioEngineTrack {
  return {
    id,
    gainDb: 0,
    pan: 0,
    muted: false,
    solo: false,
    ...overrides,
  };
}

function clip(
  overrides: Partial<StudioEngineClip> & Pick<StudioEngineClip, "id" | "trackId" | "sourceKind">,
): StudioEngineClip {
  return {
    sourceTakeId: null,
    sourceBeatId: null,
    sourceOffsetMs: 0,
    timelineStartMs: 0,
    durationMs: 5000,
    gainDb: 0,
    muted: false,
    fadeInMs: 0,
    fadeOutMs: 0,
    ...overrides,
  };
}

function documentOf(
  tracks: StudioEngineTrack[],
  clips: StudioEngineClip[],
): StudioEngineDocument {
  return {
    timelineLengthMs: 20_000,
    masterGainDb: 0,
    masterPan: 0,
    tracks,
    clips,
  };
}

describe("P5.10 clock mapping", () => {
  it("maps AudioContext time to integer-ms playhead from a shared epoch", () => {
    const epoch = createStudioClockEpoch({
      contextTime: 10,
      playheadMs: 1500,
    });
    expect(
      playheadMsFromContextClock({
        epoch,
        contextTime: 11.25,
        timelineLengthMs: 90_000,
      }),
    ).toBe(2750);
  });

  it("computes source offset inside clip geometry", () => {
    expect(
      sourceOffsetSecondsAtPlayhead({
        playheadMs: 3000,
        timelineStartMs: 1000,
        sourceOffsetMs: 500,
        durationMs: 8000,
      }),
    ).toBe(2.5);
    expect(
      sourceOffsetSecondsAtPlayhead({
        playheadMs: 500,
        timelineStartMs: 1000,
        sourceOffsetMs: 0,
        durationMs: 8000,
      }),
    ).toBeNull();
  });

  it("treats skew beyond MAX_SYNC_SKEW_MS as out of sync", () => {
    expect(MAX_SYNC_SKEW_MS).toBe(40);
    expect(
      isVoiceInSync({
        expectedSourceSeconds: 1.2,
        actualSourceSeconds: 1.21,
      }),
    ).toBe(true);
    expect(
      isVoiceInSync({
        expectedSourceSeconds: 1.2,
        actualSourceSeconds: 1.3,
      }),
    ).toBe(false);
  });
});

describe("P5.10 overlap schedule replaces first-wins", () => {
  const beatTrack = track("beat");
  const vocalTrack = track("vocal");
  const beat = clip({
    id: "c-beat",
    trackId: "beat",
    sourceKind: "BEAT_REF",
    sourceBeatId: BEAT_ID,
    durationMs: 10_000,
  });
  const take1 = clip({
    id: "c-take-1",
    trackId: "vocal",
    sourceKind: "TAKE",
    sourceTakeId: TAKE_A,
    timelineStartMs: 0,
    durationMs: 5000,
  });
  const take2 = clip({
    id: "c-take-2",
    trackId: "vocal",
    sourceKind: "TAKE",
    sourceTakeId: TAKE_B,
    timelineStartMs: 3000,
    durationMs: 5000,
  });

  it("Beat + Take are both planned", () => {
    const plans = planVoicesAtPlayhead(
      documentOf([beatTrack, vocalTrack], [beat, take1]),
      1000,
    );
    expect(plans.map((p) => p.clipId).sort()).toEqual(["c-beat", "c-take-1"]);
  });

  it("overlapping Takes mix (A+B), not first-wins", () => {
    const plans = planVoicesAtPlayhead(
      documentOf([beatTrack, vocalTrack], [beat, take1, take2]),
      4000,
    );
    const takeIds = plans.filter((p) => p.sourceKind === "TAKE").map((p) => p.clipId);
    expect(takeIds.sort()).toEqual(["c-take-1", "c-take-2"]);
    expect(plans).toHaveLength(3);
  });

  it("Beat + multiple Takes schedule together", () => {
    const plans = planVoicesAtPlayhead(
      documentOf([beatTrack, vocalTrack], [beat, take1, take2]),
      3500,
    );
    expect(plans.map((p) => p.clipId).sort()).toEqual([
      "c-beat",
      "c-take-1",
      "c-take-2",
    ]);
  });

  it("seek offsets are per-clip and aligned to the same playhead", () => {
    const plans = planVoicesAtPlayhead(
      documentOf([beatTrack, vocalTrack], [beat, take1, take2]),
      4000,
    );
    const byId = new Map(plans.map((p) => [p.clipId, p]));
    expect(byId.get("c-beat")?.sourceOffsetSeconds).toBe(4);
    expect(byId.get("c-take-1")?.sourceOffsetSeconds).toBe(4);
    expect(byId.get("c-take-2")?.sourceOffsetSeconds).toBe(1);
  });

  it("muted clip and inaudible track are excluded", () => {
    const plans = planVoicesAtPlayhead(
      documentOf(
        [beatTrack, track("vocal", { muted: true })],
        [beat, { ...take1, muted: true }, take2],
      ),
      3500,
    );
    expect(plans.map((p) => p.clipId)).toEqual(["c-beat"]);
  });

  it("clip MOVE / TRIM / DELETE change the audible set without a second clip model", () => {
    const base = documentOf(
      [beatTrack, vocalTrack],
      [beat, take1, take2],
    );
    const moved = {
      ...base,
      clips: base.clips.map((c) =>
        c.id === "c-take-2" ? { ...c, timelineStartMs: 8000 } : c,
      ),
    };
    expect(
      planVoicesAtPlayhead(moved, 4000)
        .map((p) => p.clipId)
        .sort(),
    ).toEqual(["c-beat", "c-take-1"]);

    const trimmed = {
      ...base,
      clips: base.clips.map((c) =>
        c.id === "c-take-1" ? { ...c, durationMs: 2000 } : c,
      ),
    };
    expect(
      planVoicesAtPlayhead(trimmed, 4000)
        .filter((p) => p.sourceKind === "TAKE")
        .map((p) => p.clipId),
    ).toEqual(["c-take-2"]);

    const splitLeft = clip({
      id: "c-take-1a",
      trackId: "vocal",
      sourceKind: "TAKE",
      sourceTakeId: TAKE_A,
      timelineStartMs: 0,
      durationMs: 2000,
    });
    const splitRight = clip({
      id: "c-take-1b",
      trackId: "vocal",
      sourceKind: "TAKE",
      sourceTakeId: TAKE_A,
      timelineStartMs: 2000,
      sourceOffsetMs: 2000,
      durationMs: 3000,
    });
    const splitDoc = documentOf([beatTrack, vocalTrack], [beat, splitLeft, splitRight]);
    expect(
      planVoicesAtPlayhead(splitDoc, 2500).find((p) => p.clipId === "c-take-1b")
        ?.sourceOffsetSeconds,
    ).toBe(2.5);

    const deleted = {
      ...base,
      clips: base.clips.filter((c) => c.id !== "c-take-1"),
    };
    expect(
      planVoicesAtPlayhead(deleted, 4000).map((p) => p.clipId).sort(),
    ).toEqual(["c-beat", "c-take-2"]);
  });
});

describe("P5.10 gain / mute / solo / pan graph params", () => {
  it("maps gainDb through existing linear helper and mute to 0", () => {
    expect(clipGraphGain({ gainDb: 0, muted: false })).toBe(1);
    expect(clipGraphGain({ gainDb: -6, muted: false })).toBeCloseTo(0.501, 2);
    expect(clipGraphGain({ gainDb: 0, muted: true })).toBe(0);
    expect(trackGraphParams(track("t", { gainDb: -6 }), false).gain).toBeCloseTo(
      0.501,
      2,
    );
    expect(trackGraphParams(track("t", { muted: true }), false).gain).toBe(0);
    expect(trackGraphParams(track("t", { solo: false }), true).gain).toBe(0);
    expect(trackGraphParams(track("t", { pan: 0.5 }), false).pan).toBe(0.5);
    expect(masterGraphParams({ masterGainDb: 0, masterPan: -0.25 }).pan).toBe(
      -0.25,
    );
  });
});

describe("P5.10 adapter registry / fail-closed", () => {
  it("dispatches by registry, not engine core sourceKind switches", () => {
    const engineSrc = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-audio-engine.ts"),
      "utf8",
    );
    expect(engineSrc).not.toMatch(/if \(clip\.sourceKind === "TAKE"\)/);
    expect(engineSrc).not.toMatch(/sourceKind === "BEAT_REF"/);
    expect(engineSrc).toMatch(/this\.registry\.get\(clip\.sourceKind\)/);
  });

  it("TAKE and BEAT_REF resolve injected URLs; ARTIFACT stays unavailable", async () => {
    const beat = createBeatRefSourceAdapter(async (id) => ({
      url: `https://cdn.example/${id}.mp3`,
      expiresAt: Date.now() + 60_000,
    }));
    const take = createTakeSourceAdapter(async (id) => ({
      url: `https://cdn.example/${id}.wav`,
      expiresAt: Date.now() + 60_000,
    }));
    const artifact = createArtifactSourceAdapter();
    const beatClip = clip({
      id: "b",
      trackId: "beat",
      sourceKind: "BEAT_REF",
      sourceBeatId: BEAT_ID,
    });
    const takeClip = clip({
      id: "t",
      trackId: "vocal",
      sourceKind: "TAKE",
      sourceTakeId: TAKE_A,
    });
    const artClip = clip({
      id: "a",
      trackId: "vocal",
      sourceKind: "ARTIFACT",
    });
    expect((await beat.resolve(beatClip)).ok).toBe(true);
    expect((await take.resolve(takeClip)).ok).toBe(true);
    const art = await artifact.resolve(artClip);
    expect(art.ok).toBe(false);
    if (!art.ok) expect(art.code).toBe("AUDIO_SOURCE_UNAVAILABLE");
  });

  it("missing take id fails closed without substituting another source", async () => {
    const adapter = createTakeSourceAdapter(async () => ({
      url: "https://cdn.example/other.wav",
      expiresAt: Date.now() + 60_000,
    }));
    const result = await adapter.resolve(
      clip({ id: "t", trackId: "vocal", sourceKind: "TAKE", sourceTakeId: null }),
    );
    expect(result.ok).toBe(false);
  });

  it("unknown kind is unavailable via registry miss", () => {
    const registry = createStudioSourceAdapterRegistry([
      createArtifactSourceAdapter(),
    ]);
    expect(registry.get("TAKE")).toBeUndefined();
    expect(registry.get("ARTIFACT")?.kind).toBe("ARTIFACT");
  });
});

function fakeNode(): {
  connect: (dest: never) => never;
  disconnect: () => void;
  gain: { value: number };
  pan: { value: number };
} {
  const node = {
    gain: { value: 1 },
    pan: { value: 0 },
    connect(dest: never) {
      return dest;
    },
    disconnect() {},
  };
  return node;
}

function createFakeHost(played: string[]): StudioAudioEngineHost {
  let time = 0;
  const ctx = {
    currentTime: 0,
    state: "running",
    destination: fakeNode(),
    async resume() {},
    async close() {},
    createGain: () => fakeNode(),
    createStereoPanner: () => fakeNode(),
    createAnalyser: () => {
      const node = fakeNode() as ReturnType<typeof fakeNode> & {
        fftSize: number;
        smoothingTimeConstant: number;
        frequencyBinCount: number;
        getFloatTimeDomainData: (array: Float32Array) => void;
      };
      node.fftSize = 256;
      node.smoothingTimeConstant = 0;
      node.frequencyBinCount = 128;
      node.getFloatTimeDomainData = (array: Float32Array) => {
        array.fill(0);
      };
      return node;
    },
    createMediaElementSource: () => fakeNode(),
  } as unknown as StudioAudioContextLike;
  return {
    createContext() {
      return ctx;
    },
    createMediaElement() {
      const el: StudioMediaElement = {
        src: "",
        currentTime: 0,
        paused: true,
        volume: 1,
        muted: false,
        crossOrigin: null,
        preload: "auto",
        async play() {
          this.paused = false;
          played.push(this.src);
        },
        pause() {
          this.paused = true;
        },
        load() {},
      };
      return el;
    },
    nowMs() {
      time += 16;
      return time;
    },
    requestTick() {
      return 1;
    },
    cancelTick() {},
  };
}

describe("P5.10 engine lifecycle / multi-source play", () => {
  it("plays overlapping voices through the graph and stops to playhead 0", async () => {
    const played: string[] = [];
    const playheads: number[] = [];
    const registry = createStudioSourceAdapterRegistry(
      createDefaultStudioSourceAdapters({
        resolveBeatUrl: async () => ({
          url: "https://cdn.example/beat.mp3",
          expiresAt: Date.now() + 60_000,
        }),
        resolveTakeUrl: async (id) => ({
          url: `https://cdn.example/${id}.wav`,
          expiresAt: Date.now() + 60_000,
        }),
      }),
    );
    const engine = new StudioAudioEngine({
      registry,
      host: createFakeHost(played),
      listener: {
        onPlayhead: (ms) => playheads.push(ms),
        onLifecycle: () => undefined,
        onError: () => undefined,
        onTimelineEnded: () => undefined,
      },
    });
    engine.setDocument(
      documentOf(
        [track("beat"), track("vocal")],
        [
          clip({
            id: "c-beat",
            trackId: "beat",
            sourceKind: "BEAT_REF",
            sourceBeatId: BEAT_ID,
            durationMs: 10_000,
          }),
          clip({
            id: "c-take-1",
            trackId: "vocal",
            sourceKind: "TAKE",
            sourceTakeId: TAKE_A,
            durationMs: 5000,
          }),
          clip({
            id: "c-take-2",
            trackId: "vocal",
            sourceKind: "TAKE",
            sourceTakeId: TAKE_B,
            timelineStartMs: 3000,
            durationMs: 5000,
          }),
        ],
      ),
    );
    await engine.play(3500);
    expect(engine.getLifecycle()).toBe("playing");
    expect(engine.getActiveVoiceCount()).toBe(3);
    expect(played).toHaveLength(3);
    expect(played).toContain("https://cdn.example/beat.mp3");
    expect(played).toContain(`https://cdn.example/${TAKE_A}.wav`);
    expect(played).toContain(`https://cdn.example/${TAKE_B}.wav`);
    engine.pause();
    expect(engine.getLifecycle()).toBe("paused");
    expect(engine.getActiveVoiceCount()).toBe(0);
    await engine.play(3500);
    expect(engine.getActiveVoiceCount()).toBe(3);
    engine.stop();
    expect(engine.getLifecycle()).toBe("stopped");
    expect(playheads.at(-1)).toBe(0);
    expect(reduceStudioTransport({ phase: "playing", playheadMs: 9, timelineLengthMs: 20_000 }, { type: "STOP" }).playheadMs).toBe(0);
    engine.dispose();
    expect(engine.getLifecycle()).toBe("disposed");
    expect(engine.getActiveVoiceCount()).toBe(0);
  });

  it("does not apply track mix via HTMLAudioElement.volume", async () => {
    const engineSrc = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-audio-engine.ts"),
      "utf8",
    );
    expect(engineSrc).toMatch(/createGain/);
    expect(engineSrc).toMatch(/createStereoPanner/);
    expect(engineSrc).not.toMatch(/element\.volume\s*=\s*gainDbToLinearVolume/);
    expect(engineSrc).toMatch(/clipGain\.gain\.value/);
  });
});

describe("P5.10 errors / isolation / security", () => {
  it("exposes freeze error codes with Polish user-facing labels", () => {
    expect(STUDIO_AUDIO_ERROR_CODES).toContain("AUDIO_CONTEXT_UNAVAILABLE");
    expect(STUDIO_AUDIO_ERROR_CODES).toContain("AUDIO_SOURCE_UNAVAILABLE");
    expect(isStudioAudioErrorCode("AUDIO_DECODE_FAILED")).toBe(true);
    expect(labelStudioAudioError("AUDIO_PLAYBACK_FAILED")).toMatch(/Nie udało się/);
  });

  it("engine is isolated from PlayerProvider, MixPanel, recording, and storage authority", () => {
    const engineSrc = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-audio-engine.ts"),
      "utf8",
    );
    const adapterSrc = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-audio-source-adapter.ts"),
      "utf8",
    );
    const providerSrc = readFileSync(
      join(
        process.cwd(),
        "src/components/studio/studio-transport-provider.tsx",
      ),
      "utf8",
    );
    expect(engineSrc).toMatch(/StudioAudioEngine/);
    expect(engineSrc).not.toMatch(/@\/components\/player/);
    expect(engineSrc).not.toMatch(/reducePlayback/);
    expect(engineSrc).not.toMatch(/createMixPreviewGraph/);
    expect(engineSrc).not.toMatch(/getUserMedia/);
    expect(engineSrc).not.toMatch(/ownerId/);
    expect(engineSrc).not.toMatch(/objectKey/);
    expect(adapterSrc).not.toMatch(/ownerId/);
    expect(adapterSrc).not.toMatch(/objectKey/);
    expect(providerSrc).toMatch(/Distinct from PlayerProvider/);
    expect(providerSrc).toMatch(/StudioAudioEngine/);
    expect(providerSrc).toMatch(/setSuppressed\(true\)/);
    expect(providerSrc).toMatch(/requestBeatAudioAccessAction/);
    expect(providerSrc).toMatch(/\/api\/takes\/preview/);
    expect(providerSrc).toMatch(/previewTake/);
    expect(providerSrc).not.toMatch(/PlayerProvider\s*\(/);
    expect(providerSrc).not.toMatch(/\.volume\s*=/);
    expect(providerSrc).not.toMatch(/pickTakeClipAtPlayhead/);
  });

  it("recording panel still must not own StudioAudioEngine", () => {
    const panel = readFileSync(
      join(process.cwd(), "src/components/studio/studio-recording-panel.tsx"),
      "utf8",
    );
    expect(panel).not.toMatch(/StudioAudioEngine/);
    expect(panel).toMatch(/useMicAnalyser/);
  });
});
