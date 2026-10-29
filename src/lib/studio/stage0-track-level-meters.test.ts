/**
 * Stage 0 — per-track level meters (one tap per track, shared tick, peak hold).
 */
import { describe, expect, it } from "vitest";

import {
  StudioAudioEngine,
  type StudioAudioContextLike,
  type StudioAudioEngineHost,
  type StudioMediaElement,
} from "@/lib/studio/studio-audio-engine";
import type { StudioEngineDocument } from "@/lib/studio/studio-audio-schedule";
import {
  createDefaultStudioSourceAdapters,
  createStudioSourceAdapterRegistry,
} from "@/lib/studio/studio-audio-source-adapter";
import {
  STUDIO_METER_FFT_SIZE,
  STUDIO_METER_INTERVAL_MS,
} from "@/lib/studio/studio-meter";
import { emptyStudioFxChain } from "@/lib/studio/studio-fx-chain";

type FakeNode = {
  kind: string;
  connections: FakeNode[];
  disconnected: boolean;
  gain: { value: number };
  pan: { value: number };
  fftSize?: number;
  smoothingTimeConstant?: number;
  frequencyBinCount?: number;
  getFloatTimeDomainData?: (array: Float32Array) => void;
  connect(dest: FakeNode): FakeNode;
  disconnect(): void;
};

function fakeNode(kind: string): FakeNode {
  const node: FakeNode = {
    kind,
    connections: [],
    disconnected: false,
    gain: { value: 1 },
    pan: { value: 0 },
    connect(dest) {
      node.disconnected = false;
      if (!node.connections.includes(dest)) node.connections.push(dest);
      return dest;
    },
    disconnect() {
      node.connections = [];
      node.disconnected = true;
    },
  };
  return node;
}

function createMeterHost(opts?: {
  peakSequence?: number[];
}): {
  host: StudioAudioEngineHost;
  created: FakeNode[];
  contexts: StudioAudioContextLike[];
  pendingTicks: Array<() => void>;
  advanceMs: (ms: number) => void;
  flushTicks: (max?: number) => void;
  setPeak: (peak: number) => void;
} {
  const created: FakeNode[] = [];
  const contexts: StudioAudioContextLike[] = [];
  const pendingTicks: Array<() => void> = [];
  let now = 0;
  let tickSeq = 0;
  const tickById = new Map<number, () => void>();
  let peakValue = 0;
  let peakSeqIdx = 0;
  const peakSequence = opts?.peakSequence ?? null;
  const dest = fakeNode("destination");
  created.push(dest);

  const ctx = {
    currentTime: 0,
    state: "running",
    sampleRate: 48000,
    destination: dest,
    resume: async () => undefined,
    close: async () => undefined,
    createGain: () => {
      const n = fakeNode("gain");
      created.push(n);
      return n;
    },
    createStereoPanner: () => {
      const n = fakeNode("panner");
      created.push(n);
      return n;
    },
    createAnalyser: () => {
      const n = fakeNode("analyser");
      n.fftSize = STUDIO_METER_FFT_SIZE;
      n.smoothingTimeConstant = 0;
      n.frequencyBinCount = STUDIO_METER_FFT_SIZE / 2;
      n.getFloatTimeDomainData = (array: Float32Array) => {
        let peak = peakValue;
        if (peakSequence) {
          peak = peakSequence[Math.min(peakSeqIdx, peakSequence.length - 1)]!;
          peakSeqIdx += 1;
        }
        array.fill(peak);
      };
      created.push(n);
      return n;
    },
    createBiquadFilter: () => {
      const n = fakeNode("biquad");
      created.push(n);
      return n;
    },
    createDynamicsCompressor: () => {
      const n = fakeNode("dynamics");
      created.push(n);
      return n;
    },
    createDelay: () => {
      const n = fakeNode("delay");
      created.push(n);
      return n;
    },
    createConvolver: () => {
      const n = fakeNode("convolver");
      created.push(n);
      return n;
    },
    createBuffer: (channels: number, length: number, sampleRate: number) => ({
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length),
    }),
    createMediaElementSource: () => {
      const n = fakeNode("media");
      created.push(n);
      return n;
    },
  } as unknown as StudioAudioContextLike;
  contexts.push(ctx);

  const host: StudioAudioEngineHost = {
    createContext: () => ctx,
    createMediaElement: () => {
      const el: StudioMediaElement = {
        src: "",
        currentTime: 0,
        paused: true,
        volume: 1,
        muted: false,
        crossOrigin: null,
        preload: "auto",
        async play() {
          el.paused = false;
        },
        pause() {
          el.paused = true;
        },
        load() {
          /* noop */
        },
      };
      return el;
    },
    nowMs: () => now,
    requestTick: (cb) => {
      const id = ++tickSeq;
      tickById.set(id, cb);
      pendingTicks.push(cb);
      return id;
    },
    cancelTick: (id) => {
      const cb = tickById.get(id);
      tickById.delete(id);
      if (!cb) return;
      const idx = pendingTicks.indexOf(cb);
      if (idx >= 0) pendingTicks.splice(idx, 1);
    },
  };

  return {
    host,
    created,
    contexts,
    pendingTicks,
    advanceMs(ms: number) {
      now += ms;
      (ctx as { currentTime: number }).currentTime = now / 1000;
    },
    flushTicks(max = 64) {
      let n = 0;
      while (pendingTicks.length > 0 && n < max) {
        const batch = pendingTicks.splice(0, pendingTicks.length);
        for (const cb of batch) cb();
        n += 1;
      }
    },
    setPeak(peak: number) {
      peakValue = peak;
    },
  };
}

function silentListener() {
  return {
    onPlayhead: () => undefined,
    onLifecycle: () => undefined,
    onError: () => undefined,
    onTimelineEnded: () => undefined,
  };
}

function track(id: string) {
  return {
    id,
    gainDb: 0,
    pan: 0,
    muted: false,
    solo: false,
    effectsChain: emptyStudioFxChain(),
  };
}

function docTwoTracks(
  overrides: Partial<StudioEngineDocument> = {},
): StudioEngineDocument {
  return {
    timelineLengthMs: 60_000,
    masterGainDb: 0,
    masterPan: 0,
    masterFxChain: emptyStudioFxChain(),
    tracks: [track("tA"), track("tB")],
    clips: [
      {
        id: "c1",
        trackId: "tA",
        sourceKind: "BEAT_REF",
        sourceTakeId: null,
        sourceBeatId: "beat-1",
        sourceOffsetMs: 0,
        timelineStartMs: 0,
        durationMs: 10_000,
        gainDb: 0,
        muted: false,
        fadeInMs: 0,
        fadeOutMs: 0,
      },
    ],
    ...overrides,
  };
}

function engineOf(host: StudioAudioEngineHost) {
  const registry = createStudioSourceAdapterRegistry(
    createDefaultStudioSourceAdapters({
      resolveBeatUrl: async () => ({
        url: "https://cdn.example/beat.mp3",
        expiresAt: Date.now() + 60_000,
      }),
      resolveTakeUrl: async () => null,
    }),
  );
  return new StudioAudioEngine({
    registry,
    listener: silentListener(),
    host,
  });
}

describe("Stage 0 per-track level meters", () => {
  it("disabled by default → no per-track taps", () => {
    const { host } = createMeterHost();
    const engine = engineOf(host);
    engine.initialize();
    engine.setDocument(docTwoTracks());
    expect(engine.getTrackLevelTapCount()).toBe(0);
    engine.dispose();
  });

  it("enabled → one parallel tap per track, dry path to Σ kept", () => {
    const { host } = createMeterHost();
    const engine = engineOf(host);
    engine.initialize();
    engine.setDocument(docTwoTracks());
    engine.setTrackLevelsEnabled(true);
    expect(engine.getTrackLevelTapCount()).toBe(2);
    engine.setTrackMeterTarget("tA");
    const inspect = engine.inspectTrackMeter();
    const pan = inspect.trackPan as unknown as FakeNode;
    // pan feeds selected analyser AND the level tap (fan-out, never inline).
    expect(pan.connections).toContain(inspect.analyser as unknown as FakeNode);
    expect(pan.connections.filter((n) => n.kind === "analyser")).toHaveLength(2);
    engine.setTrackLevelsEnabled(false);
    expect(engine.getTrackLevelTapCount()).toBe(0);
    engine.dispose();
  });

  it("emits levels on the shared meter tick with peak hold and clip latch", async () => {
    const harness = createMeterHost();
    const engine = engineOf(harness.host);
    engine.initialize();
    engine.setDocument(docTwoTracks());
    engine.setTrackLevelsEnabled(true);
    const seen: Array<{ peak: number; hold: number; clipping: boolean }> = [];
    engine.subscribeTrackLevels((levels) => {
      const a = levels.get("tA");
      if (a) seen.push({ peak: a.peak, hold: a.hold, clipping: a.clipping });
    });
    await engine.play(0);
    const ticksBefore = harness.pendingTicks.length;
    harness.setPeak(1);
    harness.advanceMs(STUDIO_METER_INTERVAL_MS + 1);
    harness.flushTicks(1);
    harness.setPeak(0.25);
    harness.advanceMs(STUDIO_METER_INTERVAL_MS + 1);
    harness.flushTicks(1);
    const last = seen[seen.length - 1]!;
    expect(last.peak).toBeCloseTo(0.25);
    expect(last.hold).toBe(1);
    expect(last.clipping).toBe(true);
    // No extra rAF loop: same number of scheduled ticks as before enabling.
    expect(harness.pendingTicks.length).toBeLessThanOrEqual(Math.max(1, ticksBefore));
    engine.dispose();
  });

  it("removed track drops its tap", () => {
    const { host } = createMeterHost();
    const engine = engineOf(host);
    engine.initialize();
    engine.setDocument(docTwoTracks());
    engine.setTrackLevelsEnabled(true);
    engine.setDocument(docTwoTracks({ tracks: [track("tA")], clips: [] }));
    expect(engine.getTrackLevelTapCount()).toBe(1);
    engine.dispose();
  });
});

describe("Stage 0 peak hold helper", () => {
  it("holds the max for the hold window then follows the signal", async () => {
    const { createPeakHoldState, updatePeakHold } = await import("@/lib/studio/studio-meter");
    const st = createPeakHoldState();
    expect(updatePeakHold(st, 0.8, 0, 1000)).toBe(0.8);
    expect(updatePeakHold(st, 0.3, 500, 1000)).toBe(0.8);
    expect(updatePeakHold(st, 0.3, 1001, 1000)).toBe(0.3);
    expect(updatePeakHold(st, Number.NaN, 1002, 1000)).toBe(0.3);
  });
});
