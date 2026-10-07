/**
 * P6.6.1 — On-demand Track Peak Metering (engine / Track analyser only).
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
  STUDIO_METER_HZ,
  STUDIO_METER_INTERVAL_MS,
  samplePeakFromTimeDomain,
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

function activeTrackAnalysers(created: FakeNode[]): FakeNode[] {
  return created.filter(
    (n) =>
      n.kind === "analyser" &&
      n.connections.some((c) => c.kind === "gain" || c.kind === "destination"),
  );
}

describe("P6.6.1 Track analyser selection lifecycle", () => {
  it("no selection → 0 Track analysers", () => {
    const { host, created } = createMeterHost();
    const engine = engineOf(host);
    engine.initialize();
    engine.setDocument(docTwoTracks());
    expect(engine.inspectTrackMeter().trackAnalyserCount).toBe(0);
    expect(engine.getTrackMeterTargetId()).toBeNull();
    // Only Master analyser exists
    expect(created.filter((n) => n.kind === "analyser")).toHaveLength(1);
    engine.dispose();
  });

  it("select A → 1 Track analyser after Track Pan before Σ", () => {
    const { host, created } = createMeterHost();
    const engine = engineOf(host);
    engine.initialize();
    engine.setDocument(docTwoTracks());
    engine.setTrackMeterTarget("tA");
    const inspect = engine.inspectTrackMeter();
    expect(inspect.trackId).toBe("tA");
    expect(inspect.trackAnalyserCount).toBe(1);
    expect(inspect.fftSize).toBe(STUDIO_METER_FFT_SIZE);
    const pan = inspect.trackPan as unknown as FakeNode;
    const analyser = inspect.analyser as unknown as FakeNode;
    const sum = inspect.masterInput as unknown as FakeNode;
    expect(pan.connections).toEqual([analyser]);
    expect(analyser.connections).toEqual([sum]);
    expect(created.filter((n) => n.kind === "analyser")).toHaveLength(2);
    engine.dispose();
  });

  it("select B → A restored dry + B active (never A+B)", () => {
    const { host } = createMeterHost();
    const engine = engineOf(host);
    engine.initialize();
    engine.setDocument(docTwoTracks());
    engine.setTrackMeterTarget("tA");
    const aPan = engine.inspectTrackMeter().trackPan as unknown as FakeNode;
    const analyser = engine.inspectTrackMeter().analyser as unknown as FakeNode;
    engine.setTrackMeterTarget("tB");
    const inspect = engine.inspectTrackMeter();
    expect(inspect.trackId).toBe("tB");
    expect(inspect.trackAnalyserCount).toBe(1);
    expect(inspect.analyser).toBe(analyser);
    // A pan back to Σ (dry)
    expect(aPan.connections[0]).toBe(inspect.masterInput);
    expect(aPan.connections.some((c) => c.kind === "analyser")).toBe(false);
    const bPan = inspect.trackPan as unknown as FakeNode;
    expect(bPan.connections).toEqual([analyser]);
    expect(analyser.connections).toEqual([inspect.masterInput]);
    engine.dispose();
  });

  it("clear selection → 0 Track analysers + neutral snapshot", () => {
    const { host } = createMeterHost();
    const engine = engineOf(host);
    engine.initialize();
    engine.setDocument(docTwoTracks());
    engine.setTrackMeterTarget("tA");
    engine.setTrackMeterTarget(null);
    expect(engine.inspectTrackMeter().trackAnalyserCount).toBe(0);
    expect(engine.getTrackMeterTargetId()).toBeNull();
    expect(engine.getTrackMeterSnapshot().peak).toBe(0);
    expect(engine.getTrackMeterSnapshot().clipping).toBe(false);
    engine.dispose();
  });

  it("repeated A→B→A does not allocate extra Track analysers", () => {
    const { host, created } = createMeterHost();
    const engine = engineOf(host);
    engine.initialize();
    engine.setDocument(docTwoTracks());
    for (let i = 0; i < 8; i += 1) {
      engine.setTrackMeterTarget(i % 2 === 0 ? "tA" : "tB");
    }
    expect(created.filter((n) => n.kind === "analyser")).toHaveLength(2);
    expect(engine.inspectTrackMeter().trackAnalyserCount).toBe(1);
    engine.dispose();
  });

  it("graph rebuild / FX sync does not duplicate Track analyser", () => {
    const { host, created } = createMeterHost();
    const engine = engineOf(host);
    engine.initialize();
    engine.setDocument(docTwoTracks());
    engine.setTrackMeterTarget("tA");
    const before = created.filter((n) => n.kind === "analyser").length;
    engine.setDocument(
      docTwoTracks({
        tracks: [
          {
            ...track("tA"),
            effectsChain: {
              schemaVersion: 1,
              effects: [
                {
                  id: "11111111-1111-4111-8111-111111111111",
                  type: "eq",
                  enabled: true,
                  params: {
                    low: { frequencyHz: 120, gainDb: 3, q: 0.7 },
                    mid: { frequencyHz: 1000, gainDb: 0, q: 1 },
                    high: { frequencyHz: 8000, gainDb: 0, q: 0.7 },
                  },
                },
              ],
            },
          },
          track("tB"),
        ],
      }),
    );
    expect(created.filter((n) => n.kind === "analyser")).toHaveLength(before);
    const inspect = engine.inspectTrackMeter();
    expect(inspect.trackAnalyserCount).toBe(1);
    expect(inspect.trackId).toBe("tA");
    const pan = inspect.trackPan as unknown as FakeNode;
    expect(pan.connections[0]?.kind).toBe("analyser");
    engine.dispose();
  });

  it("Track removal disposes Track analyser target", () => {
    const { host } = createMeterHost();
    const engine = engineOf(host);
    engine.initialize();
    engine.setDocument(docTwoTracks());
    engine.setTrackMeterTarget("tA");
    engine.setDocument(
      docTwoTracks({
        tracks: [track("tB")],
        clips: [],
      }),
    );
    expect(engine.getTrackMeterTargetId()).toBeNull();
    expect(engine.inspectTrackMeter().trackAnalyserCount).toBe(0);
    engine.dispose();
  });

  it("engine dispose clears Track analyser + listeners", async () => {
    const harness = createMeterHost();
    const engine = engineOf(harness.host);
    engine.initialize();
    engine.setDocument(docTwoTracks());
    engine.setTrackMeterTarget("tA");
    const snaps: number[] = [];
    const unsub = engine.subscribeTrackMeter((s) => snaps.push(s.timestamp));
    await engine.play(0);
    harness.advanceMs(STUDIO_METER_INTERVAL_MS + 1);
    harness.flushTicks();
    engine.dispose();
    const after = snaps.length;
    harness.advanceMs(STUDIO_METER_INTERVAL_MS + 1);
    harness.flushTicks();
    expect(snaps.length).toBe(after);
    expect(engine.inspectTrackMeter().trackAnalyserCount).toBe(0);
    unsub();
  });
});

describe("P6.6.1 Track meter reader + shared semantics", () => {
  it("visibility pause/resume reuses Master meter lifecycle", async () => {
    const harness = createMeterHost();
    harness.setPeak(0.4);
    const engine = engineOf(harness.host);
    engine.initialize();
    engine.setDocument(docTwoTracks());
    engine.setTrackMeterTarget("tA");
    const snaps: number[] = [];
    engine.subscribeTrackMeter((s) => {
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
    engine.dispose();
  });

  it("Track meter uses shared studio-meter Peak + clip latch", async () => {
    const harness = createMeterHost();
    harness.setPeak(1);
    const engine = engineOf(harness.host);
    engine.initialize();
    engine.setDocument(docTwoTracks());
    engine.setTrackMeterTarget("tA");
    await engine.play(0);
    harness.advanceMs(STUDIO_METER_INTERVAL_MS + 1);
    harness.flushTicks();
    expect(engine.getTrackMeterSnapshot().peak).toBe(1);
    expect(engine.getTrackMeterSnapshot().clipping).toBe(true);

    harness.setPeak(0);
    harness.advanceMs(200);
    harness.flushTicks();
    expect(engine.getTrackMeterSnapshot().clipping).toBe(true);

    engine.stop();
    expect(engine.getTrackMeterSnapshot().peak).toBe(0);
    expect(engine.getTrackMeterSnapshot().clipping).toBe(false);
    expect(samplePeakFromTimeDomain(new Float32Array([0.2, -0.7]))).toBeCloseTo(
      0.7,
      5,
    );
    expect(STUDIO_METER_CLIP_LATCH_MS).toBe(1500);
    engine.dispose();
  });

  it("Track meter updates are throttled ≤15 Hz (STUDIO_METER_HZ)", async () => {
    const harness = createMeterHost();
    harness.setPeak(0.3);
    const engine = engineOf(harness.host);
    engine.initialize();
    engine.setDocument(docTwoTracks());
    engine.setTrackMeterTarget("tA");
    const snaps: number[] = [];
    engine.subscribeTrackMeter((s) => {
      if (s.timestamp > 0) snaps.push(s.timestamp);
    });
    await engine.play(0);
    const windowMs = 1000;
    const steps = 40;
    for (let i = 0; i < steps; i += 1) {
      harness.advanceMs(windowMs / steps);
      harness.flushTicks(8);
    }
    // Initial subscribe may emit neutral; count timed snapshots in window.
    const timed = snaps.filter((t) => t > 0);
    expect(timed.length).toBeLessThanOrEqual(15);
    expect(STUDIO_METER_HZ).toBeLessThanOrEqual(15);
    expect(STUDIO_METER_INTERVAL_MS).toBeGreaterThanOrEqual(1000 / 15);
    engine.dispose();
  });

  it("Master analyser topology remains intact with Track meter", () => {
    const { host, created, contexts } = createMeterHost();
    const engine = engineOf(host);
    engine.initialize();
    engine.setDocument(docTwoTracks());
    engine.setTrackMeterTarget("tA");
    const master = engine.inspectMasterMeter();
    expect(master).toBeTruthy();
    const masterPan = master!.masterPan as unknown as FakeNode;
    expect(masterPan.connections[0]?.kind).toBe("analyser");
    expect(master!.analyser).not.toBe(engine.inspectTrackMeter().analyser);
    expect(created.filter((n) => n.kind === "analyser").length).toBeLessThanOrEqual(
      2,
    );
    expect(contexts).toHaveLength(1);
    expect(activeTrackAnalysers(created).length).toBeLessThanOrEqual(2);
    engine.dispose();
  });

  it("Master meter still emits while Track meter is selected", async () => {
    const harness = createMeterHost();
    harness.setPeak(0.55);
    const engine = engineOf(harness.host);
    engine.initialize();
    engine.setDocument(docTwoTracks());
    engine.setTrackMeterTarget("tB");
    await engine.play(0);
    harness.advanceMs(STUDIO_METER_INTERVAL_MS + 1);
    harness.flushTicks();
    expect(engine.getMeterSnapshot().peak).toBeCloseTo(0.55, 5);
    expect(engine.getTrackMeterSnapshot().peak).toBeCloseTo(0.55, 5);
    engine.dispose();
  });
});

describe("P6.6.1 architecture guards", () => {
  const engineSrc = readFileSync(
    join(process.cwd(), "src/lib/studio/studio-audio-engine.ts"),
    "utf8",
  );
  const testSrc = readFileSync(
    join(process.cwd(), "src/lib/studio/p6-6-1-track-meter.test.ts"),
    "utf8",
  );

  it("forbids PlayerProvider / E3 / second engines in Studio engine", () => {
    expect(engineSrc).not.toMatch(/PlayerProvider/);
    expect(engineSrc).not.toMatch(/mix-graph/);
    expect(engineSrc).not.toMatch(/StudioMixEngine/);
    expect(engineSrc).not.toMatch(/MeteringEngine|TrackMeteringEngine/);
    expect(engineSrc).toMatch(/setTrackMeterTarget/);
    expect(engineSrc).toMatch(/subscribeTrackMeter/);
    expect(engineSrc).toMatch(/idleTrackAnalyser/);
  });

  it("wires Track analyser after pan before masterInput", () => {
    expect(engineSrc).toMatch(/graph\.pan\.connect\(this\.trackAnalyser\)/);
    expect(engineSrc).toMatch(
      /this\.trackAnalyser\.connect\(this\.masterInput\)/,
    );
    expect(engineSrc).toMatch(
      /masterPan\.connect\(this\.masterAnalyser\)/,
    );
    expect(testSrc).toMatch(/P6\.6\.1/);
  });

  it("one StudioAudioEngine class / one context factory path", () => {
    expect(engineSrc.match(/export class StudioAudioEngine/g)).toHaveLength(1);
    expect(engineSrc).toMatch(/this\.host\.createContext\(\)/);
  });
});
