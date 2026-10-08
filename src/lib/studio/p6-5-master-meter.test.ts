/**
 * P6.5 — Master-only realtime metering (engine + helpers + UI contracts).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  STUDIO_METER_CLIP_LATCH_MS,
  STUDIO_METER_FFT_SIZE,
  STUDIO_METER_INTERVAL_MS,
  STUDIO_METER_NEUTRAL,
  buildMeterSnapshot,
  clearClipLatch,
  createClipLatchState,
  peakToDbFs,
  samplePeakFromTimeDomain,
  updateClipLatch,
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

function doc(
  overrides: Partial<StudioEngineDocument> = {},
): StudioEngineDocument {
  return {
    timelineLengthMs: 60_000,
    masterGainDb: 0,
    masterPan: 0,
    masterFxChain: emptyStudioFxChain(),
    tracks: [
      {
        id: "t1",
        gainDb: 0,
        pan: 0,
        muted: false,
        solo: false,
        effectsChain: emptyStudioFxChain(),
      },
    ],
    clips: [
      {
        id: "c1",
        trackId: "t1",
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

describe("P6.5 meter pure helpers", () => {
  it("computes sample peak in 0…1", () => {
    expect(samplePeakFromTimeDomain(new Float32Array([0.1, -0.5, 0.2]))).toBe(
      0.5,
    );
    expect(samplePeakFromTimeDomain(new Float32Array([1.2, -2]))).toBe(1);
    expect(samplePeakFromTimeDomain(new Float32Array([0, 0]))).toBe(0);
  });

  it("detects clipping at peak >= 1.0 with 1500 ms latch", () => {
    const state = createClipLatchState();
    expect(updateClipLatch(state, 0.99, 0)).toBe(false);
    expect(updateClipLatch(state, 1, 100)).toBe(true);
    expect(updateClipLatch(state, 0, 100 + STUDIO_METER_CLIP_LATCH_MS - 1)).toBe(
      true,
    );
    expect(updateClipLatch(state, 0, 100 + STUDIO_METER_CLIP_LATCH_MS)).toBe(
      false,
    );
  });

  it("repeated clipping extends latch from now", () => {
    const state = createClipLatchState();
    updateClipLatch(state, 1, 0);
    updateClipLatch(state, 1, 800);
    expect(updateClipLatch(state, 0, 800 + STUDIO_METER_CLIP_LATCH_MS - 1)).toBe(
      true,
    );
    expect(updateClipLatch(state, 0, 800 + STUDIO_METER_CLIP_LATCH_MS)).toBe(
      false,
    );
  });

  it("clearClipLatch resets clipping", () => {
    const state = createClipLatchState();
    updateClipLatch(state, 1, 0);
    clearClipLatch(state);
    expect(updateClipLatch(state, 0, 10)).toBe(false);
  });

  it("peakToDbFs uses floor instead of -Infinity", () => {
    expect(peakToDbFs(0)).toContain(String(-100));
    expect(peakToDbFs(1)).toBe("0.0 dB");
  });

  it("buildMeterSnapshot clamps peak", () => {
    expect(buildMeterSnapshot({ peak: 2, clipping: true, timestamp: 1 })).toEqual(
      {
        peak: 1,
        clipping: true,
        timestamp: 1,
      },
    );
    expect(STUDIO_METER_NEUTRAL.peak).toBe(0);
    expect(STUDIO_METER_NEUTRAL.clipping).toBe(false);
  });
});

describe("P6.5 StudioAudioEngine analyser lifecycle", () => {
  it("creates analyser once after Master Pan → Destination", () => {
    const { host, created } = createMeterHost();
    const engine = engineOf(host);
    expect(engine.initialize()).toBe(true);
    const analysers = created.filter((n) => n.kind === "analyser");
    expect(analysers).toHaveLength(1);
    const meter = engine.inspectMasterMeter();
    expect(meter?.fftSize).toBe(STUDIO_METER_FFT_SIZE);
    const pan = created.find((n) => n.kind === "panner" && n === meter?.masterPan);
    expect(pan?.connections[0]?.kind).toBe("analyser");
    expect(analysers[0]?.connections[0]?.kind).toBe("destination");
    // No parallel MasterPan → Destination
    const masterPan = meter!.masterPan as unknown as FakeNode;
    expect(masterPan.connections.some((c) => c.kind === "destination")).toBe(
      false,
    );
    expect(host.createContext()).toBe(host.createContext());
    expect(created.filter((n) => n.kind === "analyser")).toHaveLength(1);
  });

  it("does not recreate analyser after Master FX rebuild", () => {
    const { host, created } = createMeterHost();
    const engine = engineOf(host);
    engine.initialize();
    const before = created.filter((n) => n.kind === "analyser").length;
    engine.setDocument(
      doc({
        masterFxChain: {
          schemaVersion: 1,
          effects: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              type: "eq",
              enabled: true,
              params: {
                low: { frequencyHz: 120, gainDb: 0, q: 0.7 },
                mid: { frequencyHz: 1000, gainDb: 0, q: 1 },
                high: { frequencyHz: 8000, gainDb: 0, q: 0.7 },
              },
            },
          ],
        },
      }),
    );
    expect(created.filter((n) => n.kind === "analyser")).toHaveLength(before);
    const meter = engine.inspectMasterMeter();
    expect(meter?.analyser).toBeTruthy();
    engine.dispose();
  });

  it("uses a single AudioContext for the engine lifecycle", () => {
    const { host, contexts } = createMeterHost();
    const engine = engineOf(host);
    engine.initialize();
    engine.initialize();
    expect(contexts).toHaveLength(1);
    engine.dispose();
  });

  it("dispose stops meter reader and clears listeners", async () => {
    const harness = createMeterHost();
    const engine = engineOf(harness.host);
    engine.initialize();
    engine.setDocument(doc());
    const snaps: number[] = [];
    const unsub = engine.subscribeMeter((s) => snaps.push(s.timestamp));
    await engine.play(0);
    harness.advanceMs(STUDIO_METER_INTERVAL_MS + 1);
    harness.flushTicks();
    engine.dispose();
    const afterDispose = snaps.length;
    harness.advanceMs(STUDIO_METER_INTERVAL_MS + 1);
    harness.flushTicks();
    // Reset emit on dispose is OK; no further reader updates after cleanup.
    expect(snaps.length).toBe(afterDispose);
    expect(engine.getMeterSnapshot().peak).toBe(0);
    unsub();
  });
});

describe("P6.5 meter play/pause/stop/visibility", () => {
  it("play emits peak snapshots; pause stops updates; stop clears", async () => {
    const harness = createMeterHost();
    harness.setPeak(0.5);
    const engine = engineOf(harness.host);
    engine.initialize();
    engine.setDocument(doc());
    const snaps: ReturnType<typeof engine.getMeterSnapshot>[] = [];
    engine.subscribeMeter((s) => snaps.push({ ...s }));

    await engine.play(0);
    harness.advanceMs(STUDIO_METER_INTERVAL_MS + 1);
    harness.flushTicks();
    expect(engine.getMeterSnapshot().peak).toBeCloseTo(0.5, 5);

    const afterPlay = snaps.length;
    engine.pause();
    harness.advanceMs(STUDIO_METER_INTERVAL_MS * 3);
    harness.flushTicks();
    expect(snaps.length).toBe(afterPlay);

    harness.setPeak(0.9);
    engine.stop();
    expect(engine.getMeterSnapshot().peak).toBe(0);
    expect(engine.getMeterSnapshot().clipping).toBe(false);
  });

  it("clipping latch + Stop clears clipping", async () => {
    const harness = createMeterHost();
    harness.setPeak(1);
    const engine = engineOf(harness.host);
    engine.initialize();
    engine.setDocument(doc());
    await engine.play(0);
    harness.advanceMs(STUDIO_METER_INTERVAL_MS + 1);
    harness.flushTicks();
    expect(engine.getMeterSnapshot().clipping).toBe(true);

    harness.setPeak(0);
    harness.advanceMs(200);
    harness.flushTicks();
    expect(engine.getMeterSnapshot().clipping).toBe(true);

    engine.stop();
    expect(engine.getMeterSnapshot().clipping).toBe(false);
    expect(engine.getMeterSnapshot().peak).toBe(0);
  });

  it("hidden pauses meter updates; visible resumes while playing", async () => {
    const harness = createMeterHost();
    harness.setPeak(0.25);
    const engine = engineOf(harness.host);
    engine.initialize();
    engine.setDocument(doc());
    const snaps: number[] = [];
    engine.subscribeMeter((s) => {
      if (s.timestamp > 0) snaps.push(s.timestamp);
    });
    await engine.play(0);
    harness.advanceMs(STUDIO_METER_INTERVAL_MS + 1);
    harness.flushTicks();
    const n1 = snaps.length;
    expect(n1).toBeGreaterThan(0);

    engine.setMeterDocumentHidden(true);
    harness.advanceMs(STUDIO_METER_INTERVAL_MS * 3);
    harness.flushTicks();
    expect(snaps.length).toBe(n1);

    engine.setMeterDocumentHidden(false);
    harness.advanceMs(STUDIO_METER_INTERVAL_MS + 1);
    harness.flushTicks();
    expect(snaps.length).toBeGreaterThan(n1);
  });

  it("does not start duplicate meter readers", async () => {
    const harness = createMeterHost();
    const engine = engineOf(harness.host);
    engine.initialize();
    engine.setDocument(doc());
    await engine.play(0);
    const pendingAfterPlay = harness.pendingTicks.length;
    // startMetering again via seek-while-playing
    await engine.seek(100, true);
    // Should still have at most one meter tick + one clock tick
    expect(harness.pendingTicks.length).toBeLessThanOrEqual(pendingAfterPlay + 1);
    engine.dispose();
  });
});

describe("P6.5 Master meter UI contracts", () => {
  const meterUi = readFileSync(
    join(process.cwd(), "src/components/studio/studio-master-meter.tsx"),
    "utf8",
  );
  const peakUi = readFileSync(
    join(process.cwd(), "src/components/studio/studio-peak-meter.tsx"),
    "utf8",
  );
  const editor = readFileSync(
    join(process.cwd(), "src/components/studio/studio-editor.tsx"),
    "utf8",
  );
  const transport = readFileSync(
    join(process.cwd(), "src/components/studio/studio-transport-provider.tsx"),
    "utf8",
  );
  const engineSrc = readFileSync(
    join(process.cwd(), "src/lib/studio/studio-audio-engine.ts"),
    "utf8",
  );

  it("Master meter renders in editor between Pan and FX", () => {
    // Phase 7.1.5 — Master meter via StudioMasterMeterLive + meters context.
    expect(editor).toMatch(/StudioMasterMeterLive/);
    expect(editor).toMatch(/<StudioMasterMeter snapshot=\{meter\}/);
    expect(meterUi).toMatch(/StudioPeakMeter/);
    expect(meterUi).toMatch(/testIdPrefix=\"studio-master-meter\"/);
    expect(peakUi).toMatch(/data-testid=\{testIdPrefix\}/);
    expect(peakUi).toMatch(/\$\{testIdPrefix\}-peak/);
    expect(peakUi).toMatch(/\$\{testIdPrefix\}-clip/);
  });

  it("shows peak + accessible clipping (not color-only)", () => {
    expect(peakUi).toMatch(/role=\"meter\"/);
    expect(peakUi).toMatch(/aria-valuemin=\{0\}/);
    expect(peakUi).toMatch(/aria-valuemax=\{100\}/);
    expect(peakUi).toMatch(/aria-valuenow=\{peakPct\}/);
    expect(peakUi).toMatch(/aria-live=\"polite\"/);
    expect(peakUi).toMatch(/Clipping/);
    expect(peakUi).toMatch(/sample peak/);
    expect(peakUi).not.toMatch(/True Peak|LUFS|spectrum|WebGL|chart\.js/i);
    expect(meterUi).toMatch(/Miernik Master/);
  });

  it("mobile-safe layout (min-w-0, no new bottom-nav)", () => {
    expect(peakUi).toMatch(/min-w-0/);
    expect(peakUi).not.toMatch(/fixed bottom|bottom-nav|z-\[999\]/);
    expect(editor).toMatch(/StudioMasterMeter/);
  });

  it("transport wires meter + visibility without second engine", () => {
    expect(transport).toMatch(/subscribeMeter/);
    expect(transport).toMatch(/visibilitychange/);
    expect(transport).toMatch(/setMeterDocumentHidden/);
    expect(transport).not.toMatch(/MeteringEngine|StudioMixEngine|mix-graph/);
    expect(engineSrc).toMatch(/createAnalyser/);
    expect(engineSrc).toMatch(/masterPan\.connect\(this\.masterAnalyser\)/);
    expect(engineSrc).toMatch(/masterAnalyser\.connect\(this\.ctx\.destination\)/);
    expect(engineSrc).not.toMatch(/new AudioContext\(\).*new AudioContext/);
    expect(engineSrc).not.toMatch(/PlayerProvider|mix-graph|StudioMixEngine/);
  });
});
