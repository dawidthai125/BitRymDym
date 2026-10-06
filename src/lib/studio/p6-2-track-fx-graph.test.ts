/**
 * P6.2 — Track FX graph on StudioAudioEngine.
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
import { STUDIO_AUDIO_ERROR_CODES } from "@/lib/studio/studio-audio-errors";
import type {
  StudioEngineClip,
  StudioEngineDocument,
  StudioEngineTrack,
} from "@/lib/studio/studio-audio-schedule";
import {
  createDefaultStudioSourceAdapters,
  createStudioSourceAdapterRegistry,
} from "@/lib/studio/studio-audio-source-adapter";
import { defaultStudioFxParams } from "@/lib/studio/studio-fx-chain";
import { buildStudioTrackFxChain } from "@/lib/studio/studio-fx-graph";

const BEAT_ID = "11111111-1111-4111-8111-111111111111";
const TAKE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TAKE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID_EQ = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const ID_COMP = "3fa85f64-5717-4562-b3fc-2c963f66afa7";
const ID_DELAY = "3fa85f64-5717-4562-b3fc-2c963f66afa8";
const ID_REV = "3fa85f64-5717-4562-b3fc-2c963f66afa9";
const ID_LIM = "3fa85f64-5717-4562-b3fc-2c963f66afaa";

type FakeNode = {
  kind: string;
  connections: FakeNode[];
  disconnected: boolean;
  gain: { value: number };
  pan: { value: number };
  type: string;
  frequency: { value: number };
  Q: { value: number };
  threshold: { value: number };
  ratio: { value: number };
  attack: { value: number };
  release: { value: number };
  knee: { value: number };
  delayTime: { value: number };
  buffer: unknown;
  normalize: boolean;
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
    type: "peaking",
    frequency: { value: 1000 },
    Q: { value: 1 },
    threshold: { value: -24 },
    ratio: { value: 3 },
    attack: { value: 0.01 },
    release: { value: 0.1 },
    knee: { value: 6 },
    delayTime: { value: 0.25 },
    buffer: null,
    normalize: true,
    connect(dest: FakeNode) {
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

function createTrackingHost(played: string[] = []): {
  host: StudioAudioEngineHost;
  created: FakeNode[];
} {
  const created: FakeNode[] = [];
  const dest = fakeNode("destination");
  created.push(dest);
  const ctx = {
    currentTime: 0,
    state: "running",
    sampleRate: 48000,
    destination: dest,
    async resume() {},
    async close() {},
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
      const n = fakeNode("analyser") as FakeNode & {
        fftSize: number;
        smoothingTimeConstant: number;
        frequencyBinCount: number;
        getFloatTimeDomainData: (array: Float32Array) => void;
      };
      n.fftSize = 256;
      n.smoothingTimeConstant = 0;
      n.frequencyBinCount = 128;
      n.getFloatTimeDomainData = (array: Float32Array) => {
        array.fill(0);
      };
      created.push(n);
      return n;
    },
    createMediaElementSource: () => {
      const n = fakeNode("media");
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
    createBuffer(channels: number, length: number) {
      return {
        numberOfChannels: channels,
        length,
        sampleRate: 48000,
        getChannelData() {
          return new Float32Array(length);
        },
      };
    },
  } as unknown as StudioAudioContextLike;

  return {
    created,
    host: {
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
        return 16;
      },
      requestTick() {
        return 1;
      },
      cancelTick() {},
    },
  };
}

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
  overrides: Partial<StudioEngineClip> &
    Pick<StudioEngineClip, "id" | "trackId" | "sourceKind">,
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
  clips: StudioEngineClip[] = [],
): StudioEngineDocument {
  return {
    timelineLengthMs: 20_000,
    masterGainDb: 0,
    masterPan: 0,
    tracks,
    clips,
  };
}

function effect(
  type: "eq" | "compressor" | "limiter" | "reverb" | "delay",
  id: string,
  extra: { enabled?: boolean; params?: Record<string, unknown> } = {},
) {
  return {
    id,
    type,
    enabled: extra.enabled ?? true,
    params: extra.params ?? defaultStudioFxParams(type),
  };
}

function chainOf(
  effects: ReturnType<typeof effect>[],
): { schemaVersion: 1; effects: ReturnType<typeof effect>[] } {
  return { schemaVersion: 1, effects };
}

function asFake(node: { connect: unknown } | null | undefined): FakeNode {
  if (!node) throw new Error("missing node");
  return node as unknown as FakeNode;
}

function engineWith(host: StudioAudioEngineHost) {
  const errors: string[] = [];
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
    host,
    listener: {
      onPlayhead: () => undefined,
      onLifecycle: () => undefined,
      onError: (e) => errors.push(e.code),
      onTimelineEnded: () => undefined,
    },
  });
  return { engine, errors };
}

describe("P6.2 factory / registry", () => {
  it("builds EQ compressor limiter reverb delay in array order", () => {
    const { created, host } = createTrackingHost();
    const ctx = host.createContext();
    const handle = buildStudioTrackFxChain(
      ctx,
      chainOf([
        effect("eq", ID_EQ),
        effect("compressor", ID_COMP),
        effect("limiter", ID_LIM),
        effect("reverb", ID_REV),
        effect("delay", ID_DELAY),
      ]),
      () => undefined,
    );
    expect(handle).not.toBeNull();
    expect(handle?.inspect().map((s) => s.type)).toEqual([
      "eq",
      "compressor",
      "limiter",
      "reverb",
      "delay",
    ]);
    expect(created.some((n) => n.kind === "biquad")).toBe(true);
    expect(created.some((n) => n.kind === "dynamics")).toBe(true);
    expect(created.some((n) => n.kind === "convolver")).toBe(true);
    expect(created.some((n) => n.kind === "delay")).toBe(true);
  });

  it("empty chain returns null (Clip Gain → Track Node)", () => {
    const { host } = createTrackingHost();
    expect(
      buildStudioTrackFxChain(
        host.createContext(),
        chainOf([]),
        () => undefined,
      ),
    ).toBeNull();
  });
});

describe("P6.2 engine insert topology", () => {
  it("empty chain keeps summing input connected to track gain", () => {
    const { host } = createTrackingHost();
    const { engine } = engineWith(host);
    engine.initialize();
    engine.setDocument(documentOf([track("vocal")]));
    const inspect = engine.inspectTrackFx("vocal");
    expect(inspect?.insert).toBe("dry");
    expect(asFake(inspect?.summingInput).connections).toContain(
      asFake(inspect?.trackGain),
    );
  });

  it("inserts Track FX after summing input and before track gain/pan", () => {
    const { host } = createTrackingHost();
    const { engine } = engineWith(host);
    engine.initialize();
    engine.setDocument(
      documentOf([
        track("vocal", {
          effectsChain: chainOf([effect("eq", ID_EQ), effect("delay", ID_DELAY)]),
        }),
      ]),
    );
    const inspect = engine.inspectTrackFx("vocal");
    expect(inspect?.insert).toBe("fx");
    expect(inspect?.slots.map((s) => s.type)).toEqual(["eq", "delay"]);
    expect(asFake(inspect?.summingInput).connections).not.toContain(
      asFake(inspect?.trackGain),
    );
    expect(asFake(inspect?.trackGain).connections).toContain(
      asFake(inspect?.trackPan),
    );
  });

  it("routes multiple voices on one track through the same summing input / FX", async () => {
    const played: string[] = [];
    const { host } = createTrackingHost(played);
    const { engine } = engineWith(host);
    engine.setDocument(
      documentOf(
        [
          track("beat"),
          track("vocal", {
            effectsChain: chainOf([effect("eq", ID_EQ)]),
          }),
        ],
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
            timelineStartMs: 0,
            durationMs: 5000,
          }),
        ],
      ),
    );
    await engine.play(1000);
    expect(engine.getActiveVoiceCount()).toBe(3);
    const vocal = engine.inspectTrackFx("vocal");
    const beat = engine.inspectTrackFx("beat");
    const g1 = engine.inspectVoiceClipGain("c-take-1");
    const g2 = engine.inspectVoiceClipGain("c-take-2");
    const gb = engine.inspectVoiceClipGain("c-beat");
    expect(vocal?.insert).toBe("fx");
    expect(beat?.insert).toBe("dry");
    expect(asFake(g1).connections).toContain(asFake(vocal?.summingInput));
    expect(asFake(g2).connections).toContain(asFake(vocal?.summingInput));
    expect(asFake(gb).connections).toContain(asFake(beat?.summingInput));
    expect(asFake(g1).connections).not.toContain(asFake(vocal?.trackGain));
    expect(played).toHaveLength(3);
    engine.dispose();
  });
});

describe("P6.2 bypass / rebuild / lifecycle", () => {
  it("enabled=false is wire-through without dropping the slot", () => {
    const { host } = createTrackingHost();
    const { engine } = engineWith(host);
    engine.initialize();
    engine.setDocument(
      documentOf([
        track("vocal", {
          effectsChain: chainOf([
            effect("eq", ID_EQ, { enabled: false }),
            effect("delay", ID_DELAY),
          ]),
        }),
      ]),
    );
    const inspect = engine.inspectTrackFx("vocal");
    expect(inspect?.slots.map((s) => s.mode)).toEqual(["bypass", "process"]);
    expect(inspect?.slots.map((s) => s.type)).toEqual(["eq", "delay"]);
  });

  it("rebuilds on add/remove/reorder and disconnects previous FX nodes", () => {
    const { host, created } = createTrackingHost();
    const { engine } = engineWith(host);
    engine.initialize();
    engine.setDocument(
      documentOf([
        track("vocal", {
          effectsChain: chainOf([effect("eq", ID_EQ), effect("delay", ID_DELAY)]),
        }),
      ]),
    );
    const delaysBefore = created.filter((n) => n.kind === "delay");
    expect(delaysBefore.length).toBeGreaterThan(0);

    engine.setDocument(
      documentOf([
        track("vocal", {
          effectsChain: chainOf([effect("delay", ID_DELAY), effect("eq", ID_EQ)]),
        }),
      ]),
    );
    expect(engine.inspectTrackFx("vocal")?.slots.map((s) => s.type)).toEqual([
      "delay",
      "eq",
    ]);
    expect(delaysBefore.every((n) => n.disconnected || n.connections.length === 0)).toBe(
      true,
    );

    engine.setDocument(
      documentOf([
        track("vocal", {
          effectsChain: chainOf([effect("eq", ID_EQ)]),
        }),
      ]),
    );
    expect(engine.inspectTrackFx("vocal")?.slots.map((s) => s.type)).toEqual(["eq"]);

    engine.setDocument(documentOf([track("vocal")]));
    expect(engine.inspectTrackFx("vocal")?.insert).toBe("dry");
  });

  it("updates params in place without rebuilding structure", () => {
    const { host, created } = createTrackingHost();
    const { engine } = engineWith(host);
    engine.initialize();
    engine.setDocument(
      documentOf([
        track("vocal", {
          effectsChain: chainOf([effect("delay", ID_DELAY)]),
        }),
      ]),
    );
    const delayCount = created.filter((n) => n.kind === "delay").length;
    engine.setDocument(
      documentOf([
        track("vocal", {
          effectsChain: chainOf([
            effect("delay", ID_DELAY, {
              params: { ...defaultStudioFxParams("delay"), timeMs: 500, mix: 0.4 },
            }),
          ]),
        }),
      ]),
    );
    expect(created.filter((n) => n.kind === "delay").length).toBe(delayCount);
    const delay = created.filter((n) => n.kind === "delay").at(-1);
    expect(delay?.delayTime.value).toBeCloseTo(0.5);
  });

  it("disposes FX with track removal and engine dispose", () => {
    const { host, created } = createTrackingHost();
    const { engine } = engineWith(host);
    engine.initialize();
    engine.setDocument(
      documentOf([
        track("vocal", { effectsChain: chainOf([effect("reverb", ID_REV)]) }),
        track("beat"),
      ]),
    );
    const convolvers = created.filter((n) => n.kind === "convolver");
    engine.setDocument(documentOf([track("beat")]));
    expect(engine.inspectTrackFx("vocal")).toBeNull();
    expect(convolvers.every((n) => n.connections.length === 0)).toBe(true);
    engine.dispose();
    expect(engine.getLifecycle()).toBe("disposed");
  });
});

describe("P6.2 fail-closed", () => {
  it("unknown type and invalid params skip the slot and keep the rest", () => {
    const { host } = createTrackingHost();
    const { engine, errors } = engineWith(host);
    engine.initialize();
    engine.setDocument(
      documentOf([
        track("vocal", {
          effectsChain: {
            schemaVersion: 1,
            effects: [
              {
                id: ID_EQ,
                type: "autotune",
                enabled: true,
                params: {},
              },
              effect("eq", ID_COMP),
              {
                id: ID_DELAY,
                type: "delay",
                enabled: true,
                params: { mix: 2, timeMs: 250, feedback: 0.2 },
              },
            ],
          },
        }),
      ]),
    );
    const inspect = engine.inspectTrackFx("vocal");
    expect(inspect?.slots.map((s) => s.type)).toEqual(["unknown", "eq", "unknown"]);
    expect(inspect?.slots.map((s) => s.mode)).toEqual(["bypass", "process", "bypass"]);
    expect(errors).toContain("AUDIO_FX_UNKNOWN_TYPE");
    expect(errors).toContain("AUDIO_FX_INVALID_PARAMS");
  });

  it("unsupported schema dries the chain without throwing", () => {
    const { host } = createTrackingHost();
    const { engine, errors } = engineWith(host);
    engine.initialize();
    engine.setDocument(
      documentOf([
        track("vocal", { effectsChain: { schemaVersion: 9, effects: [] } }),
      ]),
    );
    expect(engine.inspectTrackFx("vocal")?.insert).toBe("dry");
    expect(errors).toContain("AUDIO_FX_CHAIN_UNSUPPORTED");
  });

  it("node construction failure skips the slot", () => {
    const { host } = createTrackingHost();
    const base = host.createContext();
    const codes: string[] = [];
    const handle = buildStudioTrackFxChain(
      {
        sampleRate: 48000,
        createGain: () => base.createGain(),
        createBiquadFilter: () => base.createBiquadFilter(),
        createDynamicsCompressor: () => base.createDynamicsCompressor(),
        createDelay: () => {
          throw new Error("no delay");
        },
        createConvolver: () => base.createConvolver(),
        createBuffer: (channels, length, sampleRate) =>
          base.createBuffer(channels, length, sampleRate),
      },
      chainOf([effect("delay", ID_DELAY), effect("eq", ID_EQ)]),
      (code) => codes.push(code),
    );
    expect(handle?.inspect().map((s) => s.type)).toEqual(["unknown", "eq"]);
    expect(codes).toContain("AUDIO_FX_NODE_FAILED");
  });
});

describe("P6.2 isolation / errors / no second engine", () => {
  it("extends P5.10 diagnostic codes", () => {
    expect(STUDIO_AUDIO_ERROR_CODES).toContain("AUDIO_FX_UNKNOWN_TYPE");
    expect(STUDIO_AUDIO_ERROR_CODES).toContain("AUDIO_FX_INVALID_PARAMS");
    expect(STUDIO_AUDIO_ERROR_CODES).toContain("AUDIO_FX_CHAIN_UNSUPPORTED");
    expect(STUDIO_AUDIO_ERROR_CODES).toContain("AUDIO_FX_NODE_FAILED");
  });

  it("does not import Mix, PlayerProvider, recording, or a second engine", () => {
    const files = [
      "src/lib/studio/studio-fx-graph.ts",
      "src/lib/studio/studio-audio-engine.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src).not.toMatch(/mix-graph/);
      expect(src).not.toMatch(/MixPanel/);
      expect(src).not.toMatch(/player-provider/);
      expect(src).not.toMatch(/PlayerProvider/);
      expect(src).not.toMatch(/getUserMedia/);
      expect(src).not.toMatch(/TrackAudioEngine/);
      expect(src).not.toMatch(/FxAudioEngine/);
    }
    const engineSrc = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-audio-engine.ts"),
      "utf8",
    );
    expect(engineSrc).toMatch(/buildStudioTrackFxChain/);
    expect(engineSrc).toMatch(/planVoicesAtPlayhead/);
    expect(engineSrc.split("class StudioAudioEngine").length).toBe(2);
  });
});
